from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog
from app.models.task import TaskStatus
from app.services.project_service import today
from tests.conftest import make_project, make_task

ACTIVITY_URL = "/api/v1/admin/activity"
OVERVIEW_URL = "/api/v1/admin/stats/overview"


@pytest.fixture
def events(db_session: Session, admin_user, member_user, second_admin):
    now = datetime.now(UTC)
    project = make_project(db_session, admin_user, key="HRD", name="HR dashboard")

    def add(actor, action, entity_type, entity_id, details, age):
        db_session.add(ActivityLog(
            actor_id=actor.id, action=action, entity_type=entity_type, entity_id=entity_id,
            details=details, ip_address="196.203.12.44", created_at=now - age,
        ))

    add(admin_user, "user.role_changed", "user", second_admin.id,
        {"label": "Amira Mejri", "from": "user", "to": "admin"}, timedelta(hours=1))
    add(admin_user, "project.created", "project", project.id,
        {"label": "HR dashboard", "key": "HRD"}, timedelta(hours=2))
    add(member_user, "auth.login", "user", member_user.id,
        {"client": "Chrome · Windows"}, timedelta(hours=3))
    add(member_user, "auth.denied", "route", None,
        {"method": "GET", "path": "/api/v1/admin/users"}, timedelta(days=2))
    add(admin_user, "user.deactivated", "user", member_user.id,
        {"label": "Sarah Mansour"}, timedelta(days=20))
    db_session.commit()
    return project


def items(response) -> list[dict]:
    assert response.status_code == 200
    return response.json()["items"]


def test_list_activity_newest_first(client: TestClient, admin_headers, events) -> None:
    rows = items(client.get(ACTIVITY_URL, headers=admin_headers))

    assert [row["action"] for row in rows] == [
        "user.role_changed", "project.created", "auth.login", "auth.denied", "user.deactivated",
    ]
    role = rows[0]
    assert role["type"] == "role"
    assert role["actor"]["full_name"] == "Afef Ben Kalia"
    assert role["entity_label"] == "Amira Mejri"
    assert (role["target_kind"], role["target_label"]) == ("user", "User")
    assert role["ip"] == "196.203.12.44"
    denied = rows[3]
    assert (denied["type"], denied["entity_label"]) == ("denied", "/admin/users")
    assert (denied["target_kind"], denied["target_label"]) == ("security", "Security")
    assert (rows[2]["target_kind"], rows[1]["target_kind"]) == ("session", "project")


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"type": "role"}, ["user.role_changed"]),
        ({"type": "auth"}, ["auth.login"]),
        ({"type": "denied"}, ["auth.denied"]),
        ({"type": "deactivate"}, ["user.deactivated"]),
        ({"period": "24h"}, ["user.role_changed", "project.created", "auth.login"]),
        ({"period": "7d"}, ["user.role_changed", "project.created", "auth.login", "auth.denied"]),
        ({"search": "dashboard"}, ["project.created"]),
        ({"search": "sarah"}, ["auth.login", "auth.denied", "user.deactivated"]),
    ],
)
def test_activity_filters(client, admin_headers, events, params, expected) -> None:
    rows = items(client.get(ACTIVITY_URL, headers=admin_headers, params=params))

    assert [row["action"] for row in rows] == expected


def test_activity_user_and_project_filters(client, admin_headers, events, member_user) -> None:
    by_user = items(client.get(ACTIVITY_URL, headers=admin_headers, params={"user_id": member_user.id}))
    by_project = items(client.get(ACTIVITY_URL, headers=admin_headers, params={"project_id": events.id}))

    assert {row["actor"]["id"] for row in by_user} == {member_user.id}
    assert [row["action"] for row in by_project] == ["project.created"]


def test_activity_pagination(client, admin_headers, events) -> None:
    body = client.get(ACTIVITY_URL, headers=admin_headers, params={"page": 2, "page_size": 2}).json()

    assert body["total"] == 5
    assert [row["action"] for row in body["items"]] == ["auth.login", "auth.denied"]


def test_export_activity_csv_is_filtered(client, admin_headers, events) -> None:
    response = client.get(f"{ACTIVITY_URL}/export", headers=admin_headers, params={"period": "7d"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    lines = response.text.strip().splitlines()
    assert lines[0] == "Time,User,Role,Action,Type,Target,IP address"
    assert len(lines) == 1 + 4
    assert "Changed role of Amira Mejri from Member to Admin" in response.text
    assert "Blocked request to /admin/users — 403 Forbidden" in response.text
    assert "Deactivated Sarah Mansour" not in response.text  # older than 7 days


def test_admin_actions_appear_in_activity(client, admin_headers, member_user) -> None:
    client.patch(f"/api/v1/admin/users/{member_user.id}/role", headers=admin_headers, json={"role": "admin"})

    rows = items(client.get(ACTIVITY_URL, headers=admin_headers, params={"type": "role"}))

    assert rows[0]["entity_label"] == "Sarah Mansour"
    assert rows[0]["details"]["to"] == "admin"


# --- overview ----------------------------------------------------------------------


@pytest.fixture
def workload(db_session: Session, admin_user, member_user, second_admin):
    on = today()
    now = datetime.now(UTC)
    project = make_project(db_session, admin_user, members=(member_user,))
    archived = make_project(db_session, admin_user, key="OLD", name="Old", archived=True)

    make_task(db_session, project, status=TaskStatus.DONE, assignee=member_user,
              created_at=now - timedelta(days=10), completed_at=now - timedelta(days=2))
    make_task(db_session, project, status=TaskStatus.DONE, assignee=member_user,
              created_at=now - timedelta(days=50), completed_at=now - timedelta(days=40))
    make_task(db_session, project, status=TaskStatus.IN_PROGRESS, assignee=member_user,
              due_date=on + timedelta(days=5))
    make_task(db_session, project, status=TaskStatus.TODO, assignee=second_admin)
    # Overdue: counted only as overdue, never as todo/in progress.
    make_task(db_session, project, status=TaskStatus.TODO, assignee=member_user,
              created_at=now - timedelta(days=9), due_date=on - timedelta(days=3))
    # Tasks of archived projects are excluded from statistics.
    make_task(db_session, archived, status=TaskStatus.TODO, assignee=member_user)
    return project


def test_overview_values_are_consistent(client, admin_headers, workload) -> None:
    response = client.get(OVERVIEW_URL, headers=admin_headers, params={"period": "30d"})

    assert response.status_code == 200
    body = response.json()
    assert body["period"] == "30d"
    status = body["status"]
    assert status == {"done": 2, "in_progress": 1, "todo": 1, "overdue": 1, "total": 5, "projects": 1}
    assert status["done"] + status["in_progress"] + status["todo"] + status["overdue"] == status["total"]
    assert body["completion_rate"] == 40

    kpis = {kpi["key"]: kpi for kpi in body["kpis"]}
    assert [kpi["label"] for kpi in body["kpis"]] == [
        "Total users", "Active projects", "Tasks completed", "Overdue tasks",
    ]
    assert kpis["users"]["value"] == 3
    assert kpis["projects"]["value"] == 1
    assert kpis["completed"]["value"] == 1  # the other completion is 40 days old
    assert kpis["completed"]["delta"] == 0  # 1 vs 1 in the previous 30 days
    assert kpis["overdue"]["value"] == 1
    assert all(len(kpi["sparkline"]) == 8 for kpi in body["kpis"])
    assert kpis["users"]["sparkline"][-1] == kpis["users"]["value"]

    throughput = body["throughput"]
    assert len(throughput) == 8
    assert throughput[-1]["label"] == f"W{today().isocalendar().week}"
    assert sum(week["completed"] for week in throughput) == 2

    workload = [(entry["user"]["full_name"], entry["open_tasks"]) for entry in body["workload"]]
    assert workload[:2] == [("Sarah Mansour", 2), ("Amira Mejri", 1)]
    assert all(entry["capacity"] == 10 for entry in body["workload"])


def test_overview_admin_activity(client, admin_headers, events) -> None:
    body = client.get(OVERVIEW_URL, headers=admin_headers).json()

    assert [entry["action"] for entry in body["admin_activity"]] == [
        "user.role_changed", "project.created", "user.deactivated",
    ]


def test_sidebar_counts(client, admin_headers, workload) -> None:
    body = client.get("/api/v1/admin/stats/counts", headers=admin_headers).json()

    assert body == {"users": 3, "projects": 1, "tasks": 5}


def test_overview_export_csv(client, admin_headers, workload) -> None:
    response = client.get("/api/v1/admin/stats/export", headers=admin_headers, params={"period": "7d"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.text.splitlines()[0] == "Section,Metric,Value,Delta"
    assert "KPI,Total users,3" in response.text


def test_invalid_period_is_rejected(client, admin_headers) -> None:
    response = client.get(OVERVIEW_URL, headers=admin_headers, params={"period": "1y"})

    assert response.status_code == 422
