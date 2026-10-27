import re
from pathlib import Path, PurePath
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import permissions, storage
from app.core.config import settings
from app.core.exceptions import AppError
from app.models.project import Project
from app.models.project_file import ProjectFile
from app.models.user import User
from app.schemas.project import ProjectFileOut
from app.schemas.user import UserBrief
from app.services import activity_service, project_service

NAME_MAX_LENGTH = 255
DEFAULT_CONTENT_TYPE = "application/octet-stream"
CONTENT_TYPE_PATTERN = re.compile(r"^[\w.+-]+/[\w.+-]+$")
# Control characters and the characters Windows refuses in file names.
UNSAFE_NAME_CHARS = re.compile(r'[\x00-\x1f\x7f<>:"/\\|?*]')


def clean_name(filename: str | None) -> str:
    """Keeps the last path segment, without control or reserved characters."""
    name = PurePath((filename or "").replace("\\", "/")).name
    name = UNSAFE_NAME_CHARS.sub("_", name).strip(" .")
    if len(name) > NAME_MAX_LENGTH:
        stem, dot, extension = name.rpartition(".")
        if dot and len(extension) <= 16:
            name = stem[: NAME_MAX_LENGTH - len(extension) - 1] + "." + extension
        else:
            name = name[:NAME_MAX_LENGTH]
    return name or "file"


def clean_content_type(content_type: str | None) -> str:
    value = (content_type or "").split(";")[0].strip().lower()
    return value if CONTENT_TYPE_PATTERN.fullmatch(value) and len(value) <= 127 else DEFAULT_CONTENT_TYPE


def _serialize(user: User, project: Project, files: list[ProjectFile]) -> list[ProjectFileOut]:
    return [
        ProjectFileOut(
            id=file.id,
            name=file.name,
            content_type=file.content_type,
            size_bytes=file.size_bytes,
            uploaded_by=UserBrief.model_validate(file.uploader) if file.uploader else None,
            created_at=file.created_at,
            can_delete=permissions.can_delete_file(user, file, project),
        )
        for file in files
    ]


def list_files(db: Session, user: User, project: Project) -> list[ProjectFileOut]:
    files = db.scalars(
        select(ProjectFile)
        .where(ProjectFile.project_id == project.id)
        .order_by(ProjectFile.created_at.desc(), ProjectFile.id.desc())
    ).all()
    return _serialize(user, project, list(files))


def _log(db: Session, user: User, action: str, project: Project, file: ProjectFile, ip: str | None) -> None:
    activity_service.log(
        db, user.id, action, "file", file.id,
        {"label": file.name, "project_id": project.id, "project": project.name,
         "size_bytes": file.size_bytes},
        ip,
    )


def upload_file(
    db: Session,
    user: User,
    project: Project,
    *,
    filename: str | None,
    content_type: str | None,
    content: BinaryIO,
    ip: str | None,
) -> ProjectFileOut:
    if not permissions.can_upload_file(user, project, project_service.member_ids(db, project.id)):
        raise AppError(403, "file_upload_forbidden", "Only project members can upload files.")

    storage_key, size = storage.save(content, settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024)
    if size == 0:
        storage.delete([storage_key])
        raise AppError(400, "file_empty", "The file is empty.")

    file = ProjectFile(
        project_id=project.id,
        uploader_id=user.id,
        name=clean_name(filename),
        content_type=clean_content_type(content_type),
        size_bytes=size,
        storage_key=storage_key,
    )
    try:
        db.add(file)
        db.flush()
        _log(db, user, "file.uploaded", project, file, ip)
        db.commit()
    except BaseException:
        db.rollback()
        storage.delete([storage_key])
        raise
    db.refresh(file)
    return _serialize(user, project, [file])[0]


def get_file(db: Session, project: Project, file_id: int) -> ProjectFile:
    """The file row, or 404 when it does not belong to this project."""
    file = db.get(ProjectFile, file_id)
    if file is None or file.project_id != project.id:
        raise AppError(404, "file_not_found", "File not found.")
    return file


def file_path(file: ProjectFile) -> Path:
    path = storage.path_for(file.storage_key)
    if not path.is_file():
        raise AppError(404, "file_not_found", "File not found.")
    return path


def delete_file(db: Session, user: User, project: Project, file_id: int, ip: str | None) -> None:
    file = get_file(db, project, file_id)
    if not permissions.can_delete_file(user, file, project):
        raise AppError(
            403, "file_delete_forbidden", "Only the uploader or the project owner can delete this file."
        )
    _log(db, user, "file.deleted", project, file, ip)
    storage_key = file.storage_key
    db.delete(file)
    db.commit()
    storage.delete([storage_key])
