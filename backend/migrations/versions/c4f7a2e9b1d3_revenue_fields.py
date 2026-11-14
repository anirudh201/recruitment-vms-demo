"""revenue: client fee % and offered CTC on submissions

Revision ID: c4f7a2e9b1d3
Revises: b9e4a7c2d5f1
Create Date: 2026-11-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f7a2e9b1d3'
down_revision: Union[str, Sequence[str], None] = 'b9e4a7c2d5f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('clients', sa.Column('fee_percent', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('candidate_submissions', sa.Column('offered_ctc', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('candidate_submissions', 'offered_ctc')
    op.drop_column('clients', 'fee_percent')
