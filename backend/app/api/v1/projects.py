from typing import Annotated

from fastapi import APIRouter, File, Query, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import Client, CurrentUser, DbSession, MemberProject
from app.schemas.activity import ProjectActivityPage
from app.schemas.project import (
    MemberAdd,
    MemberCandidate,
    PermissionOut,
    ProjectDetail,
    ProjectFileOut,
    ProjectMemberOut,
)
from app.schemas.task import TaskOut
from app.services import activity_service, file_service, project_service, task_service

# Member view: every route answers 404 unless the user belongs to the project.
router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/{project_id}", response_model=ProjectDetail)
def project_detail(project: MemberProject, db: DbSession, user: CurrentUser) -> ProjectDetail:
    return project_service.project_detail(db, user, project)


@router.get("/{project_id}/tasks", response_model=list[TaskOut])
def project_tasks(project: MemberProject, db: DbSession, user: CurrentUser) -> list[TaskOut]:
    return task_service.project_tasks(db, user, project)


@router.get("/{project_id}/members", response_model=list[ProjectMemberOut])
def project_members(
    project: MemberProject, db: DbSession, user: CurrentUser
) -> list[ProjectMemberOut]:
    return project_service.project_members(db, user, project)


@router.get("/{project_id}/member-candidates", response_model=list[MemberCandidate])
def member_candidates(
    project: MemberProject, db: DbSession, user: CurrentUser
) -> list[MemberCandidate]:
    return project_service.member_candidates(db, user, project)


@router.post(
    "/{project_id}/members",
    response_model=list[ProjectMemberOut],
    status_code=status.HTTP_201_CREATED,
)
def add_member(
    data: MemberAdd, project: MemberProject, db: DbSession, user: CurrentUser, client: Client
) -> list[ProjectMemberOut]:
    return project_service.add_member(db, user, project, data.user_id, client.ip)


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    user_id: int, project: MemberProject, db: DbSession, user: CurrentUser, client: Client
) -> Response:
    project_service.remove_member(db, user, project, user_id, client.ip)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/permissions", response_model=list[PermissionOut])
def project_permissions(
    project: MemberProject, db: DbSession, user: CurrentUser
) -> list[PermissionOut]:
    return project_service.project_permissions(db, user, project)


@router.get("/{project_id}/activity", response_model=ProjectActivityPage)
def project_activity(
    project: MemberProject,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> ProjectActivityPage:
    return activity_service.project_activity(db, project.id, page=page, page_size=page_size)


@router.get("/{project_id}/files", response_model=list[ProjectFileOut])
def project_files(project: MemberProject, db: DbSession, user: CurrentUser) -> list[ProjectFileOut]:
    return file_service.list_files(db, user, project)


@router.post(
    "/{project_id}/files", response_model=ProjectFileOut, status_code=status.HTTP_201_CREATED
)
def upload_file(
    file: Annotated[UploadFile, File()],
    project: MemberProject,
    db: DbSession,
    user: CurrentUser,
    client: Client,
) -> ProjectFileOut:
    return file_service.upload_file(
        db, user, project,
        filename=file.filename, content_type=file.content_type, content=file.file, ip=client.ip,
    )


@router.get("/{project_id}/files/{file_id}/download")
def download_file(file_id: int, project: MemberProject, db: DbSession) -> FileResponse:
    file = file_service.get_file(db, project, file_id)
    return FileResponse(
        file_service.file_path(file),
        media_type=file.content_type,
        filename=file.name,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.delete("/{project_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: int, project: MemberProject, db: DbSession, user: CurrentUser, client: Client
) -> Response:
    file_service.delete_file(db, user, project, file_id, client.ip)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
