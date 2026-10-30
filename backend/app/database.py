
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import sessionmaker


# Locate backend/.env
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Database connection: either one DATABASE_URL (as hosted databases such as Neon provide,
# e.g. postgresql://user:pass@host/db?sslmode=require) or the separate DB_* settings.
_database_url = os.getenv("DATABASE_URL", "").strip()
if _database_url:
    DATABASE_URL = make_url(_database_url)
    if DATABASE_URL.drivername in ("postgres", "postgresql"):
        DATABASE_URL = DATABASE_URL.set(drivername="postgresql+psycopg")
else:
    DB_HOST = os.environ["DB_HOST"]
    DB_PORT = int(os.environ["DB_PORT"])
    DB_NAME = os.environ["DB_NAME"]
    DB_USER = os.environ["DB_USER"]
    DB_PASSWORD = os.environ["DB_PASSWORD"]

    # Build a connection URL safely
    DATABASE_URL = URL.create(
        drivername="postgresql+psycopg",
        username=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
    )

# Create SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

# Create session factory
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


def check_database_connection() -> bool:
    """Verify that PostgreSQL accepts a simple SQL query."""
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))
        return result.scalar_one() == 1
