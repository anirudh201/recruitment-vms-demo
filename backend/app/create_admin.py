"""Create a Super Admin login (for a new or emptied database).

    python -m app.create_admin

Asks for the email, name and password (the password is not shown while typing).
Run `alembic upgrade head` and `python -m app.seed_roles` first.
"""
import getpass
import sys

from sqlalchemy import select
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.database import SessionLocal
from app.models import Organization, Role, User
from app.security import hash_password

ORGANIZATION_NAME = "DM&I Technologies"


def main() -> None:
    with SessionLocal() as s:
        try:
            role = s.scalar(select(Role).where(Role.name == "Super Admin"))
        except OperationalError:
            sys.exit("Can't reach the database. Is PostgreSQL (Docker) running, and are the DB_ settings in .env right?")
        except ProgrammingError:
            sys.exit("The database has no tables yet. Run: alembic upgrade head, then: python -m app.seed_roles")
        if role is None:
            sys.exit("The Super Admin role is missing. Run: python -m app.seed_roles")

        email = input("Admin email: ").strip().lower()
        if "@" not in email or "." not in email.split("@")[-1]:
            sys.exit("That doesn't look like an email address.")
        if s.scalar(select(User).where(User.email == email)):
            sys.exit(f"A login for {email} already exists. Use 'Forgot password' or another email.")
        full_name = input("Full name (optional): ").strip() or None
        password = getpass.getpass("Password (at least 12 characters): ")
        if len(password) < 12 or not password.strip():
            sys.exit("The password must be at least 12 characters.")
        if getpass.getpass("Type the password again: ") != password:
            sys.exit("The passwords don't match. Nothing was created.")

        org = s.scalar(select(Organization).order_by(Organization.id))
        if org is None:
            org = Organization(name=ORGANIZATION_NAME)
            s.add(org)
            s.flush()
        s.add(User(organization_id=org.id, email=email, full_name=full_name, password_hash=hash_password(password),
                   roles=[role], is_active=True))
        s.commit()
        print(f"Super Admin created: {email} (organization: {org.name}). You can sign in now.")


if __name__ == "__main__":
    main()
