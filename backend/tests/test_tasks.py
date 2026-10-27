from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.activity_log import ActivityLog
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User
from app.services.project_service import today
from tests.conftest import MEMBER_PASSWORD, make_project, make_task, make_user

TASKS_URL = "/api/v1/tasks"


def bearer(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


@pytest.fixture
def karim(db_session: Session) -> User:
    return make_user(db_session, first_name="Karim", last_name="Bouzid", email="karim.b@taskflow.io",
                     password=MEMBER_PASSWORD)


@pytest.fixture
def amira(db_session: Session) -> User:
    return make_user(db_session, first_name="Amira", last_name="Mejri", email="amira.m@taskflow.io",
                     password=MEMBER_PASSWORD)


@pytest.fixture
def outsider(db_session: Session) -> User:
    return make_user(db_session, first_name="Omar", last_name="Jaziri", email="omar.j@taskflow.io",
                     password=MEMBER_PASSWORD)


@pytest.fixture
def project(db_session: Session, karim, member_user, amira):
    """Owned by Karim; Sarah (member_user) and Amira are members."""
    return make_project(db_session, karim, key="WEB", name="Website redesign",
                        due_date=today() + timedelta(days=30), members=(member_user, amira))


@pytest.fixture
def sarah_task(db_session: Session, project, member_user) -> Task:
    return make_task(db_session, project, status=TaskStatus.TODO, assignee=member_user)


# --- create ------------------------------------------------------------------------


def test_create_task(client: TestClient, db_session, project, member_user) -> None:
    response = client.post(
        TASKS_URL,
        headers=bearer(member_user),
        json={"title": "Homepage mockup", "project_id": project.id, "priority": "high",
              "due_date": today().isoformat(), "description": "Hero and footer"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Homepage mockup"
    assert body["assignee"]["id"] == member_user.id  # defaults to me
    assert body["creator_id"] == member_user.id
    assert (body["status"], body["priority"]) == ("todo", "high")
    assert body["key"] == f"WEB-{body['id']}"
    assert body["project"] == {"id": project.id, "key": "WEB", "name": "Website redesign",
                               "color": "#4F46E5"}
    assert body["can_change_status"] is True
    entry = db_session.scalars(select(ActivityLog).where(ActivityLog.action == "task.created")).one()
    assert entry.details["label"] == "Homepage mockup"
    assert entry.details["task_key"] == body["key"]


def test_create_task_for_another_member(client, project, member_user, amira) -> None:
    response = client.post(
        TASKS_URL, headers=bearer(member_user),
        json={"title": "Review copy", "project_id": project.id, "assignee_id": amira.id},
    )

    assert response.status_code == 201
    assert response.json()["assignee"]["id"] == amira.id
    # Sarah is neither the assignee nor the owner.
    assert response.json()["can_change_status"] is False


def test_create_task_assignee_must_be_member(client, project, member_user, outsider) -> None:
    response = client.post(
        TASKS_URL, headers=bearer(member_user),
        json={"title": "Review copy", "project_id": project.id, "assignee_id": outsider.id},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Assignee must be a project member"
    assert response.json()["errors"][0]["field"] == "assignee_id"


def test_create_task_outside_my_projects(client, project, outsider) -> None:
    response = client.post(
        TASKS_URL, headers=bearer(outsider), json={"title": "Sneaky", "project_id": project.id}
    )

    assert response.status_code == 404


def test_create_task_validation(client, project, member_user) -> None:
    response = client.post(
        TASKS_URL, headers=bearer(member_user),
        json={"title": "  ", "project_id": project.id, "description": "x" * 501},
    )

    assert response.status_code == 422
    errors = {error["field"]: error["message"] for error in response.json()["errors"]}
    assert errors == {"title": "Title is required.",
                      "description": "Description must be at most 500 characters."}


# --- status ------------------------------------------------------------------------


def status_url(task: Task) -> str:
    return f"{TASKS_URL}/{task.id}/status"


def test_assignee_changes_status(client, db_session, sarah_task, member_user) -> None:
    done = client.patch(status_url(sarah_task), headers=bearer(member_user), json={"status": "done"})

    assert done.status_code == 200
    assert done.json()["status"] == "done"
    assert done.json()["completed_at"] is not None

    reopened = client.patch(status_url(sarah_task), headers=bearer(member_user), json={"status": "todo"})
    assert reopened.json()["completed_at"] is None

    entries = db_session.scalars(
        select(ActivityLog).where(ActivityLog.action == "task.status_changed").order_by(ActivityLog.id)
    ).all()
    assert [(e.details["from"], e.details["to"]) for e in entries] == [("todo", "done"), ("done", "todo")]
    assert entries[0].actor_id == member_user.id


def test_owner_changes_status(client, sarah_task, karim) -> None:
    response = client.patch(status_url(sarah_task), headers=bearer(karim), json={"status": "in_progress"})

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"


def test_other_member_cannot_change_status(client, db_session, sarah_task, amira) -> None:
    response = client.patch(status_url(sarah_task), headers=bearer(amira), json={"status": "done"})

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Only the assignee or the project owner can change the status.",
        "code": "status_change_forbidden",
    }
    db_session.expire_all()
    assert db_session.get(Task, sarah_task.id).status == TaskStatus.TODO


def test_outsider_gets_404_on_status(client, sarah_task, outsider) -> None:
    response = client.patch(status_url(sarah_task), headers=bearer(outsider), json={"status": "done"})

    assert response.status_code == 404


# --- /me/tasks ---------------------------------------------------------------------


@pytest.fixture
def my_tasks(db_session: Session, project, member_user, amira, karim):
    on = today()
    archived = make_project(db_session, karim, key="OLD", name="Old", archived=True,
                            members=(member_user,))
    tasks = {
        "today": make_task(db_session, project, assignee=member_user, due_date=on),
        "week": make_task(db_session, project, assignee=member_user, status=TaskStatus.IN_PROGRESS,
                          due_date=on + timedelta(days=1)),
        "overdue": make_task(db_session, project, assignee=member_user, due_date=on - timedelta(days=2)),
        "done": make_task(db_session, project, assignee=member_user, status=TaskStatus.DONE,
                          due_date=on - timedelta(days=3)),
        "later": make_task(db_session, project, assignee=member_user, due_date=on + timedelta(days=20)),
        "not_mine": make_task(db_session, project, assignee=amira, due_date=on),
        "archived": make_task(db_session, archived, assignee=member_user, due_date=on),
    }
    # Created by Sarah for Amira: on Sarah's board too.
    created = Task(project_id=project.id, title="Created by me", assignee_id=amira.id,
                   creator_id=member_user.id, priority=TaskPriority.HIGH, due_date=on + timedelta(days=40))
    db_session.add(created)
    tasks["created"] = created
    tasks["today"].title = "Homepage mockup"
    tasks["today"].priority = TaskPriority.HIGH
    db_session.commit()
    return tasks


def ids(response) -> set[int]:
    assert response.status_code == 200
    return {task["id"] for task in response.json()}


def test_my_tasks_assigned_or_created(client, member_user, my_tasks) -> None:
    result = ids(client.get("/api/v1/me/tasks", headers=bearer(member_user)))

    expected = {my_tasks[key].id for key in ("today", "week", "overdue", "done", "later", "created")}
    assert result == expected


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"due": "today"}, {"today"}),
        ({"due": "overdue"}, {"overdue"}),
        ({"priority": "high"}, {"today", "created"}),
        ({"search": "homepage"}, {"today"}),
    ],
)
def test_my_tasks_filters(client, member_user, my_tasks, params, expected) -> None:
    result = ids(client.get("/api/v1/me/tasks", headers=bearer(member_user), params=params))

    assert result == {my_tasks[key].id for key in expected}


def test_my_tasks_week_filter(client, member_user, my_tasks) -> None:
    result = ids(client.get("/api/v1/me/tasks", headers=bearer(member_user), params={"due": "week"}))

    assert my_tasks["today"].id in result
    assert my_tasks["later"].id not in result
    assert my_tasks["overdue"].id not in result


def test_my_tasks_project_filter(client, member_user, my_tasks, project) -> None:
    result = ids(client.get("/api/v1/me/tasks", headers=bearer(member_user),
                            params={"project_id": project.id}))

    assert my_tasks["archived"].id not in result
    assert len(result) == 6


def test_my_counts(client, member_user, my_tasks) -> None:
    body = client.get("/api/v1/me/counts", headers=bearer(member_user)).json()

    # Open tasks assigned to or created by me, in active projects; one active project.
    assert body == {"open_tasks": 5, "projects": 1}


# --- /me/dashboard -------------------------------------------------------------------


def test_dashboard_focus_counts(client, db_session, member_user, my_tasks) -> None:
    my_tasks["done"].completed_at = datetime.now(UTC)  # completed today
    db_session.commit()

    body = client.get("/api/v1/me/dashboard", headers=bearer(member_user)).json()

    focus = body["focus"]
    titles = {key: {task["id"] for task in focus[key]} for key in ("today", "upcoming", "overdue")}
    # Today: due today, in progress, or completed today.
    assert titles["today"] == {my_tasks["today"].id, my_tasks["week"].id, my_tasks["done"].id}
    assert titles["upcoming"] == {my_tasks["week"].id}
    assert titles["overdue"] == {my_tasks["overdue"].id}
    assert focus["counts"] == {"today": 3, "upcoming": 1, "overdue": 1}

    assert body["hero"]["overdue"] == 1
    assert body["hero"]["weekly_target"] == 10
    assert body["hero"]["weekly_done"] == 1
    assert body["stats"]["assigned_open"] == 4
    assert body["stats"]["high_priority"] == 1
    assert body["stats"]["completed_this_month"] == 1
    assert len(body["week"]) == 7
    assert body["week"][today().weekday()]["has_due"] is True
    assert body["next_deadline"]["id"] == my_tasks["today"].id
    assert [project["key"] for project in body["my_projects"]] == ["WEB"]
    assert body["my_projects"][0]["my_role"] == "member"
