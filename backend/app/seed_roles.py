
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Permission, Role, role_permissions


ROLES = {
    "Super Admin": "Full administrative access to the VMS",
    "Recruiter": "Manage recruitment activities and candidate progress",
    "Vendor": "Access assigned jobs and permitted candidate submissions",
}

PERMISSIONS = {
    "users.manage": "Create and manage user accounts",
    "vendors.manage": "Create and manage vendor profiles",
    "clients.manage": "Create and manage client profiles and contacts",
    "jobs.view": "View authorized job requirements",
    "jobs.manage": "Create, edit, publish, close, and assign jobs",
    "candidates.view": "View candidates permitted to the current user",
    "candidates.submit": "Submit candidates against authorized jobs",
    "candidates.review": "Review candidate submissions",
    "candidates.status.update": "Update authorized recruitment statuses",
    "feedback.manage": "Create and manage candidate feedback",
    "reports.view": "View reports permitted to the current user",
    "audit_logs.view": "View audit logs when authorized",
}

ROLE_PERMISSION_CODES = {
    "Super Admin": set(PERMISSIONS.keys()),
    "Recruiter": {
        "jobs.view",
        "candidates.view",
        "candidates.review",
        "candidates.status.update",
        "feedback.manage",
        "reports.view",
    },
    "Vendor": {
        "jobs.view",
        "candidates.view",
        "candidates.submit",
    },
}


def seed_roles_and_permissions() -> None:
    with SessionLocal() as session:
        with session.begin():
            roles_by_name = {}
            permissions_by_code = {}

            for name, description in ROLES.items():
                role = session.scalar(
                    select(Role).where(Role.name == name)
                )

                if role is None:
                    role = Role(name=name, description=description)
                    session.add(role)

                roles_by_name[name] = role

            for code, description in PERMISSIONS.items():
                permission = session.scalar(
                    select(Permission).where(Permission.code == code)
                )

                if permission is None:
                    permission = Permission(
                        code=code,
                        description=description,
                    )
                    session.add(permission)

                permissions_by_code[code] = permission

            session.flush()

            for role_name, permission_codes in ROLE_PERMISSION_CODES.items():
                role = roles_by_name[role_name]


                existing_permission_ids = set(
                    session.scalars(
                        select(role_permissions.c.permission_id).where(
                            role_permissions.c.role_id == role.id
                        )
                    ).all()
                )

                for code in permission_codes:
                    permission = permissions_by_code[code]

                    if permission.id not in existing_permission_ids:
                        session.execute(
                            role_permissions.insert().values(
                                role_id=role.id,
                                permission_id=permission.id,
                            )
                        )

        print("Roles and permissions seeded successfully.")


if __name__ == "__main__":
    seed_roles_and_permissions()
