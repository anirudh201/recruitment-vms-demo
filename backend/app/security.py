
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()
def hash_password(password: str) -> str:
    """Return a secure hash of a plain-text password."""
    if not password:
        raise ValueError("Password cannot be empty")

    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """Check a password against its stored hash."""
    return password_hash.verify(password, hashed_password)

ENV_FILE = Path(__file__).resolve().parents[2] / "infrastructure" / ".env"

# Preserve secrets provided by the deployment environment.
load_dotenv(ENV_FILE, override=False)

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if (
    not JWT_SECRET_KEY
    or JWT_SECRET_KEY == "REPLACE_WITH_A_RANDOM_SECRET"
    or len(JWT_SECRET_KEY.encode("utf-8")) < 32
):
    raise RuntimeError(
        "JWT_SECRET_KEY must be configured and contain at least 32 bytes"
    )

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30



def create_access_token(user_id: int) -> str:
    """Create a signed JWT access token for a user."""
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }

    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Validate a sign-in JWT and return its payload.

    Other tokens signed with the same key (e.g. password-reset links, which carry a
    "purpose" claim) are refused, so they can never be used to sign in.
    """
    payload = jwt.decode(
        token,
        JWT_SECRET_KEY,
        algorithms=[JWT_ALGORITHM],
    )
    if payload.get("purpose") is not None:
        raise jwt.InvalidTokenError("Not a sign-in token")
    return payload


def password_fingerprint(password_hash: str) -> str:
    """Short fingerprint of the stored password hash. A reset link carries it, so the link
    stops working as soon as the password changes (i.e. it can be used only once)."""
    import hashlib

    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]