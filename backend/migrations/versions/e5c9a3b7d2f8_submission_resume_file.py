"""resume file on candidate submissions

Revision ID: e5c9a3b7d2f8
Revises: d4b8f2a6c1e7
Create Date: 2026-10-29 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5c9a3b7d2f8'
down_revision: Union[str, Sequence[str], None] = 'd4b8f2a6c1e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('candidate_submissions', sa.Column('resume_file_name', sa.String(length=300), nullable=True))
    op.add_column('candidate_submissions', sa.Column('resume_file_path', sa.String(length=500), nullable=True))
    op.add_column('candidate_submissions', sa.Column('resume_content_type', sa.String(length=150), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('candidate_submissions', 'resume_content_type')
    op.drop_column('candidate_submissions', 'resume_file_path')
    op.drop_column('candidate_submissions', 'resume_file_name')
