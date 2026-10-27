"""Member sidebar pages: Calendar (GET /me/tasks?due_from&due_to) and Activity (GET /me/activity)."""

from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.task import TaskStatus
from app.services.project_service import today
from tests.conftest import MEMBER_PASSWORD, make_project, make_task, make_user

ME = "/api/v1/me"


def bearer(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


@pytest.fixture
def karim(db_session: Session):
    return make_user(db_session, first_name="Karim", last_name="Bouzid",
                     email="karim.b@taskflow.io", password=MEMBER_PASSWORD)


@pytest.fixture
def projects(db_session: Session, member_user, karim, admin_user):
    """WEB (Sarah + Karim), OPS (Karim only), OLD (Sarah, archived)."""
    web = make_project(db_session, member_user, key="WEB", name="Website redesign", members=(karim,))
    ops = make_project(db_session, karim, key="OPS", name="Ops")
    old = make_project(db_session, member_user, key="OLD", name="Legacy", archived=True)
    return {"web": web, "ops": ops, "old": old}


# --- Calendar ------------------------------------------------------------------------


def test_my_tasks_due_range(client, db_session, projects, member_user) -> None:
    start = today()
    inside = make_task(db_session, projects["web"], assignee=member_user, due_date=start + timedelta(days=3))
    make_task(db_session, projects["web"], assignee=member_user, due_date=start + timedelta(days=40))
    make_task(db_session, projects["web"], assignee=member_user)  # no due date
    make_task(db_session, projects["old"], assignee=member_user, due_date=start + timedelta(days=3))

    response = client.get(f"{ME}/tasks", headers=bearer(member_user), params={
        "due_from": start.isoformat(), "due_to": (start + timedelta(days=30)).isoformat(),
    })

    assert response.status_code == 200
    assert [task["id"] for task in response.json()] == [inside.id]


def test_my_tasks_due_range_bounds_are_inclusive(client, db_session, projects, member_user) -> None:
    day = today()
    task = make_task(db_session, projects["web"], assignee=member_user, due_date=day)

    body = client.get(f"{ME}/tasks", headers=bearer(member_user),
                      params={"due_from": day.isoformat(), "due_to": day.isoformat()}).json()

    assert [row["id"] for row in body] == [task.id]


def test_my_tasks_rejects_inverted_range(client, member_user) -> None:
    response = client.get(f"{ME}/tasks", headers=bearer(member_user),
                          params={"due_from": "2026-11-30", "due_to": "2026-11-01"})

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_date_range"
    assert response.json()["errors"][0]["field"] == "due_from"


# --- Activity ------------------------------------------------------------------------


@pytest.fixture
def events(client, db_session, projects, member_user, karim):
    """Sarah creates a task in WEB, Karim changes it, Karim creates one in OPS."""
    created = client.post("/api/v1/tasks", headers=bearer(member_user),
                          json={"title": "Homepage", "project_id": projects["web"].id,
                                "assignee_id": karim.id})
    client.patch(f"/api/v1/tasks/{created.json()['id']}/status", headers=bearer(karim),
                 json={"status": "done"})
    client.post("/api/v1/tasks", headers=bearer(karim), json={"title": "Runbook", "project_id": projects["ops"].id})
    return created.json()


def test_activity_covers_only_my_projects(client, projects, events, member_user) -> None:
    response = client.get(f"{ME}/activity", headers=bearer(member_user))

    assert response.status_code == 200
    body = response.json()
    assert [item["action"] for item in body["items"]] == ["task.status_changed", "task.created"]
    assert body["total"] == 2
    assert {item["project"]["key"] for item in body["items"]} == {"WEB"}
    assert all("ip" not in item for item in body["items"])


def test_activity_only_mine(client, projects, events, member_user) -> None:
    body = client.get(f"{ME}/activity", headers=bearer(member_user), params={"mine": True}).json()

    assert [(item["action"], item["actor"]["full_name"]) for item in body["items"]] == [
        ("task.created", "Sarah Mansour"),
    ]


def test_activity_by_project(client, projects, events, karim) -> None:
    all_items = client.get(f"{ME}/activity", headers=bearer(karim)).json()
    ops = client.get(f"{ME}/activity", headers=bearer(karim),
                     params={"project_id": projects["ops"].id}).json()

    assert all_items["total"] == 3
    assert [item["entity_label"] for item in ops["items"]] == ["Runbook"]
    assert ops["items"][0]["project"] == {
        "id": projects["ops"].id, "key": "OPS", "name": "Ops", "color": "#4F46E5",
    }


@pytest.mark.parametrize("project_key", ["ops", "old"])
def test_activity_of_a_foreign_or_archived_project_is_not_found(
    client, projects, member_user, project_key
) -> None:
    response = client.get(f"{ME}/activity", headers=bearer(member_user),
                          params={"project_id": projects[project_key].id})

    assert response.status_code == 404
    assert response.json()["code"] == "project_not_found"


def test_activity_without_projects_is_empty(client, db_session) -> None:
    loner = make_user(db_session, first_name="Nadia", last_name="Saidi",
                      email="nadia.s@taskflow.io", password=MEMBER_PASSWORD)

    body = client.get(f"{ME}/activity", headers=bearer(loner)).json()

    assert body == {"items": [], "total": 0, "page": 1, "page_size": 20}


def test_activity_paginates(client, projects, member_user) -> None:
    for number in range(3):
        client.post("/api/v1/tasks", headers=bearer(member_user),
                    json={"title": f"Task {number}", "project_id": projects["web"].id})

    page2 = client.get(f"{ME}/activity", headers=bearer(member_user),
                       params={"page": 2, "page_size": 2}).json()

    assert (page2["total"], [item["entity_label"] for item in page2["items"]]) == (3, ["Task 0"])


def test_project_tab_activity_still_works(client, projects, events, member_user) -> None:
    body = client.get(f"/api/v1/projects/{projects['web'].id}/activity", headers=bearer(member_user)).json()

    assert body["total"] == 2
    assert "project" not in body["items"][0]


def test_status_change_event_records_done(client, projects, events, member_user) -> None:
    item = client.get(f"{ME}/activity", headers=bearer(member_user)).json()["items"][0]

    assert item["details"]["to"] == TaskStatus.DONE.value
