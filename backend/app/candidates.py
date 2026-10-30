"""Candidate profile and job-submission API endpoints."""
from datetime import datetime
from typing import Literal

from fastapi import HTTPException

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.db_dependencies import get_db
from app.dependencies import get_current_user, require_permission
from app.models import (
    CANDIDATE_STATUSES,
    Candidate,
    CandidateStatusHistory,
    CandidateSubmission,
    Job,
    JobVendorAssignment,
    User,
)
from app.partner_access import clients_see_candidate_contacts, hide_clients_from, is_client_user

router = APIRouter(prefix="/candidates", tags=["Candidates"])


class CandidateDetails(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    total_experience: float | None = Field(default=None, ge=0)
    relevant_experience: float | None = Field(default=None, ge=0)
    current_employer: str | None = Field(default=None, max_length=200)
    current_location: str | None = Field(default=None, max_length=200)
    highest_qualification: str | None = Field(default=None, max_length=300)
    primary_skills: str | None = None
    resume_filename: str | None = Field(default=None, max_length=500)


class SubmissionCreate(CandidateDetails):
    job_id: int
    notes: str | None = None


class StatusUpdate(BaseModel):
    status: Literal[
        "Submitted", "Screening", "Shortlisted", "Sent to Client", "Interview Scheduled",
        "Selected", "Offer Accepted", "Joined", "Rejected", "Withdrawn",
        "Offer Declined"
    ]
    note: str | None = None


class CandidateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    phone: str | None
    total_experience: float | None
    relevant_experience: float | None
    current_employer: str | None
    current_location: str | None
    highest_qualification: str | None
    primary_skills: str | None
    resume_filename: str | None
    created_at: datetime


class StatusHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    old_status: str | None
    new_status: str
    changed_by_user_id: int
    changed_by_email: str | None = None
    note: str | None
    changed_at: datetime


class SubmissionResponse(BaseModel):
    id: int
    candidate_id: int
    candidate_name: str
    candidate_email: str | None  # None for client logins when contact details are hidden
    job_id: int
    job_title: str
    vendor_id: int | None
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime
    # Added so the UI can link a submission to its client and vendor, and show the
    # candidate profile, without needing vendors.manage / clients.manage access.
    client_id: int | None = None
    client_name: str | None = None
    vendor_name: str | None = None
    phone: str | None = None
    total_experience: float | None = None
    relevant_experience: float | None = None
    current_employer: str | None = None
    current_location: str | None = None
    highest_qualification: str | None = None
    primary_skills: str | None = None
    resume_filename: str | None = None
    # Original name of the uploaded resume file, if one is attached to this submission.
    resume_file_name: str | None = None


# Load everything _submission_response reads in one go (avoids a query per row).
def _submission_options():
    return (
        selectinload(CandidateSubmission.candidate),
        selectinload(CandidateSubmission.job).selectinload(Job.client),
        selectinload(CandidateSubmission.vendor),
    )


def _submission_response(
    item: CandidateSubmission, hide_client: bool = False, for_client: bool = False
) -> SubmissionResponse:
    response = _full_submission_response(item, hide_client)
    if not for_client:
        return response
    # Client logins: never the supplying partner or internal notes; contact details only if allowed.
    hidden = {"vendor_id": None, "vendor_name": None, "notes": None}
    if not clients_see_candidate_contacts():
        hidden.update({"candidate_email": None, "phone": None, "resume_filename": None, "resume_file_name": None})
    return response.model_copy(update=hidden)


def _full_submission_response(item: CandidateSubmission, hide_client: bool = False) -> SubmissionResponse:
    return SubmissionResponse(
        id=item.id,
        candidate_id=item.candidate_id,
        candidate_name=item.candidate.full_name,
        candidate_email=item.candidate.email,
        job_id=item.job_id,
        job_title=item.job.title,
        vendor_id=item.vendor_id,
        status=item.status,
        notes=item.notes,
        created_at=item.created_at,
        updated_at=item.updated_at,
        client_id=None if hide_client else item.job.client_id,
        client_name=None if hide_client or item.job.client is None else item.job.client.company_name,
        vendor_name=item.vendor.name if item.vendor is not None else None,
        phone=item.candidate.phone,
        total_experience=item.candidate.total_experience,
        relevant_experience=item.candidate.relevant_experience,
        current_employer=item.candidate.current_employer,
        current_location=item.candidate.current_location,
        highest_qualification=item.candidate.highest_qualification,
        primary_skills=item.candidate.primary_skills,
        resume_filename=item.candidate.resume_filename,
        resume_file_name=item.resume_file_name,
    )


def _sent_to_client_ids():
    """Submissions that have ever been sent to the client (the only ones a client may see)."""
    return select(CandidateStatusHistory.submission_id).where(
        CandidateStatusHistory.new_status == "Sent to Client"
    )


def _is_super_admin(user) -> bool:
    return any(role.name == "Super Admin" for role in getattr(user, "roles", []))


@router.post(
    "/submissions",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_candidate(
    payload: SubmissionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    _permission=Depends(require_permission("candidates.submit")),
):
    job = db.scalar(
        select(Job).where(
            Job.id == payload.job_id,
            Job.organization_id == current_user.organization_id,
        )
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "open" or not job.is_active:
        raise HTTPException(status_code=409, detail="This job is not open for submissions.")

    vendor_id = getattr(current_user, "vendor_id", None)
    is_vendor_user = vendor_id is not None and not _is_super_admin(current_user)

    if is_vendor_user:
        assignment = db.scalar(
            select(JobVendorAssignment).where(
                JobVendorAssignment.job_id == job.id,
                JobVendorAssignment.vendor_id == vendor_id,
                JobVendorAssignment.is_active.is_(True),
            )
        )
        if assignment is None:
            raise HTTPException(
                status_code=403,
                detail="Your vendor is not actively assigned to this job",
            )

    email = str(payload.email).strip().lower()

    candidate = db.scalar(
        select(Candidate).where(
            Candidate.organization_id == current_user.organization_id,
            Candidate.email == email,
        )
    )

    # Create the candidate profile if it does not already exist.
    if candidate is None:
        candidate = Candidate(
            organization_id=current_user.organization_id,
            full_name=payload.full_name.strip(),
            email=email,
            phone=payload.phone,
            total_experience=payload.total_experience,
            relevant_experience=payload.relevant_experience,
            current_employer=payload.current_employer,
            current_location=payload.current_location,
            highest_qualification=payload.highest_qualification,
            primary_skills=payload.primary_skills,
            resume_filename=payload.resume_filename,
        )
        db.add(candidate)

        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            # Another request may have created this candidate concurrently.
            candidate = db.scalar(
                select(Candidate).where(
                    Candidate.organization_id == current_user.organization_id,
                    Candidate.email == email,
                )
            )
            if candidate is None:
                raise HTTPException(
                    status_code=409,
                    detail="Could not create the candidate due to a data conflict.",
                )

    # Check for an existing submission before attempting the insert.
    existing_submission = db.scalar(
        select(CandidateSubmission).where(
            CandidateSubmission.candidate_id == candidate.id,
            CandidateSubmission.job_id == job.id,
        )
    )
    if existing_submission is not None:
        raise HTTPException(
            status_code=409,
            detail="This candidate has already been submitted for this job.",
        )

    submission = CandidateSubmission(
        organization_id=current_user.organization_id,
        candidate_id=candidate.id,
        job_id=job.id,
        vendor_id=vendor_id,
        submitted_by_user_id=current_user.id,
        status="Submitted",
        notes=payload.notes,
    )
    db.add(submission)

    try:
        db.flush()

        db.add(
            CandidateStatusHistory(
                submission_id=submission.id,
                old_status=None,
                new_status="Submitted",
                changed_by_user_id=current_user.id,
                note=payload.notes,
            )
        )

        db.commit()

    except IntegrityError as exc:
        db.rollback()

        error_text = str(exc.orig)

        if "uq_candidate_submissions_candidate_job" in error_text:
            raise HTTPException(
                status_code=409,
                detail="This candidate has already been submitted for this job.",
            ) from exc

        if "uq_candidates_organization_email" in error_text:
            raise HTTPException(
                status_code=409,
                detail="A candidate with this email already exists in the organization.",
            ) from exc

        # Do not misreport unrelated database errors as duplicate submissions.
        raise

    db.refresh(submission)
    submission.candidate = candidate
    submission.job = job

    return _submission_response(submission, hide_clients_from(current_user))


@router.get("/permissions")
def get_candidate_permissions(
    current_user=Depends(get_current_user),
    _permission=Depends(require_permission("candidates.view")),
):
    """What the signed-in user may do, so the UI only offers allowed actions."""
    codes = {
        permission.code
        for role in getattr(current_user, "roles", [])
        for permission in role.permissions
    }
    vendor_id = getattr(current_user, "vendor_id", None)
    is_vendor_user = vendor_id is not None and not _is_super_admin(current_user)
    return {
        "can_submit": "candidates.submit" in codes,
        "can_update_status": "candidates.status.update" in codes and not is_vendor_user,
        "is_vendor_user": is_vendor_user,
        "can_see_clients": not hide_clients_from(current_user),
        "is_client_user": is_client_user(current_user),
        "can_client_review": is_client_user(current_user) and "candidates.client_review" in codes,
    }


@router.get("", response_model=list[CandidateResponse])
def list_candidates(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    _permission=Depends(require_permission("candidates.view")),
):
    if is_client_user(current_user):
        raise HTTPException(status_code=403, detail="You do not have permission to perform this action")
    query = select(Candidate).where(
        Candidate.organization_id == current_user.organization_id
    ).order_by(Candidate.created_at.desc())
    vendor_id = getattr(current_user, "vendor_id", None)
    if vendor_id is not None and not _is_super_admin(current_user):
        # A vendor user may only see candidates their own vendor submitted.
        query = query.where(
            Candidate.id.in_(
                select(CandidateSubmission.candidate_id).where(
                    CandidateSubmission.vendor_id == vendor_id
                )
            )
        )
    return list(db.scalars(query).all())


@router.get("/submissions", response_model=list[SubmissionResponse])
def list_submissions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    _permission=Depends(require_permission("candidates.view")),
):
    query = (
        select(CandidateSubmission)
        .options(*_submission_options())
        .where(CandidateSubmission.organization_id == current_user.organization_id)
        .order_by(CandidateSubmission.created_at.desc())
    )
    if is_client_user(current_user):
        # Only candidates your team sent to this client, for this client's own jobs.
        query = query.join(Job, Job.id == CandidateSubmission.job_id).where(
            Job.client_id == current_user.client_id,
            Job.is_active.is_(True),
            CandidateSubmission.id.in_(_sent_to_client_ids()),
        )
        return [_submission_response(item, for_client=True) for item in db.scalars(query).all()]
    vendor_id = getattr(current_user, "vendor_id", None)
    if vendor_id is not None and not _is_super_admin(current_user):
        query = query.where(CandidateSubmission.vendor_id == vendor_id)
    hide = hide_clients_from(current_user)
    return [_submission_response(item, hide) for item in db.scalars(query).all()]


@router.patch("/submissions/{submission_id}/status", response_model=SubmissionResponse)
def update_submission_status(
    submission_id: int,
    payload: StatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    _permission=Depends(require_permission("candidates.status.update")),
):
    item = db.scalar(
        select(CandidateSubmission)
        .options(*_submission_options())
        .where(
            CandidateSubmission.id == submission_id,
            CandidateSubmission.organization_id == current_user.organization_id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Candidate submission not found")

    vendor_id = getattr(current_user, "vendor_id", None)
    if vendor_id is not None and not _is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Vendors cannot change submission status")

    if payload.status == "Sent to Client" and item.job.client_id is None:
        raise HTTPException(
            status_code=409,
            detail="This job is not linked to a client, so the candidate cannot be sent to a client.",
        )

    old_status = item.status
    item.status = payload.status
    item.updated_at = datetime.utcnow()
    db.add(
        CandidateStatusHistory(
            submission_id=item.id,
            old_status=old_status,
            new_status=payload.status,
            changed_by_user_id=current_user.id,
            note=payload.note,
        )
    )
    db.commit()
    db.refresh(item)
    return _submission_response(item, hide_clients_from(current_user))


@router.get("/submissions/{submission_id}/history", response_model=list[StatusHistoryResponse])
def get_submission_history(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    _permission=Depends(require_permission("candidates.view")),
):
    item = db.scalar(
        select(CandidateSubmission).where(
            CandidateSubmission.id == submission_id,
            CandidateSubmission.organization_id == current_user.organization_id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Candidate submission not found")

    if is_client_user(current_user):
        sent = db.scalar(select(func.count()).select_from(_sent_to_client_ids().where(
            CandidateStatusHistory.submission_id == item.id).subquery()))
        if not sent or item.job.client_id != current_user.client_id:
            raise HTTPException(status_code=404, detail="Candidate submission not found")

    vendor_id = getattr(current_user, "vendor_id", None)
    if vendor_id is not None and not _is_super_admin(current_user) and item.vendor_id != vendor_id:
        raise HTTPException(status_code=403, detail="You cannot view this submission")

    history = db.scalars(
        select(CandidateStatusHistory)
        .where(CandidateStatusHistory.submission_id == submission_id)
        .order_by(CandidateStatusHistory.changed_at.asc())
    ).all()
    people = {
        user_id: (email, client_id)
        for user_id, email, client_id in db.execute(
            select(User.id, User.email, User.client_id).where(
                User.id.in_({entry.changed_by_user_id for entry in history})
            )
        ).all()
    }
    emails = {user_id: email for user_id, (email, _client) in people.items()}

    if is_client_user(current_user):
        first_sent = next((i for i, entry in enumerate(history) if entry.new_status == "Sent to Client"), len(history))
        result = []
        for entry in history[first_sent:]:
            own_company = people.get(entry.changed_by_user_id, (None, None))[1] == current_user.client_id
            result.append(StatusHistoryResponse(
                id=entry.id,
                old_status=entry.old_status if entry is not history[first_sent] else None,
                new_status=entry.new_status,
                changed_by_user_id=entry.changed_by_user_id if own_company else 0,
                changed_by_email=emails.get(entry.changed_by_user_id) if own_company else "Recruitment team",
                note=entry.note if own_company else None,
                changed_at=entry.changed_at,
            ))
        return result
    return [
        StatusHistoryResponse(
            id=entry.id,
            old_status=entry.old_status,
            new_status=entry.new_status,
            changed_by_user_id=entry.changed_by_user_id,
            changed_by_email=emails.get(entry.changed_by_user_id),
            note=entry.note,
            changed_at=entry.changed_at,
        )
        for entry in history
    ]


# What a client may decide, depending on where the candidate is now.
CLIENT_DECISIONS = {
    "Sent to Client": {"Interview Scheduled", "Selected", "Rejected"},
    "Interview Scheduled": {"Selected", "Rejected"},
}


class ClientDecision(BaseModel):
    decision: Literal["Interview Scheduled", "Selected", "Rejected"]
    note: str | None = Field(default=None, max_length=2000)


@router.post("/submissions/{submission_id}/client-decision", response_model=SubmissionResponse)
def record_client_decision(
    submission_id: int,
    payload: ClientDecision,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("candidates.client_review")),
):
    """A client accepts (interview / select) or rejects a candidate sent to them."""
    if not is_client_user(current_user) or current_user.client_id is None:
        raise HTTPException(status_code=403, detail="Only client accounts can record a client decision")

    item = db.scalar(
        select(CandidateSubmission)
        .options(*_submission_options())
        .where(
            CandidateSubmission.id == submission_id,
            CandidateSubmission.organization_id == current_user.organization_id,
            CandidateSubmission.id.in_(_sent_to_client_ids()),
        )
    )
    if item is None or item.job.client_id != current_user.client_id:
        raise HTTPException(status_code=404, detail="Candidate submission not found")

    if payload.decision not in CLIENT_DECISIONS.get(item.status, set()):
        raise HTTPException(
            status_code=409,
            detail=f"This candidate is now '{item.status}', so that decision is no longer available.",
        )

    old_status = item.status
    item.status = payload.decision
    item.updated_at = datetime.utcnow()
    db.add(
        CandidateStatusHistory(
            submission_id=item.id,
            old_status=old_status,
            new_status=payload.decision,
            changed_by_user_id=current_user.id,
            note=payload.note,
        )
    )
    db.commit()
    db.refresh(item)
    return _submission_response(item, for_client=True)


# ---------------------------------------------------------------------------
# Resumes: read a resume to pre-fill the form, attach it, download it
# ---------------------------------------------------------------------------

import os as _os
import uuid as _uuid
from pathlib import Path as _Path

from fastapi import File, UploadFile
from fastapi.responses import FileResponse

from app.resume_parser import parse_resume

RESUME_UPLOAD_DIR = _Path(
    _os.getenv("RESUME_UPLOAD_DIR")
    or _Path(__file__).resolve().parent.parent / "uploads" / "resumes"
)
MAX_RESUME_BYTES = 10 * 1024 * 1024
RESUME_TYPES = {
    ".pdf": ("application/pdf", b"%PDF-"),
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", b"PK\x03\x04"),
}


async def _read_resume_upload(file: UploadFile) -> tuple[str, str, bytes]:
    original = _Path(file.filename or "").name
    extension = _Path(original).suffix.lower()
    if extension not in RESUME_TYPES:
        raise HTTPException(status_code=415, detail="Upload the resume as a PDF or DOCX file.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=413, detail="The resume must be 10 MB or smaller.")
    if not content.startswith(RESUME_TYPES[extension][1]):
        raise HTTPException(status_code=422, detail="The file content does not match its extension. Please upload a real PDF or DOCX.")
    return original or f"resume{extension}", extension, content


def _resume_path(stored_name: str | None) -> _Path | None:
    if not stored_name:
        return None
    base = RESUME_UPLOAD_DIR.resolve()
    candidate = (base / stored_name).resolve()
    return candidate if base in candidate.parents else None


@router.post("/parse-resume")
async def parse_resume_upload(
    file: UploadFile = File(...),
    current_user=Depends(require_permission("candidates.submit")),
):
    """Suggest candidate form values from a resume. Nothing is stored."""
    original, _extension, content = await _read_resume_upload(file)
    try:
        fields = parse_resume(original, content)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail="Unable to read text from this resume. It may be a scanned image; please fill in the details manually.",
        ) from exc
    return {"fields": fields, "filled": [name for name, value in fields.items() if value not in (None, "")]}


def _submission_for_resume(db: Session, submission_id: int, current_user) -> CandidateSubmission:
    item = db.scalar(
        select(CandidateSubmission)
        .options(*_submission_options())
        .where(
            CandidateSubmission.id == submission_id,
            CandidateSubmission.organization_id == current_user.organization_id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Candidate submission not found")
    vendor_id = getattr(current_user, "vendor_id", None)
    if vendor_id is not None and not _is_super_admin(current_user) and item.vendor_id != vendor_id:
        raise HTTPException(status_code=404, detail="Candidate submission not found")
    return item


@router.post("/submissions/{submission_id}/resume", response_model=SubmissionResponse)
async def upload_submission_resume(
    submission_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("candidates.submit")),
):
    """Attach (or replace) the resume file of a submission you made."""
    original, extension, content = await _read_resume_upload(file)
    item = _submission_for_resume(db, submission_id, current_user)

    RESUME_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{_uuid.uuid4().hex}{extension}"
    (RESUME_UPLOAD_DIR / stored_name).write_bytes(content)
    previous = item.resume_file_path
    item.resume_file_name = original[:300]
    item.resume_file_path = stored_name
    item.resume_content_type = RESUME_TYPES[extension][0]
    try:
        db.commit()
    except Exception:
        db.rollback()
        path = _resume_path(stored_name)
        if path is not None:
            path.unlink(missing_ok=True)
        raise
    db.refresh(item)
    old = _resume_path(previous)
    if old is not None:
        old.unlink(missing_ok=True)
    return _submission_response(item, hide_clients_from(current_user))


@router.get("/submissions/{submission_id}/resume")
def download_submission_resume(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    _permission=Depends(require_permission("candidates.view")),
):
    """Staff: any submission. Partners: their own. Clients: only candidates sent to them,
    and only when clients may see candidate contact details (a resume contains them)."""
    if is_client_user(current_user):
        item = db.scalar(
            select(CandidateSubmission)
            .options(*_submission_options())
            .where(
                CandidateSubmission.id == submission_id,
                CandidateSubmission.organization_id == current_user.organization_id,
                CandidateSubmission.id.in_(_sent_to_client_ids()),
            )
        )
        if item is None or item.job.client_id != current_user.client_id or not item.job.is_active:
            raise HTTPException(status_code=404, detail="Candidate submission not found")
        if not clients_see_candidate_contacts():
            raise HTTPException(status_code=403, detail="Resumes are shared by your recruitment partner.")
    else:
        item = _submission_for_resume(db, submission_id, current_user)

    path = _resume_path(item.resume_file_path)
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="No resume file is attached to this submission.")
    return FileResponse(
        path,
        media_type=item.resume_content_type or "application/octet-stream",
        filename=item.resume_file_name or path.name,
        content_disposition_type="inline",
        headers={"X-Content-Type-Options": "nosniff"},
    )
