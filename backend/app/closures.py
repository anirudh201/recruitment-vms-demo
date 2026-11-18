"""What counts as a closure, in one place (TAS performance, Reports and Revenue all use it).

A closure is a candidate the client said yes to: the submission must first have been
"Sent to Client", and after that reached Selected, Offer Accepted or Joined. A candidate
moved to Selected without ever going to the client is not a closure.

A closure is dated by the first time it reached one of those stages after being sent.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CandidateStatusHistory

CLOSED_STATUSES = ("Selected", "Offer Accepted", "Joined")
SENT_TO_CLIENT = "Sent to Client"


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def closure_dates(db: Session, submission_ids: list[int], status: str | None = None) -> dict[int, datetime]:
    """{submission id: when it became a closure} for the submissions that are closures.

    status: date by the first time this particular stage was reached after being sent
    (e.g. "Joined" for revenue) instead of the first closed stage.
    """
    if not submission_ids:
        return {}
    wanted = (status,) if status else CLOSED_STATUSES
    sent_at: dict[int, datetime] = {}
    reached: dict[int, list[datetime]] = {}
    for submission_id, new_status, changed_at in db.execute(
        select(CandidateStatusHistory.submission_id, CandidateStatusHistory.new_status, CandidateStatusHistory.changed_at)
        .where(
            CandidateStatusHistory.submission_id.in_(submission_ids),
            CandidateStatusHistory.new_status.in_((*wanted, SENT_TO_CLIENT)),
        )
    ).all():
        changed_at = _utc(changed_at)
        if new_status == SENT_TO_CLIENT:
            if submission_id not in sent_at or changed_at < sent_at[submission_id]:
                sent_at[submission_id] = changed_at
        else:
            reached.setdefault(submission_id, []).append(changed_at)
    dates: dict[int, datetime] = {}
    for submission_id, moments in reached.items():
        sent = sent_at.get(submission_id)
        if sent is None:
            continue
        after = [moment for moment in moments if moment >= sent]
        if after:
            dates[submission_id] = min(after)
    return dates


def is_closure(submission, dates: dict[int, datetime]) -> bool:
    """Currently at a closed stage, and got there after being sent to the client."""
    return submission.status in CLOSED_STATUSES and submission.id in dates
