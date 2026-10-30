
import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db_dependencies import get_db
from app.dependencies import get_current_user, require_permission
from app.models import User
from app.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES, JWT_ALGORITHM, JWT_SECRET_KEY,
    create_access_token, hash_password, verify_password,
)


router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=12)


class MessageResponse(BaseModel):
    message: str


def _send_reset_email(recipient: str, reset_link: str) -> None:
    """Send a password-reset link using SMTP settings from environment."""
    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM_EMAIL", username).strip()
    use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() in {"1", "true", "yes", "on"}

    if not host or not sender:
        raise RuntimeError("SMTP_HOST and SMTP_FROM_EMAIL must be configured")

    message = EmailMessage()
    message["Subject"] = "Reset your Recruitment VMS password"
    message["From"] = sender
    message["To"] = recipient
    message.set_content(
        "We received a request to reset your Recruitment VMS password.\n\n"
        f"Open this link within 30 minutes to set a new password: {reset_link}\n\n"
        "If you did not request this, you can ignore this email."
    )

    with smtplib.SMTP(host, port, timeout=15) as smtp:
        if use_tls:
            smtp.starttls()
        if username:
            smtp.login(username, password)
        smtp.send_message(message)


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """Email a time-limited reset link without disclosing whether an account exists."""
    generic_message = "If an account exists for that email, a password-reset link has been sent."
    normalized_email = str(payload.email).strip().lower()
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None or not user.is_active:
        return MessageResponse(message=generic_message)

    now = datetime.now(timezone.utc)
    reset_token = jwt.encode(
        {"sub": str(user.id), "purpose": "password_reset", "iat": now, "exp": now + timedelta(minutes=30)},
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )
    frontend_reset_url = os.getenv("FRONTEND_RESET_URL", "http://localhost:5173/").strip()
    separator = "&" if "?" in frontend_reset_url else "?"
    reset_link = f"{frontend_reset_url}{separator}reset_token={reset_token}"
    try:
        _send_reset_email(normalized_email, reset_link)
    except Exception as exc:
        # Keep account-existence details out of the API response/log message.
        print(f"Password reset email delivery failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=503, detail="Password reset email is temporarily unavailable. Contact your administrator.") from exc
    return MessageResponse(message=generic_message)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    if len(payload.new_password) < 12 or not payload.new_password.strip():
        raise HTTPException(status_code=422, detail="Password must contain at least 12 characters.")
    try:
        claims = jwt.decode(payload.token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if claims.get("purpose") != "password_reset" or not claims.get("sub"):
            raise jwt.InvalidTokenError("Invalid reset token purpose")
        user_id = int(claims["sub"])
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="This password-reset link is invalid or expired. Request a new link.") from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=400, detail="This password-reset link is invalid or expired. Request a new link.")
    user.password_hash = hash_password(payload.new_password)
    db.add(user)
    db.commit()
    return MessageResponse(message="Password reset successfully. You can now sign in with your new password.")

@router.post("/login", response_model=TokenResponse)
def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db),
):

    normalized_email = str(credentials.email).strip().lower()

    user = db.scalar(
        select(User).where(User.email == normalized_email)
    )

    if user is None or not verify_password(
        credentials.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    from app.partner_access import company_access_blocked

    blocked = company_access_blocked(user)
    if blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=blocked)

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    access_token = create_access_token(user.id)

    return TokenResponse(access_token=access_token)


@router.get("/me")
def read_current_user(
    current_user: User = Depends(get_current_user),
):
    from app.partner_access import is_client_user, is_partner_user, permission_codes

    roles = sorted(role.name for role in current_user.roles)
    if "Super Admin" in roles:
        user_type = "super_admin"
    elif is_client_user(current_user):
        user_type = "client"
    elif is_partner_user(current_user):
        user_type = "partner"
    elif "Recruiter" in roles:
        user_type = "recruiter"
    else:
        user_type = "staff"
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "job_title": current_user.job_title,
        "created_at": current_user.created_at,
        "last_login_at": current_user.last_login_at,
        "is_active": current_user.is_active,
        "organization_id": current_user.organization_id,
        "roles": roles,
        "permissions": sorted(permission_codes(current_user)),
        "user_type": user_type,
        "vendor_id": current_user.vendor_id,
        "vendor_name": current_user.vendor.name if current_user.vendor is not None else None,
        "client_id": current_user.client_id,
        "client_name": current_user.client.company_name if current_user.client is not None else None,
    }


@router.get("/test-admin-permission")
def test_admin_permission(
    current_user: User = Depends(require_permission("users.manage")),
):
    return {
        "message": "Permission granted",
        "user_id": current_user.id,
        "email": current_user.email,
    }


class ProfileSelfUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    job_title: str | None = None


@router.patch("/me")
def update_my_profile(
    payload: ProfileSelfUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Anyone signed in can edit their own name, phone and designation (not email or role)."""
    from app.partner_access import clean_profile_text

    limits = {"full_name": ("Full name", 200), "phone": ("Phone", 30), "job_title": ("Designation", 120)}
    try:
        for field, value in payload.model_dump(exclude_unset=True).items():
            label, limit = limits[field]
            setattr(current_user, field, clean_profile_text(value, label, limit))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.commit()
    db.refresh(current_user)
    return read_current_user(current_user)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12)


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Your current password is incorrect.")
    if not payload.new_password.strip():
        raise HTTPException(status_code=422, detail="The new password cannot be only spaces.")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=422, detail="Choose a new password that is different from the current one.")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Your password has been changed.")
