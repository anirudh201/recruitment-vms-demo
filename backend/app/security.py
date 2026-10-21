
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
    """Validate a JWT and return its payload."""
    return jwt.decode(
        token,
        JWT_SECRET_KEY,
        algorithms=[JWT_ALGORITHM],
    )