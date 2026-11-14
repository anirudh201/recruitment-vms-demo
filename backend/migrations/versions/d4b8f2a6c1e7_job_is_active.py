"""jobs.is_active (deactivate / reactivate jobs)

Revision ID: d4b8f2a6c1e7
Revises: c3a7e1d2b9f4
Create Date: 2026-10-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4b8f2a6c1e7'
down_revision: Union[str, Sequence[str], None] = 'c3a7e1d2b9f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Existing jobs stay active.
    op.add_column('jobs', sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('jobs', 'is_active')
