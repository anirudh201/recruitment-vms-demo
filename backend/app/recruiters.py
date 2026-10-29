"""Recruiter performance: who owns which positions, and how many closures each recruiter has.

A closure is a candidate on a recruiter's position whose current status is Selected,
Offer Accepted or Joined. It is dated by the first time the candidate reached one of
those stages. Deactivated jobs (e.g. test data) are left out.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db_dependencies import get_db
from app.dependencies import require_permission
from app.models import (
    CandidateStatusHistory,
    CandidateSubmission,
    Job,
    JobVendorAssignment,
    Role,
    User,
    Vendor,
)
from app.partner_access import is_client_user, is_partner_user

router = APIRouter(prefix="/recruiters", tags=["Recruiters"])

CLOSED_STATUSES = ("Selected", "Offer Accepted", "Joined")
IN_PROCESS_STATUSES = ("Submitted", "Screening", "Shortlisted", "Sent to Client", "Interview Scheduled")


def _display_name(user: User) -> str:
    return user.full_name or user.email


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@router.get("/performance")
def recruiter_performance(
    start: datetime | None = Query(default=None, description="Count closures from this moment (inclusive)"),
    end: datetime | None = Query(default=None, description="…up to this moment (exclusive)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("candidates.view")),
):
    """Every active recruiter with their positions, clients, partners and closures.

    For your team only: partner and client logins cannot see this.
    """
    if is_partner_user(current_user) or is_client_user(current_user):
        raise HTTPException(status_code=403, detail="You do not have permission to perform this action")
    org = current_user.organization_id
    start, end = _as_utc(start), _as_utc(end)

    recruiters = db.scalars(
        select(User)
        .join(User.roles)
        .where(User.organization_id == org, User.is_active.is_(True), Role.name == "Recruiter")
        .order_by(User.id)
    ).unique().all()
    recruiter_ids = [user.id for user in recruiters]

    jobs = db.scalars(
        select(Job)
        .options(selectinload(Job.client))
        .where(Job.organization_id == org, Job.is_active.is_(True), Job.recruiter_id.in_(recruiter_ids or [-1]))
        .order_by(Job.id.desc())
    ).all()
    job_ids = [job.id for job in jobs]

    submissions = db.scalars(
        select(CandidateSubmission)
        .options(selectinload(CandidateSubmission.candidate), selectinload(CandidateSubmission.vendor))
        .where(CandidateSubmission.job_id.in_(job_ids or [-1]))
    ).all()
    first_closed = dict(
        db.execute(
            select(CandidateStatusHistory.submission_id, func.min(CandidateStatusHistory.changed_at))
            .where(
                CandidateStatusHistory.submission_id.in_([item.id for item in submissions] or [-1]),
                CandidateStatusHistory.new_status.in_(CLOSED_STATUSES),
            )
            .group_by(CandidateStatusHistory.submission_id)
        ).all()
    )
    assigned_partners = db.execute(
        select(JobVendorAssignment.job_id, Vendor.id, Vendor.name)
        .join(Vendor, Vendor.id == JobVendorAssignment.vendor_id)
        .where(JobVendorAssignment.job_id.in_(job_ids or [-1]), JobVendorAssignment.is_active.is_(True))
    ).all()

    def in_period(moment: datetime | None) -> bool:
        moment = _as_utc(moment)
        if moment is None:
            return False
        return (start is None or moment >= start) and (end is None or moment < end)

    result = []
    for recruiter in recruiters:
        own_jobs = [job for job in jobs if job.recruiter_id == recruiter.id]
        own_job_ids = {job.id for job in own_jobs}
        own_subs = [item for item in submissions if item.job_id in own_job_ids]
        closed = [item for item in own_subs if item.status in CLOSED_STATUSES]
        closed_in_period = [item for item in closed if in_period(first_closed.get(item.id))]

        positions = []
        for job in own_jobs:
            job_subs = [item for item in own_subs if item.job_id == job.id]
            positions.append({
                "id": job.id,
                "title": job.title,
                "status": job.status,
                "client_id": job.client_id,
                "client_name": job.client.company_name if job.client is not None else None,
                "openings": job.openings,
                "submissions": len(job_subs),
                "closures": sum(1 for item in job_subs if item.status in CLOSED_STATUSES),
            })

        clients: dict[int, dict] = {}
        for job in own_jobs:
            if job.client is None:
                continue
            entry = clients.setdefault(job.client.id, {"id": job.client.id, "name": job.client.company_name, "positions": 0, "closures": 0})
            entry["positions"] += 1
            entry["closures"] += sum(1 for item in closed if item.job_id == job.id)

        vendors: dict[int, dict] = {}
        for job_id, vendor_id, vendor_name in assigned_partners:
            if job_id in own_job_ids:
                vendors.setdefault(vendor_id, {"id": vendor_id, "name": vendor_name, "positions": 0, "submissions": 0, "closures": 0})
                vendors[vendor_id]["positions"] += 1
        for item in own_subs:
            if item.vendor is None:
                continue
            entry = vendors.setdefault(item.vendor.id, {"id": item.vendor.id, "name": item.vendor.name, "positions": 0, "submissions": 0, "closures": 0})
            entry["submissions"] += 1
            entry["closures"] += 1 if item.status in CLOSED_STATUSES else 0

        job_by_id = {job.id: job for job in own_jobs}
        closures = sorted(
            (
                {
                    "submission_id": item.id,
                    "candidate_name": item.candidate.full_name,
                    "job_id": item.job_id,
                    "job_title": job_by_id[item.job_id].title,
                    "client_name": job_by_id[item.job_id].client.company_name if job_by_id[item.job_id].client else None,
                    "vendor_name": item.vendor.name if item.vendor is not None else None,
                    "status": item.status,
                    "closed_at": _as_utc(first_closed.get(item.id)),
                    "in_period": in_period(first_closed.get(item.id)),
                }
                for item in closed
            ),
            key=lambda entry: entry["closed_at"] or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

        result.append({
            "id": recruiter.id,
            "name": _display_name(recruiter),
            "email": recruiter.email,
            "totals": {
                "positions": len(own_jobs),
                "open_positions": sum(1 for job in own_jobs if job.status == "open"),
                "clients": len(clients),
                "vendors": len(vendors),
                "submissions": len(own_subs),
                "in_process": sum(1 for item in own_subs if item.status in IN_PROCESS_STATUSES),
                "closures": len(closed),
                "closures_in_period": len(closed_in_period),
                "joined": sum(1 for item in closed if item.status == "Joined"),
            },
            "positions": positions,
            "clients": sorted(clients.values(), key=lambda entry: (-entry["closures"], entry["name"].lower())),
            "vendors": sorted(vendors.values(), key=lambda entry: (-entry["closures"], -entry["submissions"], entry["name"].lower())),
            "closures": closures,
        })

    # Highest closures first (for the selected period, then overall), then by name.
    result.sort(key=lambda entry: (-entry["totals"]["closures_in_period"], -entry["totals"]["closures"], entry["name"].lower()))
    unassigned_open = db.scalar(
        select(func.count()).select_from(Job).where(
            Job.organization_id == org, Job.is_active.is_(True), Job.status == "open", Job.recruiter_id.is_(None)
        )
    )
    return {"recruiters": result, "unassigned_open_positions": unassigned_open or 0}
