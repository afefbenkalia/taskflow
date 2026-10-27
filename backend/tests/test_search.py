"""Top bar search: role-aware results."""

import pytest
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.task import Task
from tests.conftest import MEMBER_PASSWORD, make_project, make_user

URL = "/api/v1/search"


def bearer(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


def search(client, user, q: str) -> dict[str, list[dict]]:
    response = client.get(URL, headers=bearer(user), params={"q": q})
    assert response.status_code == 200, response.text
    return {group["kind"]: group["items"] for group in response.json()["groups"]}


@pytest.fixture
def world(db_session: Session, admin_user, member_user):
    """Sarah (member_user) belongs to WEB only; Karim owns OPS, which Sarah can't see."""
    karim = make_user(db_session, first_name="Karim", last_name="Bouzid", email="karim.b@taskflow.io",
                      password=MEMBER_PASSWORD)
    leila = make_user(db_session, first_name="Leila", last_name="Haddad", email="leila.h@taskflow.io",
                      password=MEMBER_PASSWORD)
    web = make_project(db_session, admin_user, key="WEB", name="Website redesign", members=(member_user, leila))
    ops = make_project(db_session, karim, key="OPS", name="Website operations")
    tasks = {
        "home": Task(project_id=web.id, title="Homepage mockup", assignee_id=member_user.id),
        "secret": Task(project_id=ops.id, title="Homepage secrets"),
    }
    db_session.add_all(tasks.values())
    db_session.commit()
    return {"web": web, "ops": ops, "karim": karim, "leila": leila, **tasks}


def test_member_finds_only_their_projects_and_tasks(client, member_user, world) -> None:
    results = search(client, member_user, "website")

    assert [item["title"] for item in results["projects"]] == ["Website redesign"]
    assert results["projects"][0]["link"] == f"/app/projects/{world['web'].id}"

    tasks = search(client, member_user, "homepage")["tasks"]
    assert [item["title"] for item in tasks] == ["Homepage mockup"]  # not the OPS task
    assert tasks[0]["link"] == f"/app/projects/{world['web'].id}?tab=tasks"
    assert tasks[0]["subtitle"].startswith(f"WEB-{world['home'].id} · Website redesign")


def test_member_finds_people_they_work_with(client, member_user, world) -> None:
    people = search(client, member_user, "leila")["people"]

    assert [(p["title"], p["link"]) for p in people] == [
        ("Leila Haddad", f"/app/projects/{world['web'].id}?tab=members"),
    ]
    assert "people" not in search(client, member_user, "karim")  # no shared project


def test_admin_searches_everything(client, admin_user, world) -> None:
    results = search(client, admin_user, "website")
    tasks = search(client, admin_user, "homepage")["tasks"]
    people = search(client, admin_user, "karim")["people"]

    assert {item["title"] for item in results["projects"]} == {"Website redesign", "Website operations"}
    assert results["projects"][0]["link"].startswith("/admin/projects?scope=all&search=")
    assert {item["title"] for item in tasks} == {"Homepage mockup", "Homepage secrets"}
    assert people[0]["link"] == "/admin/users?search=karim.b%40taskflow.io"


def test_search_by_task_key(client, member_user, world) -> None:
    tasks = search(client, member_user, f"web-{world['home'].id}")["tasks"]

    assert [item["title"] for item in tasks] == ["Homepage mockup"]


def test_short_or_empty_queries_return_nothing(client, member_user, world) -> None:
    assert search(client, member_user, "w") == {}
    assert search(client, member_user, "   ") == {}


def test_wildcards_are_literal(client, member_user, world) -> None:
    assert search(client, member_user, "%%") == {}


def test_search_requires_authentication(client) -> None:
    assert client.get(URL, params={"q": "web"}).status_code == 401
