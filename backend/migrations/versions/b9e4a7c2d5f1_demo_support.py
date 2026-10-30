"""stored files (database file storage) and feedback

Revision ID: b9e4a7c2d5f1
Revises: a8f3d6b1c4e7
Create Date: 2026-10-30 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9e4a7c2d5f1'
down_revision: Union[str, Sequence[str], None] = 'a8f3d6b1c4e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'stored_files',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('content', sa.LargeBinary(), nullable=False),
        sa.Column('content_type', sa.String(length=150), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_stored_files')),
    )
    op.create_table(
        'feedback',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('details', sa.Text(), nullable=False),
        sa.Column('page', sa.String(length=200), nullable=True),
        sa.Column('browser', sa.String(length=300), nullable=True),
        sa.Column('status', sa.String(length=20), server_default=sa.text("'new'"), nullable=False),
        sa.Column('admin_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("kind IN ('bug', 'feature', 'other')", name=op.f('ck_feedback_feedback_kind_valid')),
        sa.CheckConstraint("status IN ('new', 'in_progress', 'done', 'wont_fix')", name=op.f('ck_feedback_feedback_status_valid')),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_feedback_organization_id_organizations'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_feedback_user_id_users'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_feedback')),
    )
    op.create_index(op.f('ix_feedback_organization_id'), 'feedback', ['organization_id'], unique=False)
    op.create_index(op.f('ix_feedback_user_id'), 'feedback', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_feedback_user_id'), table_name='feedback')
    op.drop_index(op.f('ix_feedback_organization_id'), table_name='feedback')
    op.drop_table('feedback')
    op.drop_table('stored_files')
