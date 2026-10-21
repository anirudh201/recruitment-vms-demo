
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db_dependencies import get_db
from app.dependencies import require_permission
from app.models import User, Vendor


router = APIRouter(prefix="/vendors", tags=["Vendor Management"])


class VendorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=200)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=30)


class VendorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    name: str
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    is_active: bool


@router.post("", response_model=VendorResponse, status_code=status.HTTP_201_CREATED)
def create_vendor(
    payload: VendorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vendors.manage")),
):
    vendor = Vendor(
        organization_id=current_user.organization_id,
        name=payload.name.strip(),
        contact_name=payload.contact_name,
        contact_email=str(payload.contact_email) if payload.contact_email else None,
        contact_phone=payload.contact_phone,
        is_active=True,
    )

    if not vendor.name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Vendor name cannot be empty",
        )

    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


@router.get("", response_model=list[VendorResponse])
def list_vendors(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("vendors.manage")),
):
    return db.scalars(
        select(Vendor)
        .where(Vendor.organization_id == current_user.organization_id)
        .order_by(Vendor.id)
    ).all()
