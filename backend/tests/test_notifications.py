"""Notifications for members and admins (bell, Notifications page)."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.notification import Notification
from app.models.task import TaskStatus
from tests.conftest import MEMBER_PASSWORD, make_project, make_task, make_user

URL = "/api/v1/notifications"


def bearer(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


def inbox(client, user, **params) -> dict:
    response = client.get(URL, headers=bearer(user), params=params)
    assert response.status_code == 200
    return response.json()


@pytest.fixture
def karim(db_session: Session):
    return make_user(db_session, first_name="Karim", last_name="Bouzid",
                     email="karim.b@taskflow.io", password=MEMBER_PASSWORD)


@pytest.fixture
def project(db_session: Session, member_user, karim):
    """Owned by Sarah (member_user); Karim is a member."""
    return make_project(db_session, member_user, key="WEB", name="Website redesign", members=(karim,))


# --- triggers ---------------------------------------------------------------------------


def test_assigning_a_task_notifies_the_assignee(client, project, member_user, karim) -> None:
    client.post("/api/v1/tasks", headers=bearer(member_user),
                json={"title": "Homepage mockup", "project_id": project.id, "assignee_id": karim.id})

    body = inbox(client, karim)

    assert body["unread_count"] == 1
    item = body["items"][0]
    assert (item["kind"], item["actor"]["full_name"], item["read"]) == ("task.assigned", "Sarah Mansour", False)
    assert item["message"] == "assigned you Homepage mockup in Website redesign"
    assert item["link"] == f"/app/projects/{project.id}?tab=tasks"
    assert item["project"] == {"id": project.id, "name": "Website redesign", "color": "#4F46E5"}


def test_own_actions_do_not_notify(client, project, member_user) -> None:
    client.post("/api/v1/tasks", headers=bearer(member_user),
                json={"title": "Note to self", "project_id": project.id})

    assert inbox(client, member_user)["total"] == 0


def test_status_change_notifies_assignee_and_creator(client, db_session, project, member_user, karim) -> None:
    task = make_task(db_session, project, assignee=karim)  # created by Sarah, the owner

    client.patch(f"/api/v1/tasks/{task.id}/status", headers=bearer(karim), json={"status": "done"})

    sarah_items = inbox(client, member_user)["items"]
    assert [item["message"] for item in sarah_items] == ["moved Task to Done in Website redesign"]
    assert inbox(client, karim)["total"] == 0  # Karim made the change


def test_membership_changes_notify_the_member(client, db_session, project, member_user, karim) -> None:
    leila = make_user(db_session, first_name="Leila", last_name="Haddad",
                      email="leila.h@taskflow.io", password=MEMBER_PASSWORD)

    client.post(f"/api/v1/projects/{project.id}/members", headers=bearer(member_user), json={"user_id": leila.id})
    client.delete(f"/api/v1/projects/{project.id}/members/{leila.id}", headers=bearer(member_user))

    removed, added = inbox(client, leila)["items"]
    assert (added["message"], added["link"]) == ("added you to Website redesign", f"/app/projects/{project.id}")
    # She no longer has access: no link.
    assert (removed["message"], removed["link"]) == ("removed you from Website redesign", None)


def test_registration_notifies_active_admins(client, admin_user, second_admin, member_user) -> None:
    response = client.post("/api/v1/auth/register", json={
        "first_name": "Nour", "last_name": "Kefi", "email": "nour.k@company.com", "password": "Secret123",
    })
    assert response.status_code == 201, response.text

    for admin in (admin_user, second_admin):
        item = inbox(client, admin)["items"][0]
        assert (item["actor"]["full_name"], item["message"], item["link"]) == (
            "Nour Kefi", "signed up and is waiting for approval", "/admin/users?status=pending",
        )
    assert inbox(client, member_user)["total"] == 0


def test_rejecting_a_signup_keeps_the_admin_notification(client, admin_user, admin_headers, db_session) -> None:
    """Admin › Users › "Reject and delete" on a pending account that notified the admins."""
    client.post("/api/v1/auth/register", json={
        "first_name": "Nour", "last_name": "Kefi", "email": "nour.k@company.com", "password": "Secret123",
    })
    pending_id = inbox(client, admin_user)["items"][0]["actor"]["id"]

    response = client.delete(f"/api/v1/admin/users/{pending_id}", headers=admin_headers)

    assert response.status_code == 204
    item = inbox(client, admin_user)["items"][0]
    assert (item["actor"], item["message"]) == (None, "signed up and is waiting for approval")


def test_admin_actions_notify_the_user(client, admin_headers, pending_user, member_user) -> None:
    client.post(f"/api/v1/admin/users/{pending_user.id}/approve", headers=admin_headers)
    client.patch(f"/api/v1/admin/users/{member_user.id}/role", headers=admin_headers, json={"role": "admin"})

    approved = inbox(client, pending_user)["items"][0]
    promoted = inbox(client, member_user)["items"][0]
    assert (approved["message"], approved["link"]) == ("approved your account", "/app")
    # Links follow the recipient's current role.
    assert (promoted["message"], promoted["link"]) == ("changed your role to Admin", "/admin")


def test_project_creation_and_archive_notify_members(
    client, admin_headers, admin_user, project, member_user, karim
) -> None:
    created = client.post("/api/v1/admin/projects", headers=admin_headers,
                          json={"name": "Data warehouse", "key": "DWH", "owner_id": member_user.id})
    client.post(f"/api/v1/admin/projects/{project.id}/archive", headers=admin_headers)

    sarah = [item["message"] for item in inbox(client, member_user)["items"]]
    assert sarah == ["archived Website redesign", "made you the owner of Data warehouse"]
    assert [item["message"] for item in inbox(client, karim)["items"]] == ["archived Website redesign"]
    assert created.status_code == 201
    assert inbox(client, admin_user)["total"] == 0


# --- reading -----------------------------------------------------------------------------


@pytest.fixture
def three_notifications(client, project, member_user, karim):
    for title in ("One", "Two", "Three"):
        client.post("/api/v1/tasks", headers=bearer(member_user),
                    json={"title": title, "project_id": project.id, "assignee_id": karim.id})


def test_unread_count_and_mark_read(client, three_notifications, karim) -> None:
    headers = bearer(karim)
    assert client.get(f"{URL}/unread-count", headers=headers).json() == {"count": 3}

    newest = inbox(client, karim)["items"][0]
    marked = client.post(f"{URL}/{newest['id']}/read", headers=headers)

    assert marked.status_code == 200
    assert marked.json()["read"] is True
    assert client.get(f"{URL}/unread-count", headers=headers).json() == {"count": 2}
    unread = inbox(client, karim, unread=True)
    assert (unread["total"], unread["unread_count"]) == (2, 2)
    assert newest["id"] not in [item["id"] for item in unread["items"]]


def test_mark_all_read(client, three_notifications, karim) -> None:
    response = client.post(f"{URL}/read-all", headers=bearer(karim))

    assert response.json() == {"updated": 3}
    assert inbox(client, karim)["unread_count"] == 0
    assert client.post(f"{URL}/read-all", headers=bearer(karim)).json() == {"updated": 0}


def test_cannot_read_someone_elses_notification(client, db_session, three_notifications, karim, member_user) -> None:
    notification_id = db_session.scalars(select(Notification.id).where(Notification.user_id == karim.id)).first()

    response = client.post(f"{URL}/{notification_id}/read", headers=bearer(member_user))

    assert response.status_code == 404
    assert response.json()["code"] == "notification_not_found"
    assert client.get(f"{URL}/unread-count", headers=bearer(karim)).json() == {"count": 3}


def test_pagination_newest_first(client, three_notifications, karim) -> None:
    page = inbox(client, karim, page=2, page_size=2)

    assert (page["total"], len(page["items"])) == (3, 1)
    assert page["items"][0]["message"].startswith("assigned you One")


def test_notifications_require_authentication(client) -> None:
    assert client.get(URL).status_code == 401


def test_deleting_a_project_removes_its_notifications(
    client, db_session, admin_headers, three_notifications, project, karim
) -> None:
    client.delete(f"/api/v1/admin/projects/{project.id}", headers=admin_headers)

    assert inbox(client, karim)["total"] == 0


def test_refused_status_change_notifies_nobody(client, db_session, project, member_user, karim) -> None:
    task = make_task(db_session, project, assignee=member_user, status=TaskStatus.TODO)
    # Karim is neither assignee nor owner: the change is refused and nobody is notified.
    client.patch(f"/api/v1/tasks/{task.id}/status", headers=bearer(karim), json={"status": "done"})

    assert inbox(client, member_user)["total"] == 0
