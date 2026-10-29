"""users.full_name and jobs.recruiter_id (recruiter performance)

Revision ID: f6d1b4c8e2a9
Revises: e5c9a3b7d2f8
Create Date: 2026-10-29 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6d1b4c8e2a9'
down_revision: Union[str, Sequence[str], None] = 'e5c9a3b7d2f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('full_name', sa.String(length=200), nullable=True))
    op.add_column('jobs', sa.Column('recruiter_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_jobs_recruiter_id'), 'jobs', ['recruiter_id'], unique=False)
    op.create_foreign_key(op.f('fk_jobs_recruiter_id_users'), 'jobs', 'users', ['recruiter_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f('fk_jobs_recruiter_id_users'), 'jobs', type_='foreignkey')
    op.drop_index(op.f('ix_jobs_recruiter_id'), table_name='jobs')
    op.drop_column('jobs', 'recruiter_id')
    op.drop_column('users', 'full_name')
