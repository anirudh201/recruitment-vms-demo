
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db_dependencies import get_db
from app.main import app
from app.models import Base, Organization, Permission, Role, User
from app.security import create_access_token, hash_password


@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as session:
        yield session

    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def test_context(test_db):
    organization = Organization(name="Test Organization")
    other_organization = Organization(name="Other Test Organization")
    test_db.add_all([organization, other_organization])
    test_db.flush()

    client_permission = Permission(
        code="clients.manage",
        description="Manage client profiles and contacts",
    )
    jobs_manage_permission = Permission(
        code="jobs.manage",
        description="Manage jobs",
    )
    jobs_view_permission = Permission(
        code="jobs.view",
        description="View jobs",
    )
    admin_role = Role(name="Test Super Admin")
    recruiter_role = Role(name="Test Recruiter")
    vendor_role = Role(name="Test Vendor")

    admin_role.permissions.extend(
        [
            client_permission,
            jobs_manage_permission,
            jobs_view_permission,
        ]
    )
    test_db.add_all([admin_role, recruiter_role, vendor_role])
    test_db.flush()

    admin = User(
        organization_id=organization.id,
        email="admin.test@example.com",
        password_hash=hash_password("TestAdmin123!"),
        is_active=True,
        roles=[admin_role],
    )
    recruiter = User(
        organization_id=organization.id,
        email="recruiter.test@example.com",
        password_hash=hash_password("TestRecruiter123!"),
        is_active=True,
        roles=[recruiter_role],
    )
    vendor = User(
        organization_id=organization.id,
        email="vendor.test@example.com",
        password_hash=hash_password("TestVendor123!"),
        is_active=True,
        roles=[vendor_role],
    )
    other_admin = User(
        organization_id=other_organization.id,
        email="other.admin.test@example.com",
        password_hash=hash_password("TestOtherAdmin123!"),
        is_active=True,
        roles=[admin_role],
    )

    test_db.add_all([admin, recruiter, vendor, other_admin])
    test_db.commit()

    return {
        "organization": organization,
        "other_organization": other_organization,
        "admin": admin,
        "recruiter": recruiter,
        "vendor": vendor,
        "other_admin": other_admin,
    }


@pytest.fixture
def api_client(test_db):
    def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(test_context):
    def make_headers(user):
        token = create_access_token(user.id)
        return {"Authorization": f"Bearer {token}"}

    return make_headers
