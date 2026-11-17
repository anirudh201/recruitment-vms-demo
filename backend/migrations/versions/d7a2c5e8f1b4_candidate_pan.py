"""candidates: PAN number

Revision ID: d7a2c5e8f1b4
Revises: c4f7a2e9b1d3
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd7a2c5e8f1b4'
down_revision: Union[str, Sequence[str], None] = 'c4f7a2e9b1d3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('candidates', sa.Column('pan_number', sa.String(length=10), nullable=True))
    op.create_index('ix_candidates_pan_number', 'candidates', ['pan_number'])


def downgrade() -> None:
    op.drop_index('ix_candidates_pan_number', table_name='candidates')
    op.drop_column('candidates', 'pan_number')
