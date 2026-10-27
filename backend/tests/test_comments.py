"""Assigned tasks show up in the assignee's My Tasks; task comments."""

from datetime import date, timedelta

import pytest
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from tests.conftest import MEMBER_PASSWORD, make_project, make_task, make_user


def bearer(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


@pytest.fixture
def karim(db_session: Session):
    return make_user(db_session, first_name="Karim", last_name="Bouzid", email="karim.b@taskflow.io",
                     password=MEMBER_PASSWORD)


@pytest.fixture
def leila(db_session: Session):
    return make_user(db_session, first_name="Leila", last_name="Haddad", email="leila.h@taskflow.io",
                     password=MEMBER_PASSWORD)


@pytest.fixture
def project(db_session: Session, member_user):
    """Owned by Sarah (member_user)."""
    return make_project(db_session, member_user, key="HRD", name="HR dashboard")


# --- an owner adds a member and assigns them a task ------------------------------------


def test_assigned_task_appears_in_the_new_members_my_tasks(client, project, member_user, karim) -> None:
    owner = bearer(member_user)
    assert client.get("/api/v1/me/tasks", headers=bearer(karim)).json() == []

    added = client.post(f"/api/v1/projects/{project.id}/members", headers=owner, json={"user_id": karim.id})
    due = (date.today() + timedelta(days=5)).isoformat()
    created = client.post("/api/v1/tasks", headers=owner, json={
        "title": "Hiring funnel chart", "description": "Weekly funnel by stage.", "project_id": project.id,
        "assignee_id": karim.id, "priority": "high", "due_date": due, "status": "in_progress",
    })
    assert (added.status_code, created.status_code) == (201, 201)

    tasks = client.get("/api/v1/me/tasks", headers=bearer(karim)).json()

    assert len(tasks) == 1
    task = tasks[0]
    assert task["key"] == f"HRD-{created.json()['id']}"
    assert (task["title"], task["description"], task["priority"], task["status"], task["due_date"]) == (
        "Hiring funnel chart", "Weekly funnel by stage.", "high", "in_progress", due,
    )
    assert task["project"]["name"] == "HR dashboard"
    assert task["assignee"]["full_name"] == "Karim Bouzid"
    assert task["can_change_status"] is True  # the assignee may move it
    assert client.get("/api/v1/me/counts", headers=bearer(karim)).json()["open_tasks"] == 1
    # And they are told about it.
    notifications = client.get("/api/v1/notifications", headers=bearer(karim)).json()["items"]
    assert [n["kind"] for n in notifications] == ["task.assigned", "project.member_added"]


# --- comments --------------------------------------------------------------------------


@pytest.fixture
def task(db_session: Session, project, member_user, karim):
    from app.models.project_member import ProjectMember

    db_session.add(ProjectMember(project_id=project.id, user_id=karim.id))
    db_session.commit()
    return make_task(db_session, project, assignee=karim)  # created by the owner, Sarah


def url(task) -> str:
    return f"/api/v1/tasks/{task.id}/comments"


def test_members_comment_and_read_in_order(client, task, member_user, karim) -> None:
    first = client.post(url(task), headers=bearer(karim), json={"content": "  Draft is ready.  "})
    second = client.post(url(task), headers=bearer(member_user), json={"content": "Looks good!"})

    assert (first.status_code, second.status_code) == (201, 201)
    assert first.json()["content"] == "Draft is ready."
    rows = client.get(url(task), headers=bearer(karim)).json()
    assert [(row["author"]["full_name"], row["content"]) for row in rows] == [
        ("Karim Bouzid", "Draft is ready."), ("Sarah Mansour", "Looks good!"),
    ]
    # Karim deletes only his own; the owner moderates every comment.
    assert [row["can_delete"] for row in rows] == [True, False]
    assert all(row["can_delete"] for row in client.get(url(task), headers=bearer(member_user)).json())

    tasks = client.get("/api/v1/me/tasks", headers=bearer(karim)).json()
    assert tasks[0]["comments_count"] == 2


def test_comment_notifies_the_people_concerned(client, task, member_user, karim) -> None:
    client.post(url(task), headers=bearer(karim), json={"content": "Question about the scope."})

    owner_inbox = client.get("/api/v1/notifications", headers=bearer(member_user)).json()["items"]
    assert owner_inbox[0]["message"] == "commented on Task in HR dashboard"
    assert client.get("/api/v1/notifications", headers=bearer(karim)).json()["total"] == 0  # not the author
    activity = client.get(f"/api/v1/projects/{task.project_id}/activity", headers=bearer(member_user)).json()
    assert activity["items"][0]["action"] == "task.commented"


def test_comment_validation(client, task, karim) -> None:
    empty = client.post(url(task), headers=bearer(karim), json={"content": "   "})
    long = client.post(url(task), headers=bearer(karim), json={"content": "x" * 1001})

    assert empty.status_code == long.status_code == 422
    assert empty.json()["errors"][0]["message"] == "Write a comment first."


def test_outsiders_cannot_read_or_comment(client, task, leila) -> None:
    assert client.get(url(task), headers=bearer(leila)).status_code == 404
    assert client.post(url(task), headers=bearer(leila), json={"content": "Hi"}).status_code == 404


def test_delete_rules(client, task, member_user, karim) -> None:
    owners = client.post(url(task), headers=bearer(member_user), json={"content": "Owner note"}).json()
    karims = client.post(url(task), headers=bearer(karim), json={"content": "Karim note"}).json()

    forbidden = client.delete(f"{url(task)}/{owners['id']}", headers=bearer(karim))
    own = client.delete(f"{url(task)}/{karims['id']}", headers=bearer(karim))
    moderated = client.delete(f"{url(task)}/{owners['id']}", headers=bearer(member_user))

    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "comment_delete_forbidden"
    assert (own.status_code, moderated.status_code) == (204, 204)
    assert client.get(url(task), headers=bearer(karim)).json() == []
    assert client.delete(f"{url(task)}/{owners['id']}", headers=bearer(member_user)).status_code == 404
