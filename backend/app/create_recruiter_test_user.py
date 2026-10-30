
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Organization, Role, User, user_roles
from app.security import hash_password


EMAIL = "recruiter.test@example.com"
PASSWORD = "RecruiterTest123!"


def create_recruiter_test_user():
    with SessionLocal() as session:
        with session.begin():
            organization = session.scalar(
                select(Organization).where(
                    Organization.name == "VMS Test Organization"
                )
            )

            if organization is None:
                raise RuntimeError(
                    "VMS Test Organization not found. "
                    "Run the existing test-user script first."
                )

            user = session.scalar(
                select(User).where(User.email == EMAIL)
            )

            if user is None:
                user = User(
                    organization_id=organization.id,
                    email=EMAIL,
                    password_hash=hash_password(PASSWORD),
                    is_active=True,
                )
                session.add(user)
                session.flush()

            role = session.scalar(
                select(Role).where(Role.name == "Recruiter")
            )

            if role is None:
                raise RuntimeError(
                    "Recruiter role not found. Run the role seed script first."
                )

            existing_role = session.execute(
                select(user_roles.c.user_id).where(
                    user_roles.c.user_id == user.id,
                    user_roles.c.role_id == role.id,
                )
            ).first()

            if existing_role is None:
                session.execute(
                    user_roles.insert().values(
                        user_id=user.id,
                        role_id=role.id,
                    )
                )

    print("Recruiter test user created or already exists.")
    print(f"Email: {EMAIL}")


if __name__ == "__main__":
    create_recruiter_test_user()
