"""A closure needs the client's yes: Sent to Client first, then Selected / Offer Accepted / Joined."""
from datetime import datetime, timedelta, timezone

from app.closures import closure_dates, is_closure
from app.models import Candidate, CandidateStatusHistory, CandidateSubmission, Job


def _submission(db, context, email, steps, final_status):
    job = db.query(Job).first()
    if job is None:
        job = Job(organization_id=context["organization"].id, created_by_user_id=context["admin"].id,
                  title="Oracle PLM", description="x", location="Pune")
        db.add(job)
        db.flush()
    candidate = Candidate(organization_id=context["organization"].id, full_name=email, email=email)
    db.add(candidate)
    db.flush()
    item = CandidateSubmission(organization_id=context["organization"].id, candidate_id=candidate.id, job_id=job.id,
                               submitted_by_user_id=context["admin"].id, status=final_status)
    db.add(item)
    db.flush()
    start = datetime(2026, 11, 1, tzinfo=timezone.utc)
    previous = None
    for hours, status in steps:
        db.add(CandidateStatusHistory(submission_id=item.id, old_status=previous, new_status=status,
                                      changed_by_user_id=context["admin"].id, changed_at=start + timedelta(hours=hours)))
        previous = status
    db.commit()
    return item


def test_selected_without_sending_to_client_is_not_a_closure(test_db, test_context):
    item = _submission(test_db, test_context, "a@x.com", [(0, "Submitted"), (1, "Offer Accepted")], "Offer Accepted")
    dates = closure_dates(test_db, [item.id])
    assert not is_closure(item, dates)


def test_sent_to_client_then_selected_is_a_closure(test_db, test_context):
    item = _submission(test_db, test_context, "b@x.com", [(0, "Submitted"), (1, "Sent to Client"), (5, "Selected")], "Selected")
    dates = closure_dates(test_db, [item.id])
    assert is_closure(item, dates)
    assert dates[item.id] == datetime(2026, 11, 1, 5, tzinfo=timezone.utc)


def test_selected_before_being_sent_is_dated_after_sending(test_db, test_context):
    steps = [(0, "Submitted"), (1, "Selected"), (2, "Screening"), (3, "Sent to Client"), (4, "Joined")]
    item = _submission(test_db, test_context, "c@x.com", steps, "Joined")
    dates = closure_dates(test_db, [item.id])
    assert dates[item.id] == datetime(2026, 11, 1, 4, tzinfo=timezone.utc)
    assert closure_dates(test_db, [item.id], status="Joined")[item.id] == datetime(2026, 11, 1, 4, tzinfo=timezone.utc)


def test_rejected_after_closure_is_no_longer_counted(test_db, test_context):
    steps = [(0, "Submitted"), (1, "Sent to Client"), (2, "Selected"), (3, "Offer Declined")]
    item = _submission(test_db, test_context, "d@x.com", steps, "Offer Declined")
    dates = closure_dates(test_db, [item.id])
    assert item.id in dates          # it was a closure once (counts as "dropped out")
    assert not is_closure(item, dates)
