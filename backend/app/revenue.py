"""Revenue from closures (Super Admin only).

A candidate earns DM&I a fee when they JOIN:
    revenue = annual CTC x fee %
- annual CTC: the CTC recorded on the candidate's submission, or else the job's offered CTC
- fee %: the client's own fee %, or else DEFAULT_FEE_PERCENT (8.33%, one month's salary)
Revenue is dated by the day the candidate first reached "Joined". Only closures count:
the candidate must have been Sent to Client before joining (app/closures.py).
"""
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.closures import closure_dates
from app.db_dependencies import get_db
from app.dependencies import require_permission
from app.models import CandidateSubmission, Job, User

router = APIRouter(prefix="/revenue", tags=["Revenue"])


def default_fee_percent() -> float:
    try:
        value = float(os.getenv("DEFAULT_FEE_PERCENT", "8.33"))
    except ValueError:
        value = 8.33
    return value if 0 < value <= 100 else 8.33


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _super_admin(current_user: User = Depends(require_permission("candidates.view"))) -> User:
    if not any(role.name == "Super Admin" for role in current_user.roles):
        raise HTTPException(status_code=403, detail="Only the Super Admin can see revenue.")
    return current_user


@router.get("")
def revenue(
    start: datetime | None = None,
    end: datetime | None = None,
    bucket: str = Query(default="month", pattern="^(day|month)$"),
    tz_offset: int = Query(default=0, ge=-840, le=840, description="Minutes east of UTC, for day/month boundaries"),
    db: Session = Depends(get_db),
    current_user: User = Depends(_super_admin),
):
    start, end = _utc(start), _utc(end)
    shift = timedelta(minutes=tz_offset)
    fallback_fee = default_fee_percent()

    joined = db.scalars(
        select(CandidateSubmission)
        .options(selectinload(CandidateSubmission.candidate), selectinload(CandidateSubmission.job).selectinload(Job.client))
        .join(Job, Job.id == CandidateSubmission.job_id)
        .where(
            CandidateSubmission.organization_id == current_user.organization_id,
            CandidateSubmission.status == "Joined",
            Job.is_active.is_(True),
        )
    ).all()
    # first "Joined" after being sent to the client; joins never sent to the client are not counted
    joined_at = closure_dates(db, [item.id for item in joined], status="Joined")

    items = []
    for item in joined:
        when = joined_at.get(item.id)
        if when is None:
            continue
        if (start and when < start) or (end and when >= end):
            continue
        job = item.job
        ctc, source = item.offered_ctc, "candidate"
        if not ctc:
            ctc, source = job.budget_max or job.budget_min, "job"
        if not ctc:
            ctc, source = 0, "missing"
        fee = float(job.client.fee_percent) if job.client is not None and job.client.fee_percent is not None else fallback_fee
        items.append({
            "submission_id": item.id,
            "candidate_name": item.candidate.full_name,
            "job_title": job.title,
            "client_name": job.client.company_name if job.client is not None else "No client linked",
            "joined_at": when,
            "ctc": ctc,
            "ctc_source": source,
            "fee_percent": round(fee, 2),
            "revenue": round(ctc * fee / 100),
        })
    items.sort(key=lambda entry: entry["joined_at"], reverse=True)

    # chart buckets: every day or month in the period, in the viewer's local time
    def key(moment: datetime) -> str:
        local = moment + shift
        return f"{local:%Y-%m-%d}" if bucket == "day" else f"{local:%Y-%m}"

    buckets: dict[str, dict] = {}
    if start and end:
        cursor = (start + shift).replace(tzinfo=None)
        last = (end - timedelta(seconds=1) + shift).replace(tzinfo=None)
        while cursor <= last and len(buckets) < 400:
            label = f"{cursor:%Y-%m-%d}" if bucket == "day" else f"{cursor:%Y-%m}"
            buckets.setdefault(label, {"key": label, "revenue": 0, "joins": 0})
            cursor = cursor + timedelta(days=1) if bucket == "day" else (cursor.replace(day=1) + timedelta(days=32)).replace(day=1)
    for entry in items:
        slot = buckets.setdefault(key(entry["joined_at"]), {"key": key(entry["joined_at"]), "revenue": 0, "joins": 0})
        slot["revenue"] += entry["revenue"]
        slot["joins"] += 1

    clients: dict[str, dict] = {}
    for entry in items:
        slot = clients.setdefault(entry["client_name"], {"client_name": entry["client_name"], "revenue": 0, "joins": 0})
        slot["revenue"] += entry["revenue"]
        slot["joins"] += 1

    return {
        "default_fee_percent": fallback_fee,
        "total": sum(entry["revenue"] for entry in items),
        "joins": len(items),
        "missing_ctc": sum(1 for entry in items if entry["ctc_source"] == "missing"),
        "buckets": sorted(buckets.values(), key=lambda slot: slot["key"]),
        "clients": sorted(clients.values(), key=lambda slot: -slot["revenue"]),
        "items": items,
    }
