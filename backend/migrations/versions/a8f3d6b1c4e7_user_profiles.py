"""user profiles: phone, designation, created_at, last sign-in

Revision ID: a8f3d6b1c4e7
Revises: f6d1b4c8e2a9
Create Date: 2026-10-29 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8f3d6b1c4e7'
down_revision: Union[str, Sequence[str], None] = 'f6d1b4c8e2a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('phone', sa.String(length=30), nullable=True))
    op.add_column('users', sa.Column('job_title', sa.String(length=120), nullable=True))
    # Existing users get the migration time as "member since" (the real date was never stored).
    op.add_column('users', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'last_login_at')
    op.drop_column('users', 'created_at')
    op.drop_column('users', 'job_title')
    op.drop_column('users', 'phone')
