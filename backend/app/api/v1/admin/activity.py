from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import DbSession, csv_response, pdf_response
from app.schemas.activity import ActivityPage, ActivityPeriod, ActivityType
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, ExportFormat, ExportFormatQuery
from app.services import activity_service

router = APIRouter(prefix="/activity", tags=["admin: activity"])

TypeFilter = Annotated[ActivityType | None, Query(alias="type")]


@router.get("", response_model=ActivityPage)
def list_activity(
    db: DbSession,
    search: str | None = None,
    user_id: int | None = None,
    kind: TypeFilter = None,
    project_id: int | None = None,
    period: ActivityPeriod | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> ActivityPage:
    return activity_service.list_activity(
        db, search=search, user_id=user_id, kind=kind, project_id=project_id,
        period=period, page=page, page_size=page_size,
    )


@router.get("/export")
def export(
    db: DbSession,
    search: str | None = None,
    user_id: int | None = None,
    kind: TypeFilter = None,
    project_id: int | None = None,
    period: ActivityPeriod | None = None,
    export_format: ExportFormatQuery = ExportFormat.CSV,
) -> Response:
    filters = {"search": search, "user_id": user_id, "kind": kind, "project_id": project_id, "period": period}
    if export_format == ExportFormat.PDF:
        return pdf_response(activity_service.export_pdf(db, **filters), "taskflow-activity.pdf")
    return csv_response(activity_service.export_csv(db, **filters), "taskflow-activity.csv")
