from fastapi import APIRouter, Response

from app.api.deps import DbSession, csv_response, pdf_response
from app.schemas.common import ExportFormat, ExportFormatQuery
from app.schemas.stats import Overview, SidebarCounts, StatsPeriod
from app.services import stats_service

router = APIRouter(prefix="/stats", tags=["admin: stats"])


@router.get("/counts", response_model=SidebarCounts)
def counts(db: DbSession) -> SidebarCounts:
    return stats_service.sidebar_counts(db)


@router.get("/overview", response_model=Overview)
def overview(db: DbSession, period: StatsPeriod = StatsPeriod.LAST_30_DAYS) -> Overview:
    return stats_service.overview(db, period)


@router.get("/export")
def export(
    db: DbSession,
    period: StatsPeriod = StatsPeriod.LAST_30_DAYS,
    export_format: ExportFormatQuery = ExportFormat.CSV,
) -> Response:
    if export_format == ExportFormat.PDF:
        return pdf_response(stats_service.export_pdf(db, period), f"taskflow-report-{period.value}.pdf")
    return csv_response(
        stats_service.export_csv(db, period), f"taskflow-report-{period.value}.csv"
    )
