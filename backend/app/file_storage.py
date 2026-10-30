"""Where uploaded files (JDs, resumes) are kept.

FILE_STORAGE=disk (default): files go in a folder on the server, as before.
FILE_STORAGE=database: files are stored in the database. Use this on hosts whose disk is
wiped on every restart (e.g. Render's free tier), so uploads are not lost.
"""
import os
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.models import StoredFile

DB_PREFIX = "db:"


def use_database() -> bool:
    return os.getenv("FILE_STORAGE", "disk").strip().lower() == "database"


def _disk_path(folder: Path, key: str | None) -> Path | None:
    """Resolve a stored name inside folder, refusing anything outside it."""
    if not key or key.startswith(DB_PREFIX):
        return None
    base = folder.resolve()
    candidate = (base / key).resolve()
    return candidate if base in candidate.parents else None


def store(db: Session, folder: Path, extension: str, content: bytes, content_type: str) -> str:
    """Save new content and return the key to keep on the record (commit is up to the caller)."""
    if use_database():
        row = StoredFile(id=uuid.uuid4().hex, content=content, content_type=content_type, size=len(content))
        db.add(row)
        db.flush()
        return DB_PREFIX + row.id
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{extension}"
    (folder / name).write_bytes(content)
    return name


def discard_new(folder: Path, key: str | None) -> None:
    """Undo store() after a failed commit (database rows are already rolled back)."""
    path = _disk_path(folder, key)
    if path is not None:
        path.unlink(missing_ok=True)


def discard_old(db: Session, folder: Path, key: str | None) -> None:
    """Remove a file that has been replaced (after the new one was committed)."""
    if key and key.startswith(DB_PREFIX):
        row = db.get(StoredFile, key[len(DB_PREFIX):])
        if row is not None:
            db.delete(row)
            db.commit()
        return
    path = _disk_path(folder, key)
    if path is not None:
        path.unlink(missing_ok=True)


def _disposition(filename: str) -> str:
    ascii_name = filename.encode("ascii", "ignore").decode().replace('"', "") or "file"
    return f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


def file_response(db: Session, folder: Path, key: str | None, media_type: str, filename: str) -> Response | None:
    """The file as an HTTP response, or None if it cannot be found."""
    headers = {"X-Content-Type-Options": "nosniff"}
    if key and key.startswith(DB_PREFIX):
        row = db.get(StoredFile, key[len(DB_PREFIX):])
        if row is None:
            return None
        return Response(content=row.content, media_type=media_type, headers={**headers, "Content-Disposition": _disposition(filename)})
    path = _disk_path(folder, key)
    if path is None or not path.is_file():
        return None
    return FileResponse(path, media_type=media_type, filename=filename, content_disposition_type="inline", headers=headers)
