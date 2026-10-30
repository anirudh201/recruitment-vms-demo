
import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.database import check_database_connection


@pytest.mark.integration
def test_database_connection():
    """Verify that PostgreSQL accepts a database query."""
    assert check_database_connection() is True
