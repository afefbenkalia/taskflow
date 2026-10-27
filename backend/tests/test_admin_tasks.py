"""Admin console › Tasks: a read-only view of every task in the workspace."""

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.task import Task, TaskPriority, TaskStatus
from app.services.project_service import today
from tests.conftest import make_project, make_task

URL = "/api/v1/admin/tasks"


def keys(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["key"] for item in response.json()["items"]]


@pytest.fixture
def board(db_session: Session, admin_user, member_user):
    """WEB (active): 4 tasks; LCR (archived): 1 task."""
    on = today()
    web = make_project(db_session, admin_user, key="WEB", name="Website redesign", members=(member_user,))
    tasks = {
        "late": make_task(db_session, web, status=TaskStatus.TODO, assignee=member_user,
                          due_date=on - timedelta(days=2)),
        "doing": make_task(db_session, web, status=TaskStatus.IN_PROGRESS, assignee=member_user,
                           due_date=on + timedelta(days=3)),
        "done": make_task(db_session, web, status=TaskStatus.DONE, assignee=admin_user,
                          due_date=on - timedelta(days=5)),
        "free": make_task(db_session, web, status=TaskStatus.TODO),
    }
    tasks["late"].title, tasks["doing"].title = "Fix checkout bug", "Homepage mockup"
    tasks["doing"].priority = TaskPriority.HIGH
    tasks["free"].priority = TaskPriority.LOW
    lcr = make_project(db_session, admin_user, key="LCR", name="Legacy CRM", archived=True)
    tasks["old"] = make_task(db_session, lcr, status=TaskStatus.DONE)
    db_session.commit()
    return {name: f"{('LCR' if name == 'old' else 'WEB')}-{task.id}" for name, task in tasks.items()}


def test_lists_active_tasks_due_first(client, admin_headers, board) -> None:
    response = client.get(URL, headers=admin_headers)

    # Earliest due date first; tasks without a date last. Archived projects are excluded.
    assert keys(response) == [board["done"], board["late"], board["doing"], board["free"]]
    body = response.json()
    assert body["total"] == 4
    late = next(item for item in body["items"] if item["key"] == board["late"])
    assert late["overdue"] is True
    assert late["assignee"]["full_name"] == "Sarah Mansour"
    assert late["creator"]["full_name"] == "Afef Ben Kalia"
    assert late["project"] == {"id": late["project"]["id"], "key": "WEB", "name": "Website redesign",
                               "color": "#4F46E5", "archived": False}
    done = next(item for item in body["items"] if item["key"] == board["done"])
    assert done["overdue"] is False  # a finished task is never late


def test_summary_counts_the_scope(client, admin_headers, board) -> None:
    summary = client.get(URL, headers=admin_headers, params={"status": "done"}).json()["summary"]

    # Filters do not change the summary cards; the scope does.
    assert summary == {"total": 4, "todo": 2, "in_progress": 1, "done": 1, "overdue": 1, "unassigned": 1}
    archived = client.get(URL, headers=admin_headers, params={"scope": "archived"}).json()
    assert archived["summary"]["total"] == 1
    assert [item["project"]["archived"] for item in archived["items"]] == [True]


def test_sidebar_count_matches_the_default_scope(client, admin_headers, board) -> None:
    counts = client.get("/api/v1/admin/stats/counts", headers=admin_headers).json()

    assert counts["tasks"] == client.get(URL, headers=admin_headers).json()["summary"]["total"]


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"status": "todo"}, ["late", "free"]),
        ({"status": "in_progress"}, ["doing"]),
        ({"status": "overdue"}, ["late"]),
        ({"priority": "high"}, ["doing"]),
        ({"unassigned": True}, ["free"]),
        ({"search": "checkout"}, ["late"]),
        ({"due": "overdue"}, ["late"]),
        ({"scope": "all", "status": "done"}, ["done", "old"]),
    ],
)
def test_filters(client, admin_headers, board, params, expected) -> None:
    assert keys(client.get(URL, headers=admin_headers, params=params)) == [board[name] for name in expected]


def test_filter_by_assignee_and_project(client, admin_headers, board, member_user) -> None:
    mine = keys(client.get(URL, headers=admin_headers, params={"assignee_id": member_user.id}))
    by_project = client.get(URL, headers=admin_headers,
                            params={"project_id": client.get(URL, headers=admin_headers).json()["items"][0]["project"]["id"]})

    assert mine == [board["late"], board["doing"]]
    assert by_project.json()["total"] == 4


def test_search_by_task_key(client, admin_headers, board) -> None:
    assert keys(client.get(URL, headers=admin_headers, params={"search": board["doing"].lower()})) == [board["doing"]]


def test_sorting(client, admin_headers, board) -> None:
    by_priority = keys(client.get(URL, headers=admin_headers, params={"sort": "priority"}))
    recent = keys(client.get(URL, headers=admin_headers, params={"sort": "recent"}))

    assert by_priority[0] == board["doing"] and by_priority[-1] == board["free"]
    assert recent[0] == board["free"]  # created last


def test_pagination(client, admin_headers, board) -> None:
    second = client.get(URL, headers=admin_headers, params={"page": 2, "page_size": 3}).json()

    assert (second["total"], [item["key"] for item in second["items"]]) == (4, [board["free"]])


def test_members_cannot_see_all_tasks(client, member_headers, board) -> None:
    response = client.get(URL, headers=member_headers)

    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
@pytest.mark.parametrize("path", ["", "/1", "/1/status"])
def test_admin_tasks_are_read_only(client, admin_headers, db_session, board, method, path) -> None:
    before = db_session.scalar(select(func.count(Task.id)))

    response = client.request(method, f"{URL}{path}", headers=admin_headers, json={"title": "x", "status": "done"})

    assert response.status_code in (404, 405)
    assert db_session.scalar(select(func.count(Task.id))) == before
