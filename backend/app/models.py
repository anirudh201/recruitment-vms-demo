
from datetime import datetime, timezone

from sqlalchemy import (
    LargeBinary,
    func,
    text,
    MetaData,
    String,
    ForeignKey,
    Boolean,
    Table,
    Column,
    DateTime,
    Date,
    Integer,
    Text,
    CheckConstraint,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
class Client(Base):
    __tablename__ = "clients"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "company_name",
            name="uq_clients_organization_company_name",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    contacts: Mapped[list["ClientContact"]] = relationship(
        back_populates="client",
        cascade="all, delete-orphan",
    )
    jobs: Mapped[list["Job"]] = relationship(back_populates="client")

class ClientContact(Base):
    __tablename__ = "client_contacts"
    __table_args__ = (
        CheckConstraint(
            "contact_type IN ('HR', 'FINANCE', 'OTHER')",
            name="contact_type_valid",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contact_type: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_primary: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    client: Mapped["Client"] = relationship(back_populates="contacts")

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    vendor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Set for client-company logins (Client role); they only see their own company's data.
    client_id: Mapped[int | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    # Shown on recruiter cards and in the app; optional for older accounts.
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    roles: Mapped[list["Role"]] = relationship(
        secondary=user_roles, back_populates="users"
    )
    vendor: Mapped["Vendor | None"] = relationship(back_populates="users")
    client: Mapped["Client | None"] = relationship()


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    users: Mapped[list["User"]] = relationship(
        secondary=user_roles, back_populates="roles"
    )
    permissions: Mapped[list["Permission"]] = relationship(
        secondary=role_permissions, back_populates="roles"
    )


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    roles: Mapped[list["Role"]] = relationship(
        secondary=role_permissions, back_populates="permissions"
    )


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(
    Boolean, default=True, server_default=text("true"), nullable=False
   )

    created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    default=datetime.utcnow,
    server_default=func.now(),
    nullable=False,
    )

    users: Mapped[list["User"]] = relationship(back_populates="vendor")
    assignments: Mapped[list["JobVendorAssignment"]] = relationship(
        back_populates="vendor", cascade="all, delete-orphan"
    )


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint("min_experience >= 0", name="min_experience_nonnegative"),
        CheckConstraint(
            "max_experience IS NULL OR max_experience >= min_experience",
            name="experience_range_valid",
        ),
        CheckConstraint("openings > 0", name="openings_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    client_id: Mapped[int | None] = mapped_column(
        ForeignKey("clients.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    mandatory_skills: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_skills: Mapped[str | None] = mapped_column(Text, nullable=True)
    min_experience: Mapped[int] = mapped_column(
    Integer, default=0, server_default=text("0"), nullable=False
)
    max_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    qualification: Mapped[str | None] = mapped_column(String(300), nullable=True)
    location: Mapped[str] = mapped_column(String(200), nullable=False)
    work_arrangement: Mapped[str | None] = mapped_column(String(50), nullable=True)
    budget_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    budget_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    openings: Mapped[int] = mapped_column(
    Integer, default=1, server_default=text("1"), nullable=False
)
    status: Mapped[str] = mapped_column(
    String(30), default="draft", server_default=text("'draft'"), nullable=False
  )
    created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    default=datetime.utcnow,
    server_default=func.now(),
    nullable=False,
)
    updated_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    default=datetime.utcnow,
    onupdate=datetime.utcnow,
    server_default=func.now(),
    nullable=False,
)

    # Original uploaded JD document (PDF/DOCX). Only the generated storage name is
    # kept on disk; the user's file name is stored separately for display/download.
    jd_file_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    jd_file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    jd_content_type: Mapped[str | None] = mapped_column(String(150), nullable=True)

    assignments: Mapped[list["JobVendorAssignment"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )
    # The recruiter who owns this requirement (their closures are counted from it).
    recruiter_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Deactivated jobs are hidden everywhere except from job managers, and can be reactivated.
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
    client: Mapped["Client | None"] = relationship(back_populates="jobs")
    recruiter: Mapped["User | None"] = relationship(foreign_keys="Job.recruiter_id")

class JobVendorAssignment(Base):
    __tablename__ = "job_vendor_assignments"
    __table_args__ = (
        UniqueConstraint("job_id", "vendor_id", name="uq_job_vendor_assignment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vendor_id: Mapped[int] = mapped_column(
        ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    default=datetime.utcnow,
    server_default=func.now(),
    nullable=False,
)
    is_active: Mapped[bool] = mapped_column(
    Boolean,
    default=True,
    server_default=text("true"),
    nullable=False,
)

    job: Mapped["Job"] = relationship(back_populates="assignments")
    vendor: Mapped["Vendor"] = relationship(back_populates="assignments")


# Candidate Management
CANDIDATE_STATUSES = (
    "Submitted",
    "Screening",
    "Shortlisted",
    "Sent to Client",
    "Interview Scheduled",
    "Selected",
    "Offer Accepted",
    "Joined",
    "Rejected",
    "Withdrawn",
    "Offer Declined",
)


class Candidate(Base):
    """A candidate profile that can be submitted to multiple jobs."""

    __tablename__ = "candidates"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "email",
            name="uq_candidates_organization_email",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    total_experience: Mapped[float | None] = mapped_column(nullable=True)
    relevant_experience: Mapped[float | None] = mapped_column(nullable=True)
    current_employer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    current_location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    highest_qualification: Mapped[str | None] = mapped_column(String(300), nullable=True)
    primary_skills: Mapped[str | None] = mapped_column(Text, nullable=True)
    resume_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    submissions: Mapped[list["CandidateSubmission"]] = relationship(
        back_populates="candidate",
        cascade="all, delete-orphan",
    )


class CandidateSubmission(Base):
    """A candidate's submission to one job by one vendor or recruiter."""

    __tablename__ = "candidate_submissions"
    __table_args__ = (
        UniqueConstraint(
            "candidate_id",
            "job_id",
            name="uq_candidate_submissions_candidate_job",
        ),
        CheckConstraint(
            "status IN ('Submitted', 'Screening', 'Shortlisted', 'Sent to Client', "
            "'Interview Scheduled', 'Selected', 'Offer Accepted', 'Joined', "
            "'Rejected', 'Withdrawn', 'Offer Declined')",
            name="candidate_submission_status_valid",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vendor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    submitted_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(30), default="Submitted", server_default=text("'Submitted'"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Uploaded resume (PDF/DOCX) for this submission. Stored per submission so one partner's
    # file never overwrites another's for the same candidate.
    resume_file_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    resume_file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    resume_content_type: Mapped[str | None] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    candidate: Mapped["Candidate"] = relationship(back_populates="submissions")
    job: Mapped["Job"] = relationship()
    vendor: Mapped["Vendor | None"] = relationship()
    status_history: Mapped[list["CandidateStatusHistory"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="CandidateStatusHistory.changed_at",
    )


class CandidateStatusHistory(Base):
    """Audit trail for every candidate submission status change."""

    __tablename__ = "candidate_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("candidate_submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    old_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str] = mapped_column(String(30), nullable=False)
    changed_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    submission: Mapped["CandidateSubmission"] = relationship(
        back_populates="status_history"
    )


class StoredFile(Base):
    """Uploaded file content kept in the database (when FILE_STORAGE=database)."""

    __tablename__ = "stored_files"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    content_type: Mapped[str] = mapped_column(String(150), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )


FEEDBACK_KINDS = ("bug", "feature", "other")
FEEDBACK_STATUSES = ("new", "in_progress", "done", "wont_fix")


class Feedback(Base):
    """A bug report or feature idea sent from the app's Feedback button."""

    __tablename__ = "feedback"
    __table_args__ = (
        CheckConstraint("kind IN ('bug', 'feature', 'other')", name="feedback_kind_valid"),
        CheckConstraint("status IN ('new', 'in_progress', 'done', 'wont_fix')", name="feedback_status_valid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False)
    page: Mapped[str | None] = mapped_column(String(200), nullable=True)
    browser: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="new", server_default=text("'new'"), nullable=False)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), nullable=False
    )

    user: Mapped["User | None"] = relationship()
