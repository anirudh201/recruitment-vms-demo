
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db_dependencies import get_db
from app.dependencies import require_permission
from app.models import Organization, Role, User, Vendor
from app.security import hash_password

router = APIRouter(prefix="/users", tags=["User Management"])
SUPER_ADMIN_ROLE_NAME = "Super Admin"


def is_super_admin(user: User) -> bool:
    return any(role.name == SUPER_ADMIN_ROLE_NAME for role in user.roles)
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12)
    organization_id: int
    role_ids: list[int]
    vendor_id: int | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Password cannot contain only whitespace")
        return value


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    organization_id: int
    is_active: bool


class UserStatusUpdate(BaseModel):
    is_active: bool


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)

def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("users.manage")),
):
    # Only Super Admin can create users in another organization.
    if (
        not is_super_admin(_current_user)
        and payload.organization_id != _current_user.organization_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot create users in another organization",
        )

    email = str(payload.email).strip().lower()

    existing_user = db.scalar(
        select(User).where(User.email == email)
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    if not payload.role_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one role must be assigned",
        )

    role_ids = set(payload.role_ids)

    roles = db.scalars(
        select(Role).where(Role.id.in_(role_ids))
    ).all()

    if len(roles) != len(role_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more role IDs are invalid",
        )

    is_assigning_super_admin = any(
        role.name == "Super Admin" for role in roles
    )

    if is_assigning_super_admin:
        current_user_roles = {
            role.name for role in _current_user.roles
        }

        if "Super Admin" not in current_user_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a Super Admin can assign the Super Admin role",
            )

    organization = db.get(Organization, payload.organization_id)
    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization not found",
        )

    vendor = None
    has_vendor_role = any(role.name == "Vendor" for role in roles)

    if payload.vendor_id is not None:
        vendor = db.get(Vendor, payload.vendor_id)

        if vendor is None or not vendor.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Active vendor not found",
            )

        if vendor.organization_id != payload.organization_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vendor must belong to the user's organization",
            )

        if not has_vendor_role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A vendor account must have the Vendor role",
            )

    elif has_vendor_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="vendor_id is required for a Vendor user",
        )


    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        organization_id=payload.organization_id,
        vendor_id=payload.vendor_id,
        is_active=True,
        roles=list(roles),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        email=user.email,
        organization_id=user.organization_id,
        is_active=user.is_active,
    )



@router.get("", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permission("users.manage")),
):
    query = select(User).order_by(User.id)

    # Super Admin can view all organizations.
    # Other authorized users can view only their own organization.
    if not is_super_admin(_current_user):
        query = query.where(
            User.organization_id == _current_user.organization_id
        )

    users = db.scalars(query).all()

    return [
        UserResponse(
            id=user.id,
            email=user.email,
            organization_id=user.organization_id,
            is_active=user.is_active,
        )
        for user in users
    ]



@router.patch(
    "/{user_id}/status",
    response_model=UserResponse,
)
def update_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users.manage")),
):
    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Prevent non-Super Admin users from modifying accounts
    # belonging to another organization.
    if (
        not is_super_admin(current_user)
        and user.organization_id != current_user.organization_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.id == current_user.id and not payload.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )
    if not payload.is_active and is_super_admin(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin accounts cannot be deactivated",
        )
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        email=user.email,
        organization_id=user.organization_id,
        is_active=user.is_active,
    )
