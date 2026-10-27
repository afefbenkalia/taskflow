from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import AdminUser, Client, DbSession, csv_response, pdf_response
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, ExportFormat, ExportFormatQuery
from app.schemas.project import (
    ProjectCreate,
    ProjectHealth,
    ProjectOut,
    ProjectPage,
    ProjectScope,
)
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["admin: projects"])


@router.get("", response_model=ProjectPage)
def list_projects(
    db: DbSession,
    scope: ProjectScope = ProjectScope.ACTIVE,
    search: str | None = None,
    owner_id: int | None = None,
    health: ProjectHealth | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> ProjectPage:
    return project_service.list_projects(
        db, scope=scope, search=search, owner_id=owner_id, health=health,
        page=page, page_size=page_size,
    )


@router.get("/export")
def export(db: DbSession, export_format: ExportFormatQuery = ExportFormat.CSV) -> Response:
    if export_format == ExportFormat.PDF:
        return pdf_response(project_service.export_pdf(db), "taskflow-projects.pdf")
    return csv_response(project_service.export_csv(db), "taskflow-projects.csv")


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    data: ProjectCreate, db: DbSession, admin: AdminUser, client: Client
) -> ProjectOut:
    return project_service.create_project(db, admin, data, client.ip)


@router.post("/{project_id}/archive", response_model=ProjectOut)
def archive_project(project_id: int, db: DbSession, admin: AdminUser, client: Client) -> ProjectOut:
    return project_service.set_archived(db, admin, project_id, True, client.ip)


@router.post("/{project_id}/unarchive", response_model=ProjectOut)
def unarchive_project(
    project_id: int, db: DbSession, admin: AdminUser, client: Client
) -> ProjectOut:
    return project_service.set_archived(db, admin, project_id, False, client.ip)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: DbSession, admin: AdminUser, client: Client) -> Response:
    project_service.delete_project(db, admin, project_id, client.ip)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
