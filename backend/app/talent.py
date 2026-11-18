"""TalentVault: DM&I's own resume bank.

Every candidate ever submitted, plus resumes added straight to the database, searchable by
keywords (including the text inside the resume), location, experience, employer and more.
Only the internal team (Super Admin and TAS) can open it; partners and clients cannot.
"""
import math
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app import file_storage
from app.candidates import (
    MAX_RESUME_BYTES,
    RESUME_TYPES,
    RESUME_UPLOAD_DIR,
    CandidateDetails,
    _read_resume_upload,
)
from app.db_dependencies import get_db
from app.dependencies import require_permission
from app.models import Candidate, CandidateSubmission, Job, User
from app.partner_access import is_client_user, is_partner_user
from app.resume_parser import extract_text_variants, parse_resume

router = APIRouter(prefix="/talent", tags=["TalentVault"])

PAGE_SIZES = (20, 40, 80)
MAX_BULK_FILES = 25
SOURCE_UPLOAD = "Added to TalentVault"
SOURCE_BULK = "Bulk upload"


def _team_only(user: User) -> User:
    if is_partner_user(user) or is_client_user(user):
        raise HTTPException(status_code=403, detail="TalentVault is available to the DM&I team only.")
    return user


def team_viewer(user: User = Depends(require_permission("candidates.view"))) -> User:
    return _team_only(user)


def team_editor(user: User = Depends(require_permission("candidates.submit"))) -> User:
    return _team_only(user)


def resume_text_of(filename: str, content: bytes) -> str | None:
    """Plain text of a resume, kept so TalentVault can search inside it."""
    try:
        variants = extract_text_variants(filename, content)
    except Exception:
        return None
    if not variants:
        return None
    text = "\n".join(variants[0]).strip()
    return text[:200_000] or None


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def _terms(q: str | None) -> list[str]:
    """'java, spring boot ; aws' -> ['java', 'spring boot', 'aws']"""
    if not q:
        return []
    return [part.strip() for part in re.split(r"[,;]+", q) if part.strip()][:12]


def _like(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _skills(text: str | None) -> list[str]:
    if not text:
        return []
    seen: list[str] = []
    for part in re.split(r"[,|;\n•]+", text):
        part = part.strip(" .-")
        if part and part.lower() not in {s.lower() for s in seen}:
            seen.append(part)
    return seen[:30]


def _snippet(text: str | None, terms: list[str]) -> str | None:
    """A short piece of the resume around the first keyword it contains."""
    if not text or not terms:
        return None
    lower = text.lower()
    for term in terms:
        at = lower.find(term.lower())
        if at >= 0:
            start, end = max(0, at - 70), min(len(text), at + len(term) + 90)
            piece = re.sub(r"\s+", " ", text[start:end]).strip()
            piece = re.sub(r"\b[A-Z]{5}\d{4}[A-Z]\b", "••••••••••", piece)   # never show a PAN in a snippet
            return ("…" if start > 0 else "") + piece + ("…" if end < len(text) else "")
    return None


class TalentCard(BaseModel):
    id: int
    full_name: str
    email: str
    phone: str | None
    total_experience: float | None
    relevant_experience: float | None
    current_location: str | None
    current_employer: str | None
    highest_qualification: str | None
    skills: list[str]
    source: str | None
    added_by: str | None
    created_at: datetime
    updated_at: datetime | None
    submissions: int
    last_job_title: str | None
    last_status: str | None
    last_submitted_at: datetime | None
    cv_kind: str | None          # "profile" (TalentVault file) or "submission" (from a job submission)
    cv_id: int | None            # candidate id or submission id, depending on cv_kind
    cv_name: str | None
    resume_match: str | None     # where a keyword was found inside the resume text


class TalentSearchResult(BaseModel):
    total: int
    page: int
    pages: int
    page_size: int
    items: list[TalentCard]


def _card(candidate: Candidate, terms: list[str]) -> TalentCard:
    subs = sorted(candidate.submissions, key=lambda s: s.created_at, reverse=True)
    last = subs[0] if subs else None
    cv_kind = cv_id = cv_name = None
    if candidate.profile_resume_path:
        cv_kind, cv_id, cv_name = "profile", candidate.id, candidate.profile_resume_name
    else:
        with_file = next((s for s in subs if s.resume_file_path), None)
        if with_file is not None:
            cv_kind, cv_id, cv_name = "submission", with_file.id, with_file.resume_file_name
    fields_text = " ".join(filter(None, [candidate.full_name, candidate.primary_skills, candidate.current_employer,
                                        candidate.highest_qualification, candidate.current_location])).lower()
    hidden_terms = [t for t in terms if t.lower() not in fields_text]
    added_by = (candidate.added_by.full_name or candidate.added_by.email) if candidate.added_by else None
    return TalentCard(
        id=candidate.id,
        full_name=candidate.full_name,
        email=candidate.email,
        phone=candidate.phone,
        total_experience=candidate.total_experience,
        relevant_experience=candidate.relevant_experience,
        current_location=candidate.current_location,
        current_employer=candidate.current_employer,
        highest_qualification=candidate.highest_qualification,
        skills=_skills(candidate.primary_skills),
        source=candidate.source or "Job submission",
        added_by=added_by,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
        submissions=len(subs),
        last_job_title=last.job.title if last and last.job else None,
        last_status=last.status if last else None,
        last_submitted_at=last.created_at if last else None,
        cv_kind=cv_kind,
        cv_id=cv_id,
        cv_name=cv_name,
        resume_match=_snippet(candidate.resume_text, hidden_terms),
    )


@router.get("/search", response_model=TalentSearchResult)
def search_talent(
    q: str | None = Query(default=None, max_length=300, description="Keywords, comma separated"),
    match: str = Query(default="all", pattern="^(all|any)$"),
    location: str | None = Query(default=None, max_length=100),
    min_exp: float | None = Query(default=None, ge=0, le=60),
    max_exp: float | None = Query(default=None, ge=0, le=60),
    employer: str | None = Query(default=None, max_length=100),
    qualification: str | None = Query(default=None, max_length=100),
    has_cv: bool = False,
    active_days: int | None = Query(default=None, ge=1, le=3650),
    sort: str = Query(default="recent", pattern="^(recent|experience|name)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(team_viewer),
):
    if page_size not in PAGE_SIZES:
        page_size = 20
    terms = _terms(q)
    conditions = [Candidate.organization_id == current_user.organization_id]
    haystack = func.concat_ws(
        " ", Candidate.full_name, Candidate.email, Candidate.phone, Candidate.primary_skills,
        Candidate.current_employer, Candidate.highest_qualification, Candidate.current_location, Candidate.resume_text,
    )
    if terms:
        term_conditions = [haystack.ilike(_like(term), escape="\\") for term in terms]
        if match == "any":
            conditions.append(or_(*term_conditions))
        else:
            conditions.extend(term_conditions)
    if location:
        conditions.append(Candidate.current_location.ilike(_like(location.strip()), escape="\\"))
    if employer:
        conditions.append(Candidate.current_employer.ilike(_like(employer.strip()), escape="\\"))
    if qualification:
        conditions.append(Candidate.highest_qualification.ilike(_like(qualification.strip()), escape="\\"))
    if min_exp is not None:
        conditions.append(Candidate.total_experience >= min_exp)
    if max_exp is not None:
        conditions.append(Candidate.total_experience <= max_exp)
    if has_cv:
        conditions.append(or_(
            Candidate.profile_resume_path.is_not(None),
            exists().where(CandidateSubmission.candidate_id == Candidate.id, CandidateSubmission.resume_file_path.is_not(None)),
        ))
    if active_days:
        since = datetime.now(timezone.utc) - timedelta(days=active_days)
        conditions.append(or_(
            Candidate.updated_at >= since,
            exists().where(CandidateSubmission.candidate_id == Candidate.id, CandidateSubmission.updated_at >= since),
        ))

    total = db.scalar(select(func.count()).select_from(Candidate).where(*conditions)) or 0
    pages = max(1, math.ceil(total / page_size))
    page = min(page, pages)
    order = {
        "recent": [func.coalesce(Candidate.updated_at, Candidate.created_at).desc(), Candidate.id.desc()],
        "experience": [Candidate.total_experience.desc().nulls_last(), Candidate.id.desc()],
        "name": [func.lower(Candidate.full_name), Candidate.id],
    }[sort]
    rows = db.scalars(
        select(Candidate)
        .options(
            selectinload(Candidate.submissions).selectinload(CandidateSubmission.job),
            selectinload(Candidate.added_by),
        )
        .where(*conditions)
        .order_by(*order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return TalentSearchResult(total=total, page=page, pages=pages, page_size=page_size,
                              items=[_card(c, terms) for c in rows])


@router.get("/summary")
def talent_summary(db: Session = Depends(get_db), current_user: User = Depends(team_viewer)):
    org = Candidate.organization_id == current_user.organization_id
    since = datetime.now(timezone.utc) - timedelta(days=30)
    return {
        "profiles": db.scalar(select(func.count()).select_from(Candidate).where(org)) or 0,
        "added_last_30_days": db.scalar(select(func.count()).select_from(Candidate).where(org, Candidate.created_at >= since)) or 0,
        "with_resume_text": db.scalar(select(func.count()).select_from(Candidate).where(org, Candidate.resume_text.is_not(None))) or 0,
    }


# ---------------------------------------------------------------------------
# Adding profiles
# ---------------------------------------------------------------------------

def _clean_email(value: str) -> str:
    return str(value).strip().lower()


def _check_pan_free(db: Session, org: int, pan: str | None, except_id: int | None = None) -> None:
    if not pan:
        return
    clash = db.scalar(select(Candidate).where(Candidate.organization_id == org, Candidate.pan_number == pan,
                                              Candidate.id != (except_id or 0)))
    if clash is not None:
        raise HTTPException(status_code=409, detail=f"This PAN number is already in TalentVault ({clash.full_name}).")


@router.post("/candidates", response_model=TalentCard, status_code=201)
def add_profile(
    payload: CandidateDetails,
    db: Session = Depends(get_db),
    current_user: User = Depends(team_editor),
):
    """Add a candidate to TalentVault without submitting them to a job."""
    email = _clean_email(payload.email)
    existing = db.scalar(select(Candidate).where(Candidate.organization_id == current_user.organization_id,
                                                 Candidate.email == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail=f"{existing.full_name} ({email}) is already in TalentVault.")
    _check_pan_free(db, current_user.organization_id, payload.pan_number)
    candidate = Candidate(
        organization_id=current_user.organization_id,
        full_name=payload.full_name.strip(),
        email=email,
        phone=payload.phone,
        pan_number=payload.pan_number,
        total_experience=payload.total_experience,
        relevant_experience=payload.relevant_experience,
        current_employer=payload.current_employer,
        current_location=payload.current_location,
        highest_qualification=payload.highest_qualification,
        primary_skills=payload.primary_skills,
        resume_filename=payload.resume_filename,
        source=SOURCE_UPLOAD,
        added_by_user_id=current_user.id,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return _card(candidate, [])


def _attach_profile_resume(db: Session, candidate: Candidate, original: str, extension: str, content: bytes) -> str | None:
    """Store the file on the profile and index its text. Returns the replaced file key, if any."""
    key = file_storage.store(db, RESUME_UPLOAD_DIR, extension, content, RESUME_TYPES[extension][0])
    previous = candidate.profile_resume_path
    candidate.profile_resume_name = original[:300]
    candidate.profile_resume_path = key
    candidate.profile_resume_type = RESUME_TYPES[extension][0]
    text = resume_text_of(original, content)
    if text:
        candidate.resume_text = text
    candidate.updated_at = datetime.now(timezone.utc)
    return previous


def _team_candidate(db: Session, candidate_id: int, user: User) -> Candidate:
    candidate = db.scalar(select(Candidate).options(selectinload(Candidate.submissions).selectinload(CandidateSubmission.job))
                          .where(Candidate.id == candidate_id, Candidate.organization_id == user.organization_id))
    if candidate is None:
        raise HTTPException(status_code=404, detail="Profile not found in TalentVault.")
    return candidate


@router.post("/candidates/{candidate_id}/resume", response_model=TalentCard)
async def upload_profile_resume(
    candidate_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(team_editor),
):
    original, extension, content = await _read_resume_upload(file)
    candidate = _team_candidate(db, candidate_id, current_user)
    previous = _attach_profile_resume(db, candidate, original, extension, content)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    if previous:
        file_storage.discard_old(db, RESUME_UPLOAD_DIR, previous)
    db.refresh(candidate)
    return _card(candidate, [])


@router.get("/candidates/{candidate_id}/resume")
def download_profile_resume(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(team_viewer),
):
    candidate = _team_candidate(db, candidate_id, current_user)
    response = file_storage.file_response(
        db, RESUME_UPLOAD_DIR, candidate.profile_resume_path,
        candidate.profile_resume_type or "application/octet-stream", candidate.profile_resume_name or "resume",
    )
    if response is None:
        raise HTTPException(status_code=404, detail="No resume file is kept on this profile.")
    return response


@router.post("/bulk")
async def bulk_upload(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(team_editor),
):
    """Add many resumes at once. Each file becomes a profile when an email can be read from it."""
    if len(files) > MAX_BULK_FILES:
        raise HTTPException(status_code=413, detail=f"Upload up to {MAX_BULK_FILES} resumes at a time.")
    results = []
    for upload in files:
        name = upload.filename or "resume"
        try:
            original, extension, content = await _read_resume_upload(upload)
        except HTTPException as exc:
            results.append({"file": name, "status": "error", "message": exc.detail})
            continue
        try:
            fields = parse_resume(original, content)
        except Exception:
            fields = {}
        email = (fields.get("email") or "").strip().lower()
        if not email:
            results.append({"file": name, "status": "error",
                            "message": "No email address found in this resume. Add it with Add resume instead."})
            continue
        existing = db.scalar(select(Candidate).where(Candidate.organization_id == current_user.organization_id,
                                                     Candidate.email == email))
        if existing is not None:
            # Keep the profile but make its resume searchable if it was not already.
            if not existing.profile_resume_path:
                _attach_profile_resume(db, existing, original, extension, content)
                db.commit()
                results.append({"file": name, "status": "updated", "candidate_id": existing.id,
                                "message": f"{existing.full_name} was already in TalentVault; resume attached."})
            else:
                results.append({"file": name, "status": "skipped", "candidate_id": existing.id,
                                "message": f"{existing.full_name} is already in TalentVault."})
            continue
        pan = fields.get("pan_number")
        if pan and db.scalar(select(Candidate.id).where(Candidate.organization_id == current_user.organization_id,
                                                        Candidate.pan_number == pan)):
            pan = None   # never block a bulk upload on a PAN clash; leave it blank for review
        candidate = Candidate(
            organization_id=current_user.organization_id,
            full_name=(fields.get("full_name") or email.split("@")[0]).strip()[:200],
            email=email,
            phone=fields.get("phone"),
            pan_number=pan,
            total_experience=fields.get("total_experience"),
            relevant_experience=fields.get("relevant_experience"),
            current_employer=fields.get("current_employer"),
            current_location=fields.get("current_location"),
            highest_qualification=fields.get("highest_qualification"),
            primary_skills=fields.get("primary_skills"),
            source=SOURCE_BULK,
            added_by_user_id=current_user.id,
        )
        db.add(candidate)
        db.flush()
        _attach_profile_resume(db, candidate, original, extension, content)
        if candidate.total_experience is None and candidate.resume_text and re.search(r"\bfresher\b", candidate.resume_text, re.I):
            candidate.total_experience = 0
        db.commit()
        results.append({"file": name, "status": "added", "candidate_id": candidate.id,
                        "message": f"Added {candidate.full_name}."})
    summary = {key: sum(1 for r in results if r["status"] == key) for key in ("added", "updated", "skipped", "error")}
    return {"results": results, **summary}


@router.post("/reindex")
def reindex_resumes(
    db: Session = Depends(get_db),
    current_user: User = Depends(team_editor),
):
    """Read the text of resumes already attached to job submissions, so old profiles become searchable."""
    org = current_user.organization_id
    candidates = db.scalars(
        select(Candidate).options(selectinload(Candidate.submissions))
        .where(Candidate.organization_id == org, Candidate.resume_text.is_(None))
    ).all()
    indexed = 0
    for candidate in candidates:
        source = None
        if candidate.profile_resume_path:
            source = (candidate.profile_resume_path, candidate.profile_resume_name)
        else:
            sub = next((s for s in sorted(candidate.submissions, key=lambda s: s.created_at, reverse=True)
                        if s.resume_file_path), None)
            if sub is not None:
                source = (sub.resume_file_path, sub.resume_file_name)
        if source is None:
            continue
        content = file_storage.read_bytes(db, RESUME_UPLOAD_DIR, source[0])
        if not content:
            continue
        text = resume_text_of(source[1] or "resume.pdf", content)
        if text:
            candidate.resume_text = text
            indexed += 1
    db.commit()
    return {"indexed": indexed, "checked": len(candidates)}
