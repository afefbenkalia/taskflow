"""PDF exports of the admin console (?format=pdf on the three /export endpoints)."""

import io
from datetime import UTC, datetime, timedelta

import pytest
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.core.pdf import PdfTable, build_pdf
from app.models.activity_log import ActivityLog
from app.models.task import TaskStatus
from app.services import activity_service
from tests.conftest import make_project, make_task

ADMIN = "/api/v1/admin"


def pdf_text(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() for page in reader.pages)


def assert_pdf(response, filename: str) -> str:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == f'attachment; filename="{filename}"'
    assert response.content.startswith(b"%PDF")
    return pdf_text(response.content)


@pytest.fixture
def workspace(db_session: Session, admin_user, member_user):
    web = make_project(db_session, admin_user, key="WEB", name="Website redesign", members=(member_user,))
    for status in (TaskStatus.DONE, TaskStatus.TODO, TaskStatus.IN_PROGRESS):
        make_task(db_session, web, status=status, assignee=member_user)
    make_project(db_session, member_user, key="LCR", name="Legacy CRM", archived=True)
    return web


def test_projects_pdf(client, admin_headers, workspace) -> None:
    response = client.get(f"{ADMIN}/projects/export", headers=admin_headers, params={"format": "pdf"})

    text = assert_pdf(response, "taskflow-projects.pdf")
    assert "All projects" in text
    assert "2 (1 active, 1 archived)" in text
    assert "Website redesign" in text and "Legacy CRM" in text
    assert "33%" in text and "1 / 3" in text
    assert "Page 1 of 1" in text


def test_report_pdf(client, admin_headers, workspace) -> None:
    response = client.get(f"{ADMIN}/stats/export", headers=admin_headers,
                          params={"period": "7d", "format": "pdf"})

    text = assert_pdf(response, "taskflow-report-7d.pdf")
    for heading in ("Workspace report", "Last 7 days", "Key figures", "Tasks by status", "Completion",
                    "Weekly throughput", "Team workload"):
        assert heading in text
    assert "Sarah Mansour" in text


@pytest.fixture
def events(db_session: Session, admin_user, member_user, workspace):
    now = datetime.now(UTC)
    db_session.add_all([
        ActivityLog(actor_id=admin_user.id, action="project.created", entity_type="project",
                    entity_id=workspace.id, details={"label": "Website redesign", "key": "WEB"},
                    ip_address="196.203.12.44", created_at=now - timedelta(hours=1)),
        ActivityLog(actor_id=member_user.id, action="auth.login", entity_type="user",
                    entity_id=member_user.id, details={"client": "Chrome · Windows"},
                    ip_address="41.230.77.2", created_at=now - timedelta(hours=2)),
    ])
    db_session.commit()


def test_activity_pdf_follows_filters(client, admin_headers, events, member_user) -> None:
    response = client.get(f"{ADMIN}/activity/export", headers=admin_headers,
                          params={"format": "pdf", "user_id": member_user.id, "period": "7d"})

    text = assert_pdf(response, "taskflow-activity.pdf")
    assert "Activity log" in text
    assert "User: Sarah Mansour" in text and "Period: Last 7 days" in text
    assert "Signed in from Chrome · Windows" in text
    assert "41.230.77.2" in text
    assert "Created project" not in text  # Afef's event is filtered out


def test_activity_pdf_is_capped(client, admin_headers, db_session, admin_user, monkeypatch) -> None:
    monkeypatch.setattr(activity_service, "PDF_MAX_ROWS", 3)
    now = datetime.now(UTC)
    db_session.add_all([
        ActivityLog(actor_id=admin_user.id, action="auth.logout", entity_type="user",
                    entity_id=admin_user.id, created_at=now - timedelta(minutes=minute))
        for minute in range(5)
    ])
    db_session.commit()

    text = assert_pdf(
        client.get(f"{ADMIN}/activity/export", headers=admin_headers, params={"format": "pdf"}),
        "taskflow-activity.pdf",
    )

    assert "3 of 5 (most recent; export CSV for all)" in text
    assert text.count("Signed out") == 3


def test_empty_exports_still_render(client, admin_headers) -> None:
    projects = assert_pdf(client.get(f"{ADMIN}/projects/export", headers=admin_headers,
                                     params={"format": "pdf"}), "taskflow-projects.pdf")
    activity = assert_pdf(client.get(f"{ADMIN}/activity/export", headers=admin_headers,
                                     params={"format": "pdf", "search": "nothing-matches"}),
                          "taskflow-activity.pdf")

    assert "No projects yet." in projects
    assert "No activity matches these filters." in activity


def test_csv_stays_the_default(client, admin_headers, workspace) -> None:
    response = client.get(f"{ADMIN}/projects/export", headers=admin_headers)

    assert response.headers["content-type"].startswith("text/csv")
    assert response.text.startswith("Key,Project,Owner")


@pytest.mark.parametrize("path", ["/projects/export", "/stats/export", "/activity/export"])
def test_pdf_exports_are_admin_only(client, member_headers, path) -> None:
    response = client.get(f"{ADMIN}{path}", headers=member_headers, params={"format": "pdf"})

    assert response.status_code == 403


def test_unknown_format_is_rejected(client, admin_headers) -> None:
    response = client.get(f"{ADMIN}/projects/export", headers=admin_headers, params={"format": "xlsx"})

    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "format"


def test_long_tables_span_pages_with_numbering() -> None:
    rows = [[f"Row {index}", index] for index in range(120)]

    text = pdf_text(build_pdf("Long table", [PdfTable(headers=["Name", "Value"], rows=rows)]))

    assert "Row 0" in text and "Row 119" in text
    assert "Page 1 of " in text and "Page 2 of " in text
    # The header row repeats on every page.
    assert text.count("Name") >= 2


def test_text_is_escaped() -> None:
    text = pdf_text(build_pdf("Escaping", [PdfTable(headers=["Value"], rows=[["<b>R&D</b> ’quoted’"]])]))

    assert "<b>R&D</b> ’quoted’" in text
