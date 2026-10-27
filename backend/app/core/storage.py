"""Local disk storage for project files (settings.UPLOAD_DIR).

Files are stored under a random key, never under the name chosen by the user,
so uploads cannot escape the folder or overwrite each other.
"""

from collections.abc import Iterable
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from app.core.config import settings
from app.core.exceptions import AppError

CHUNK_SIZE = 1024 * 1024


def path_for(storage_key: str) -> Path:
    return settings.upload_path / storage_key


def save(source: BinaryIO, max_bytes: int) -> tuple[str, int]:
    """Copies `source` to a new file; returns (storage_key, size). 413 above `max_bytes`."""
    folder = settings.upload_path
    folder.mkdir(parents=True, exist_ok=True)
    storage_key = uuid4().hex
    target = folder / storage_key
    size = 0
    try:
        with target.open("wb") as output:
            while chunk := source.read(CHUNK_SIZE):
                size += len(chunk)
                if size > max_bytes:
                    raise AppError(
                        413,
                        "file_too_large",
                        f"Files must be {max_bytes // (1024 * 1024)} MB or smaller.",
                    )
                output.write(chunk)
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    return storage_key, size


def delete(storage_keys: Iterable[str]) -> None:
    for storage_key in storage_keys:
        path_for(storage_key).unlink(missing_ok=True)
