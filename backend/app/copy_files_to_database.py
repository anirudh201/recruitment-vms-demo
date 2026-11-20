"""Copy uploaded JDs and resumes from this PC's uploads folder into the database.

Use this when the demo (Render + Neon) shows "The stored JD file could not be found on the server"
or a resume is missing: the records were copied to Neon, but the files themselves stayed on this PC.

    $env:DATABASE_URL="postgresql://...your Neon link..."
    python -m app.copy_files_to_database

Run it from the backend folder on the PC that has the files (backend/uploads/jd and
backend/uploads/resumes). It only adds files that are missing and can be run again safely.
Files already in the database are left alone. Nothing is deleted from this PC.
"""
import sys
import uuid

from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app import file_storage
from app.candidates import RESUME_UPLOAD_DIR
from app.database import DATABASE_URL, SessionLocal
from app.jobs import JD_UPLOAD_DIR
from app.models import Candidate, CandidateSubmission, Job, StoredFile

# (record type, file column, file type column, folder on this PC, what to call it)
SOURCES = [
    (Job, "jd_file_path", "jd_content_type", JD_UPLOAD_DIR, "job JD"),
    (CandidateSubmission, "resume_file_path", "resume_content_type", RESUME_UPLOAD_DIR, "submission resume"),
    (Candidate, "profile_resume_path", "profile_resume_type", RESUME_UPLOAD_DIR, "TalentVault resume"),
]


def main() -> None:
    host = DATABASE_URL.host or "(local)"
    print(f"Database: {host} / {DATABASE_URL.database}")
    print(f"Reading files from: {JD_UPLOAD_DIR}  and  {RESUME_UPLOAD_DIR}")
    if input("Copy the missing files into this database? Type yes: ").strip().lower() != "yes":
        sys.exit("Nothing was changed.")

    copied, missing = 0, []
    moved: dict[str, str] = {}  # same file used by two records -> one copy, shared like before
    with SessionLocal() as db:
        try:
            for model, column, type_column, folder, label in SOURCES:
                attribute = getattr(model, column)
                rows = db.scalars(
                    select(model).where(attribute.is_not(None), ~attribute.startswith(file_storage.DB_PREFIX))
                ).all()
                for row in rows:
                    key = getattr(row, column)
                    if key in moved:
                        setattr(row, column, moved[key])
                        db.commit()
                        continue
                    content = file_storage.read_bytes(db, folder, key)
                    if content is None:
                        missing.append(f"{label} #{row.id} ({key})")
                        continue
                    stored = StoredFile(
                        id=uuid.uuid4().hex,
                        content=content,
                        content_type=getattr(row, type_column) or "application/octet-stream",
                        size=len(content),
                    )
                    db.add(stored)
                    moved[key] = file_storage.DB_PREFIX + stored.id
                    setattr(row, column, moved[key])
                    db.commit()
                    copied += 1
        except OperationalError:
            sys.exit("Can't reach the database. Check the DATABASE_URL link (or that Docker is running).")

    print(f"Done: {copied} file(s) copied into the database.")
    if missing:
        print(f"{len(missing)} file(s) are not on this PC either, so they need uploading again on the website:")
        for item in missing:
            print("   -", item)


if __name__ == "__main__":
    main()
