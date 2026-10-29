"""client portal: users.client_id and the 'Sent to Client' stage

Revision ID: c3a7e1d2b9f4
Revises: 5b1f0c7a9d42
Create Date: 2026-10-29 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3a7e1d2b9f4'
down_revision: Union[str, Sequence[str], None] = '5b1f0c7a9d42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STATUS_CHECK = 'ck_candidate_submissions_candidate_submission_status_valid'
OLD_STATUSES = (
    "'Submitted', 'Screening', 'Shortlisted', 'Interview Scheduled', 'Selected', "
    "'Offer Accepted', 'Joined', 'Rejected', 'Withdrawn', 'Offer Declined'"
)
NEW_STATUSES = (
    "'Submitted', 'Screening', 'Shortlisted', 'Sent to Client', 'Interview Scheduled', 'Selected', "
    "'Offer Accepted', 'Joined', 'Rejected', 'Withdrawn', 'Offer Declined'"
)


def upgrade() -> None:
    """Upgrade schema."""
    # Client-company logins are linked to their client.
    op.add_column('users', sa.Column('client_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_users_client_id'), 'users', ['client_id'], unique=False)
    op.create_foreign_key(
        op.f('fk_users_client_id_clients'), 'users', 'clients', ['client_id'], ['id'], ondelete='SET NULL'
    )

    # Allow the new 'Sent to Client' pipeline stage.
    op.drop_constraint(op.f(STATUS_CHECK), 'candidate_submissions', type_='check')
    op.create_check_constraint(op.f(STATUS_CHECK), 'candidate_submissions', f"status IN ({NEW_STATUSES})")


def downgrade() -> None:
    """Downgrade schema."""
    # The old constraint does not know 'Sent to Client'; step those back to 'Shortlisted' first.
    op.execute("UPDATE candidate_submissions SET status = 'Shortlisted' WHERE status = 'Sent to Client'")
    op.drop_constraint(op.f(STATUS_CHECK), 'candidate_submissions', type_='check')
    op.create_check_constraint(op.f(STATUS_CHECK), 'candidate_submissions', f"status IN ({OLD_STATUSES})")

    op.drop_constraint(op.f('fk_users_client_id_clients'), 'users', type_='foreignkey')
    op.drop_index(op.f('ix_users_client_id'), table_name='users')
    op.drop_column('users', 'client_id')
