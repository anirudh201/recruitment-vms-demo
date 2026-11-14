"""Rules for channel-partner (vendor) users.

Client identities are hidden from partner logins unless PARTNERS_SEE_CLIENT_NAMES
is switched on in backend/.env, so a partner cannot approach the end client
directly. Super Admins linked to a vendor are still treated as staff.
"""
import os

TRUE_VALUES = {"1", "true", "yes", "on"}


def partners_see_client_names() -> bool:
    # Read on every call so a change in .env applies after a backend restart,
    # and tests can switch it per case.
    return os.getenv("PARTNERS_SEE_CLIENT_NAMES", "false").strip().lower() in TRUE_VALUES


def is_partner_user(user) -> bool:
    if getattr(user, "vendor_id", None) is None:
        return False
    return not any(role.name == "Super Admin" for role in getattr(user, "roles", []))


def hide_clients_from(user) -> bool:
    return is_partner_user(user) and not partners_see_client_names()


def permission_codes(user) -> set[str]:
    return {
        permission.code
        for role in getattr(user, "roles", [])
        for permission in role.permissions
    }


def is_client_user(user) -> bool:
    """A login belonging to a client company (Client role). Super Admins are staff."""
    if any(role.name == "Super Admin" for role in getattr(user, "roles", [])):
        return False
    return any(role.name == "Client" for role in getattr(user, "roles", []))


def clients_see_candidate_contacts() -> bool:
    # Candidate email/phone/resume are hidden from client logins unless switched on in .env,
    # so a client cannot hire a candidate directly around the agency.
    return os.getenv("CLIENTS_SEE_CANDIDATE_CONTACTS", "false").strip().lower() in TRUE_VALUES


def company_access_blocked(user) -> str | None:
    """Reason a partner/client login may not be used because its company is deactivated."""
    if any(role.name == "Super Admin" for role in getattr(user, "roles", [])):
        return None
    vendor = getattr(user, "vendor", None)
    if getattr(user, "vendor_id", None) is not None and vendor is not None and not vendor.is_active:
        return "Your company's access has been deactivated. Please contact your account manager."
    client = getattr(user, "client", None)
    if getattr(user, "client_id", None) is not None and client is not None and not client.is_active:
        return "Your company's access has been deactivated. Please contact your account manager."
    return None


def clean_profile_text(value: str | None, field: str, max_length: int) -> str | None:
    """Trim; empty becomes None. Phone numbers may only use digits, spaces and + - ( ) ."""
    import re

    if value is None:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    if not value:
        return None
    if len(value) > max_length:
        raise ValueError(f"{field} must be {max_length} characters or fewer")
    if field == "Phone" and not re.fullmatch(r"\+?[\d\s().-]{6,30}", value):
        raise ValueError("Phone may contain only digits, spaces and + - ( )")
    return value
