"""add jd file to jobs

Revision ID: 5b1f0c7a9d42
Revises: 087f266922e4
Create Date: 2026-10-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b1f0c7a9d42'
down_revision: Union[str, Sequence[str], None] = '087f266922e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('jobs', sa.Column('jd_file_name', sa.String(length=300), nullable=True))
    op.add_column('jobs', sa.Column('jd_file_path', sa.String(length=500), nullable=True))
    op.add_column('jobs', sa.Column('jd_content_type', sa.String(length=150), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('jobs', 'jd_content_type')
    op.drop_column('jobs', 'jd_file_path')
    op.drop_column('jobs', 'jd_file_name')
