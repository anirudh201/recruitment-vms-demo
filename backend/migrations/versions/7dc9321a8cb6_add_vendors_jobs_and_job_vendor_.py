"""add vendors jobs and job vendor assignments

Revision ID: 7dc9321a8cb6
Revises: 8a826607ca68
Create Date: 2026-10-19 21:19:35.386923
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "7dc9321a8cb6"
down_revision: Union[str, Sequence[str], None] = "8a826607ca68"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "vendors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("contact_name", sa.String(length=200), nullable=True),
        sa.Column("contact_email", sa.String(length=320), nullable=True),
        sa.Column("contact_phone", sa.String(length=30), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"],
            name=op.f("fk_vendors_organization_id_organizations"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vendors")),
    )
    op.create_index(op.f("ix_vendors_name"), "vendors", ["name"], unique=False)
    op.create_index(op.f("ix_vendors_organization_id"), "vendors", ["organization_id"], unique=False)

    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("mandatory_skills", sa.Text(), nullable=True),
        sa.Column("preferred_skills", sa.Text(), nullable=True),
        sa.Column("min_experience", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("max_experience", sa.Integer(), nullable=True),
        sa.Column("qualification", sa.String(length=300), nullable=True),
        sa.Column("location", sa.String(length=200), nullable=False),
        sa.Column("work_arrangement", sa.String(length=50), nullable=True),
        sa.Column("budget_min", sa.Integer(), nullable=True),
        sa.Column("budget_max", sa.Integer(), nullable=True),
        sa.Column("openings", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("status", sa.String(length=30), server_default=sa.text("'draft'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "max_experience IS NULL OR max_experience >= min_experience",
            name=op.f("ck_jobs_experience_range_valid"),
        ),
        sa.CheckConstraint("min_experience >= 0", name=op.f("ck_jobs_min_experience_nonnegative")),
        sa.CheckConstraint("openings > 0", name=op.f("ck_jobs_openings_positive")),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"],
            name=op.f("fk_jobs_created_by_user_id_users"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"],
            name=op.f("fk_jobs_organization_id_organizations"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_jobs")),
    )
    op.create_index(op.f("ix_jobs_organization_id"), "jobs", ["organization_id"], unique=False)
    op.create_index(op.f("ix_jobs_title"), "jobs", ["title"], unique=False)

    op.create_table(
        "job_vendor_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.ForeignKeyConstraint(
            ["job_id"], ["jobs.id"],
            name=op.f("fk_job_vendor_assignments_job_id_jobs"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["vendor_id"], ["vendors.id"],
            name=op.f("fk_job_vendor_assignments_vendor_id_vendors"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_job_vendor_assignments")),
        sa.UniqueConstraint("job_id", "vendor_id", name="uq_job_vendor_assignment"),
    )
    op.create_index(
        op.f("ix_job_vendor_assignments_job_id"),
        "job_vendor_assignments", ["job_id"], unique=False,
    )
    op.create_index(
        op.f("ix_job_vendor_assignments_vendor_id"),
        "job_vendor_assignments", ["vendor_id"], unique=False,
    )

    op.add_column("users", sa.Column("vendor_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_users_vendor_id"), "users", ["vendor_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_users_vendor_id_vendors"), "users", "vendors", ["vendor_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f("fk_users_vendor_id_vendors"), "users", type_="foreignkey")
    op.drop_index(op.f("ix_users_vendor_id"), table_name="users")
    op.drop_column("users", "vendor_id")

    op.drop_index(op.f("ix_job_vendor_assignments_vendor_id"), table_name="job_vendor_assignments")
    op.drop_index(op.f("ix_job_vendor_assignments_job_id"), table_name="job_vendor_assignments")
    op.drop_table("job_vendor_assignments")

    op.drop_index(op.f("ix_jobs_title"), table_name="jobs")
    op.drop_index(op.f("ix_jobs_organization_id"), table_name="jobs")
    op.drop_table("jobs")

    op.drop_index(op.f("ix_vendors_organization_id"), table_name="vendors")
    op.drop_index(op.f("ix_vendors_name"), table_name="vendors")
    op.drop_table("vendors")
