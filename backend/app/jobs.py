
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db_dependencies import get_db
from app.dependencies import get_current_user, require_permission
from app.models import Client, Job, JobVendorAssignment, User, Vendor


router = APIRouter(prefix="/jobs", tags=["Job Management"])


class JobCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    client_id: int | None = Field(default=None, gt=0)
    description: str = Field(min_length=1)
    mandatory_skills: str | None = None
    preferred_skills: str | None = None
    min_experience: int = Field(default=0, ge=0)
    max_experience: int | None = Field(default=None, ge=0)
    qualification: str | None = Field(default=None, max_length=300)
    location: str = Field(min_length=1, max_length=200)
    work_arrangement: str | None = Field(default=None, max_length=50)
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)
    openings: int = Field(default=1, gt=0)

    def validate_ranges(self):
        if (
            self.max_experience is not None
            and self.max_experience < self.min_experience
        ):
            raise ValueError("max_experience cannot be less than min_experience")
        if (
            self.budget_min is not None
            and self.budget_max is not None
            and self.budget_max < self.budget_min
        ):
            raise ValueError("budget_max cannot be less than budget_min")


class JobUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    client_id: int | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, min_length=1)
    mandatory_skills: str | None = None
    preferred_skills: str | None = None
    min_experience: int | None = Field(default=None, ge=0)
    max_experience: int | None = Field(default=None, ge=0)
    qualification: str | None = Field(default=None, max_length=300)
    location: str | None = Field(default=None, min_length=1, max_length=200)
    work_arrangement: str | None = Field(default=None, max_length=50)
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)
    openings: int | None = Field(default=None, gt=0)
    status: str | None = Field(default=None, pattern="^(draft|open|closed)$")


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    created_by_user_id: int
    client_id: int | None
    title: str
    description: str
    mandatory_skills: str | None
    preferred_skills: str | None
    min_experience: int
    max_experience: int | None
    qualification: str | None
    location: str
    work_arrangement: str | None
    budget_min: int | None
    budget_max: int | None
    openings: int
    status: str
    created_at: datetime
    updated_at: datetime


def is_super_admin(user: User) -> bool:
    return any(role.name == "Super Admin" for role in user.roles)


def can_view_job(db: Session, user: User, job: Job) -> bool:
    if is_super_admin(user):
        return True

    if user.organization_id != job.organization_id:
        return False

    if any(role.name == "Vendor" for role in user.roles):
        if user.vendor_id is None:
            return False

        assignment = db.scalar(
            select(JobVendorAssignment.id).where(
                JobVendorAssignment.job_id == job.id,
                JobVendorAssignment.vendor_id == user.vendor_id,
                JobVendorAssignment.is_active.is_(True),
            )
        )
        return assignment is not None

    return any(role.name == "Recruiter" for role in user.roles)


@router.post(
    "",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_job(
    payload: JobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("jobs.manage")),
):
    if payload.max_experience is not None and (
        payload.max_experience < payload.min_experience
    ):
        raise HTTPException(
            status_code=422,
            detail="max_experience cannot be less than min_experience",
        )

    if (
        payload.budget_min is not None
        and payload.budget_max is not None
        and payload.budget_max < payload.budget_min
    ):
        raise HTTPException(
            status_code=422,
            detail="budget_max cannot be less than budget_min",
        )
    if payload.client_id is not None:
        client = db.get(Client, payload.client_id)

        if (
            client is None
            or client.organization_id != current_user.organization_id
        ):
            raise HTTPException(
                status_code=422,
                detail="Client not found in your organization",
            )
    job = Job(
        organization_id=current_user.organization_id,
        created_by_user_id=current_user.id,
        **payload.model_dump(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("", response_model=list[JobResponse])
def list_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("jobs.view")),
):
    jobs = db.scalars(select(Job).order_by(Job.id.desc())).all()
    return [job for job in jobs if can_view_job(db, current_user, job)]


@router.get("/{job_id}", response_model=JobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("jobs.view")),
):
    job = db.get(Job, job_id)

    if job is None or not can_view_job(db, current_user, job):
        raise HTTPException(status_code=404, detail="Job not found")

    return job


@router.patch("/{job_id}", response_model=JobResponse)
def update_job(
    job_id: int,
    payload: JobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("jobs.manage")),
):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Job not found")

    changes = payload.model_dump(exclude_unset=True)

    if "client_id" in changes and changes["client_id"] is not None:
        client = db.get(Client, changes["client_id"])

        if (
            client is None
            or client.organization_id != current_user.organization_id
        ):
            raise HTTPException(
                status_code=422,
                detail="Client not found in your organization",
            )

    min_experience = changes.get("min_experience", job.min_experience)
    max_experience = changes.get("max_experience", job.max_experience)
    budget_min = changes.get("budget_min", job.budget_min)
    budget_max = changes.get("budget_max", job.budget_max)

    if max_experience is not None and max_experience < min_experience:
        raise HTTPException(status_code=422, detail="Invalid experience range")

    if budget_min is not None and budget_max is not None and budget_max < budget_min:
        raise HTTPException(status_code=422, detail="Invalid budget range")

    for field, value in changes.items():
        setattr(job, field, value)

    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/assign-vendor/{vendor_id}", status_code=201)
def assign_vendor(
    job_id: int,
    vendor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("jobs.manage")),
):
    job = db.get(Job, job_id)
    vendor = db.get(Vendor, vendor_id)

    if job is None or job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Job not found")

    if (
        vendor is None
        or vendor.organization_id != current_user.organization_id
        or not vendor.is_active
    ):
        raise HTTPException(status_code=404, detail="Active vendor not found")

    existing = db.scalar(
        select(JobVendorAssignment).where(
            JobVendorAssignment.job_id == job_id,
            JobVendorAssignment.vendor_id == vendor_id,
        )
    )

    if existing is not None:
        if existing.is_active:
            raise HTTPException(status_code=409, detail="Vendor already assigned")
        existing.is_active = True
        existing.assigned_at = datetime.utcnow()
    else:
        db.add(JobVendorAssignment(job_id=job_id, vendor_id=vendor_id))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not assign vendor")

    return {"message": "Vendor assigned successfully", "job_id": job_id, "vendor_id": vendor_id}
