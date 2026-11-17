"""Set a new password for an existing login (when "Forgot password" email isn't available).

    python -m app.reset_password

Asks for the email and the new password (the password is not shown while typing).
Works on whichever database the backend uses: your local Docker database by default,
or Neon/Render if DATABASE_URL is set in this PowerShell window.
"""
import getpass
import sys

from sqlalchemy import select
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.database import SessionLocal
from app.models import User
from app.security import hash_password


def main() -> None:
    with SessionLocal() as s:
        email = input("Email of the login to reset: ").strip().lower()
        try:
            user = s.scalar(select(User).where(User.email == email))
        except OperationalError:
            sys.exit("Can't reach the database. Check Docker is running, or that DATABASE_URL is right.")
        except ProgrammingError:
            sys.exit("This database has no tables yet. Run: alembic upgrade head")
        if user is None:
            sys.exit(f"No login found for {email}.")

        password = getpass.getpass("New password (at least 12 characters): ")
        if len(password) < 12 or not password.strip():
            sys.exit("The password must be at least 12 characters.")
        if getpass.getpass("Type it again: ") != password:
            sys.exit("The two passwords don't match. Nothing was changed.")

        user.password_hash = hash_password(password)
        if not user.is_active:
            print("Note: this login is deactivated. Activate it on the Users page before they sign in.")
        s.commit()
        print(f"Password updated for {email}. They can sign in now.")


if __name__ == "__main__":
    main()
