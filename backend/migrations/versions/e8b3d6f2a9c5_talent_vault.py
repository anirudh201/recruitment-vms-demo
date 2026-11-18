"""candidates: TalentVault resume bank fields

Revision ID: e8b3d6f2a9c5
Revises: d7a2c5e8f1b4
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e8b3d6f2a9c5'
down_revision: Union[str, Sequence[str], None] = 'd7a2c5e8f1b4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('candidates', sa.Column('resume_text', sa.Text(), nullable=True))
    op.add_column('candidates', sa.Column('profile_resume_name', sa.String(length=300), nullable=True))
    op.add_column('candidates', sa.Column('profile_resume_path', sa.String(length=500), nullable=True))
    op.add_column('candidates', sa.Column('profile_resume_type', sa.String(length=150), nullable=True))
    op.add_column('candidates', sa.Column('source', sa.String(length=40), nullable=True))
    op.add_column('candidates', sa.Column('added_by_user_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_candidates_added_by_user', 'candidates', 'users', ['added_by_user_id'], ['id'], ondelete='SET NULL')
    op.add_column('candidates', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True))
    op.execute("UPDATE candidates SET updated_at = created_at, source = 'Job submission'")


def downgrade() -> None:
    op.drop_column('candidates', 'updated_at')
    op.drop_constraint('fk_candidates_added_by_user', 'candidates', type_='foreignkey')
    op.drop_column('candidates', 'added_by_user_id')
    op.drop_column('candidates', 'source')
    op.drop_column('candidates', 'profile_resume_type')
    op.drop_column('candidates', 'profile_resume_path')
    op.drop_column('candidates', 'profile_resume_name')
    op.drop_column('candidates', 'resume_text')
