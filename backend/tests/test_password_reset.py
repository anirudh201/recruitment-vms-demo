"""A password-reset link must only reset the password, and only once."""
from datetime import datetime, timedelta, timezone

import jwt

from app.security import JWT_ALGORITHM, JWT_SECRET_KEY, create_access_token, password_fingerprint


def _reset_token(user):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user.id), "purpose": "password_reset", "pwd": password_fingerprint(user.password_hash),
         "iat": now, "exp": now + timedelta(minutes=30)},
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def test_reset_link_cannot_be_used_to_sign_in(api_client, test_context):
    token = _reset_token(test_context["recruiter"])
    response = api_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_sign_in_token_still_works(api_client, test_context):
    token = create_access_token(test_context["recruiter"].id)
    response = api_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == "recruiter.test@example.com"


def test_reset_link_works_once(api_client, test_context):
    token = _reset_token(test_context["recruiter"])
    first = api_client.post("/auth/reset-password", json={"token": token, "new_password": "BrandNewPassword123!"})
    assert first.status_code == 200, first.text
    again = api_client.post("/auth/reset-password", json={"token": token, "new_password": "AnotherPassword456!"})
    assert again.status_code == 400
    login = api_client.post("/auth/login", json={"email": "recruiter.test@example.com", "password": "BrandNewPassword123!"})
    assert login.status_code == 200


def test_sign_in_token_cannot_reset_password(api_client, test_context):
    token = create_access_token(test_context["recruiter"].id)
    response = api_client.post("/auth/reset-password", json={"token": token, "new_password": "BrandNewPassword123!"})
    assert response.status_code == 400
