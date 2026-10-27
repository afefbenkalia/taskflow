from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.activity_log import ActivityLog
from app.models.project_member import ProjectMember
from app.models.task import Task, TaskStatus
from app.schemas.project import ProjectHealth
from app.services.project_service import compute_health, compute_progress, today
from tests.conftest import make_project, make_task

PROJECTS_URL = "/api/v1/admin/projects"
TODAY = date(2026, 10, 22)


# --- pure rules ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("done", "total", "expected"),
    [(0, 0, 0), (1, 3, 33), (2, 3, 67), (5, 10, 50), (10, 10, 100)],
)
def test_compute_progress(done, total, expected) -> None:
    assert compute_progress(done, total) == expected


@pytest.mark.parametrize(
    ("progress", "due_in_days", "expected"),
    [
        (100, -10, ProjectHealth.COMPLETED),  # completed wins over a passed date
        (90, -1, ProjectHealth.OVERDUE),
        (69, 14, ProjectHealth.AT_RISK),
        (69, 15, ProjectHealth.ON_TRACK),
        (70, 3, ProjectHealth.ON_TRACK),
        (10, None, ProjectHealth.ON_TRACK),
        (0, 0, ProjectHealth.AT_RISK),  # due today is not overdue yet
    ],
)
def test_compute_health(progress, due_in_days, expected) -> None:
    due = None if due_in_days is None else TODAY + timedelta(days=due_in_days)
    assert compute_health(progress, due, TODAY) == expected


# --- list ------------------------------------------------------------------------


@pytest.fixture
def portfolio(db_session: Session, admin_user, member_user):
    """One project of each health, plus an archived one."""
    on = today()
    on_track = make_project(db_session, admin_user, key="WEB", name="Website redesign",
                            due_date=on + timedelta(days=30), members=(member_user,))
    for status in (TaskStatus.DONE, TaskStatus.TODO, TaskStatus.TODO):
        make_task(db_session, on_track, status=status)

    at_risk = make_project(db_session, member_user, key="MOB", name="Mobile app",
                           due_date=on + timedelta(days=5))
    make_task(db_session, at_risk, status=TaskStatus.TODO)

    overdue = make_project(db_session, admin_user, key="CLP", name="Client portal",
                           due_date=on - timedelta(days=2))
    make_task(db_session, overdue, status=TaskStatus.IN_PROGRESS)

    completed = make_project(db_session, admin_user, key="HRD", name="HR dashboard",
                             due_date=on - timedelta(days=20))
    make_task(db_session, completed, status=TaskStatus.DONE)

    archived = make_project(db_session, admin_user, key="LCR", name="Legacy CRM", archived=True)
    return {"on_track": on_track, "at_risk": at_risk, "overdue": overdue,
            "completed": completed, "archived": archived}


def test_list_projects_progress_and_health(client: TestClient, admin_headers, portfolio) -> None:
    response = client.get(PROJECTS_URL, headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    by_key = {item["key"]: item for item in body["items"]}
    assert set(by_key) == {"WEB", "MOB", "CLP", "HRD"}  # active scope by default
    web = by_key["WEB"]
    assert (web["tasks_done"], web["tasks_total"], web["progress"]) == (1, 3, 33)
    assert web["health"] == "on_track"
    assert web["owner"]["full_name"] == "Afef Ben Kalia"
    assert [member["full_name"] for member in web["members"]] == ["Afef Ben Kalia", "Sarah Mansour"]
    assert by_key["MOB"]["health"] == "at_risk"
    assert by_key["CLP"]["health"] == "overdue"
    assert by_key["HRD"]["health"] == "completed"
    assert body["summary"] == {
        "active": 4, "on_track": 1, "at_risk": 1, "overdue": 1, "archived": 1, "all": 5,
    }


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"scope": "archived"}, {"LCR"}),
        ({"scope": "all"}, {"WEB", "MOB", "CLP", "HRD", "LCR"}),
        ({"health": "at_risk"}, {"MOB"}),
        ({"health": "completed"}, {"HRD"}),
        ({"search": "portal"}, {"CLP"}),
        ({"search": "hrd"}, {"HRD"}),
    ],
)
def test_list_projects_filters(client, admin_headers, portfolio, params, expected) -> None:
    body = client.get(PROJECTS_URL, headers=admin_headers, params=params).json()

    assert {item["key"] for item in body["items"]} == expected
    assert body["total"] == len(expected)


def test_list_projects_owner_filter(client, admin_headers, portfolio, member_user) -> None:
    body = client.get(PROJECTS_URL, headers=admin_headers, params={"owner_id": member_user.id}).json()

    assert [item["key"] for item in body["items"]] == ["MOB"]


# --- commands ----------------------------------------------------------------------


def test_archive_and_unarchive(client, admin_headers, db_session, portfolio) -> None:
    project_id = portfolio["on_track"].id

    archived = client.post(f"{PROJECTS_URL}/{project_id}/archive", headers=admin_headers)
    assert archived.status_code == 200
    assert archived.json()["archived"] is True
    assert client.post(f"{PROJECTS_URL}/{project_id}/archive", headers=admin_headers).status_code == 400

    restored = client.post(f"{PROJECTS_URL}/{project_id}/unarchive", headers=admin_headers)
    assert restored.status_code == 200
    assert restored.json()["archived"] is False

    actions = db_session.scalars(
        select(ActivityLog.action).where(ActivityLog.entity_type == "project")
        .order_by(ActivityLog.id)
    ).all()
    assert actions == ["project.archived", "project.unarchived"]


def test_create_project(client, admin_headers, db_session, member_user) -> None:
    response = client.post(
        PROJECTS_URL,
        headers=admin_headers,
        json={"name": "Data warehouse", "key": "dwh", "owner_id": member_user.id,
              "due_date": "2026-12-31", "color": "#7c3aed", "description": "ETL"},
    )

    assert response.status_code == 201
    body = response.json()
    assert (body["key"], body["color"], body["progress"], body["health"]) == (
        "DWH", "#7C3AED", 0, "on_track",
    )
    assert body["owner"]["id"] == member_user.id
    assert body["members_count"] == 1
    entry = db_session.scalars(select(ActivityLog).where(ActivityLog.action == "project.created")).one()
    assert entry.details["label"] == "Data warehouse"


def test_create_project_validation(client, admin_headers, portfolio, member_user) -> None:
    duplicate = client.post(
        PROJECTS_URL, headers=admin_headers,
        json={"name": "Web 2", "key": "WEB", "owner_id": member_user.id},
    )
    bad_key = client.post(
        PROJECTS_URL, headers=admin_headers,
        json={"name": "X", "key": "W3B", "owner_id": member_user.id},
    )

    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "project_key_taken"
    assert bad_key.status_code == 422
    assert bad_key.json()["errors"][0]["field"] == "key"


def test_delete_project_cascades(client, admin_headers, db_session, portfolio) -> None:
    project_id = portfolio["on_track"].id

    response = client.delete(f"{PROJECTS_URL}/{project_id}", headers=admin_headers)

    assert response.status_code == 204
    db_session.expire_all()
    assert db_session.scalars(select(Task).where(Task.project_id == project_id)).all() == []
    assert db_session.scalars(
        select(ProjectMember).where(ProjectMember.project_id == project_id)
    ).all() == []
    assert client.delete(f"{PROJECTS_URL}/{project_id}", headers=admin_headers).status_code == 404


def test_export_projects_csv(client, admin_headers, portfolio) -> None:
    response = client.get(f"{PROJECTS_URL}/export", headers=admin_headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    lines = response.text.strip().splitlines()
    assert lines[0].startswith("Key,Project,Owner")
    assert len(lines) == 1 + 5
    assert any(line.startswith("CLP,Client portal") and "Overdue" in line for line in lines)


# --- member view (/api/v1/projects/{id}) ------------------------------------------------


@pytest.fixture
def member_project(db_session: Session, admin_user, member_user, second_admin):
    """Owned by Sarah (member_user); Afef is a member; Amira is not."""
    on = today()
    project = make_project(db_session, member_user, key="HRD", name="HR dashboard",
                           due_date=on + timedelta(days=5), members=(admin_user,))
    make_task(db_session, project, status=TaskStatus.DONE, assignee=member_user)
    make_task(db_session, project, status=TaskStatus.TODO, assignee=admin_user)
    make_task(db_session, project, status=TaskStatus.TODO, assignee=member_user)
    return project


def bearer(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


@pytest.mark.parametrize("suffix", ["", "/tasks", "/members", "/permissions"])
def test_non_member_gets_404(client, member_project, second_admin, suffix) -> None:
    response = client.get(f"/api/v1/projects/{member_project.id}{suffix}", headers=bearer(second_admin))

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found", "code": "project_not_found"}


def test_unknown_project_gets_404(client, member_headers) -> None:
    assert client.get("/api/v1/projects/999999", headers=member_headers).status_code == 404


def test_project_detail_owner_vs_member(client, member_project, member_user, admin_user) -> None:
    owner = client.get(f"/api/v1/projects/{member_project.id}", headers=bearer(member_user)).json()
    member = client.get(f"/api/v1/projects/{member_project.id}", headers=bearer(admin_user)).json()

    assert owner["my_role"] == "owner"
    assert member["my_role"] == "member"
    assert (owner["tasks_done"], owner["tasks_count"], owner["progress"]) == (1, 3, 33)
    assert owner["health"] == "at_risk"  # due in 5 days with 33% done
    assert owner["members_count"] == 2
    assert owner["owner"]["full_name"] == "Sarah Mansour"


def test_project_permissions_owner_vs_member(client, member_project, member_user, admin_user) -> None:
    def allowed(user) -> dict[str, bool]:
        rows = client.get(f"/api/v1/projects/{member_project.id}/permissions", headers=bearer(user)).json()
        return {row["label"]: row["allowed"] for row in rows}

    member = allowed(admin_user)
    assert member == {
        "Create tasks": True,
        "Update status of your tasks": True,
        "Comment on any task": True,
        "Edit project settings": False,
        "Manage members": False,
        "Archive or delete the project": False,
    }
    assert all(allowed(member_user).values())


def test_project_members_owner_first(client, member_project, admin_user) -> None:
    rows = client.get(f"/api/v1/projects/{member_project.id}/members", headers=bearer(admin_user)).json()

    assert [(row["user"]["full_name"], row["role_in_project"], row["is_self"]) for row in rows] == [
        ("Sarah Mansour", "owner", False),
        ("Afef Ben Kalia", "member", True),
    ]


def test_project_tasks_status_permissions(client, member_project, member_user, admin_user) -> None:
    as_member = client.get(f"/api/v1/projects/{member_project.id}/tasks", headers=bearer(admin_user)).json()
    as_owner = client.get(f"/api/v1/projects/{member_project.id}/tasks", headers=bearer(member_user)).json()

    # A member can only change their own tasks; the owner can change every task.
    assert sorted(task["can_change_status"] for task in as_member) == [False, False, True]
    assert all(task["can_change_status"] for task in as_owner)
    assert len(as_owner) == 3
