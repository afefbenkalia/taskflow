import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.activity_log import ActivityLog
from app.models.refresh_token import RefreshToken
from app.models.task import Task
from app.models.user import User, UserRole
from app.services import user_service
from tests.conftest import MEMBER_PASSWORD, make_project, make_task

USERS_URL = "/api/v1/admin/users"


def last_log(db: Session, action: str) -> ActivityLog:
    return db.scalars(
        select(ActivityLog).where(ActivityLog.action == action).order_by(ActivityLog.id.desc())
    ).first()


def login(client: TestClient, email: str, password: str):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


@pytest.fixture
def everyone(admin_user, member_user, pending_user, deactivated_user) -> None:
    """Four accounts: 1 admin, 1 active member, 1 pending, 1 deactivated."""


# --- list / filters ------------------------------------------------------------


def test_list_users_with_counts(client: TestClient, admin_headers, everyone) -> None:
    response = client.get(USERS_URL, headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 4
    assert body["page"] == 1 and body["page_size"] == 10
    assert body["counts"] == {"all": 4, "admins": 1, "members": 3, "pending": 1, "deactivated": 1}
    assert body["items"][0]["status"] == "pending"  # awaiting approval first
    me = next(item for item in body["items"] if item["email"] == "afef@taskflow.io")
    assert me["is_self"] is True
    assert {"projects_count", "last_active_at"} <= me.keys()
    assert "password" not in response.text.lower()


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"role": "admin"}, {"afef@taskflow.io"}),
        ({"status": "pending"}, {"nour.k@company.com"}),
        ({"status": "deactivated"}, {"youssef.t@taskflow.io"}),
        ({"role": "user", "status": "active"}, {"sarah.m@taskflow.io"}),
        ({"search": "MANSOUR"}, {"sarah.m@taskflow.io"}),
        ({"search": "company.com"}, {"nour.k@company.com"}),
    ],
)
def test_list_users_filters(client, admin_headers, everyone, params, expected) -> None:
    response = client.get(USERS_URL, headers=admin_headers, params=params)

    assert {item["email"] for item in response.json()["items"]} == expected


def test_counts_follow_search_but_not_segment(client, admin_headers, everyone) -> None:
    body = client.get(USERS_URL, headers=admin_headers, params={"search": "a", "role": "admin"}).json()

    # "a" matches every seeded name; counts ignore the role/status segment.
    assert body["counts"]["all"] == 4
    assert body["total"] == 1


def test_list_users_pagination(client, admin_headers, everyone) -> None:
    body = client.get(USERS_URL, headers=admin_headers, params={"page": 2, "page_size": 3}).json()

    assert body["total"] == 4
    assert len(body["items"]) == 1


def test_projects_count(client, admin_headers, db_session, admin_user, member_user) -> None:
    make_project(db_session, admin_user, members=(member_user,))
    make_project(db_session, admin_user, key="MOB", name="Mobile app")

    items = client.get(USERS_URL, headers=admin_headers).json()["items"]
    counts = {item["email"]: item["projects_count"] for item in items}

    assert counts == {"afef@taskflow.io": 2, "sarah.m@taskflow.io": 1}


# --- create / update -------------------------------------------------------------


def test_create_user_returns_temporary_password(client, admin_headers, db_session) -> None:
    response = client.post(
        USERS_URL,
        headers=admin_headers,
        json={"first_name": "Leila", "last_name": "Hamdi", "email": "Leila.H@taskflow.io"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["status"] == "active"
    assert body["user"]["role"] == "user"
    password = body["temporary_password"]
    assert len(password) >= 8
    assert login(client, "leila.h@taskflow.io", password).status_code == 200
    assert last_log(db_session, "user.created").details["label"] == "Leila Hamdi"


def test_create_user_duplicate_email(client, admin_headers, member_user) -> None:
    response = client.post(
        USERS_URL,
        headers=admin_headers,
        json={"first_name": "S", "last_name": "M", "email": "sarah.m@taskflow.io"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


def test_update_user_details(client, admin_headers, db_session, member_user) -> None:
    response = client.patch(
        f"{USERS_URL}/{member_user.id}",
        headers=admin_headers,
        json={"first_name": "Sara", "last_name": "Mansour", "email": "sarah.m@taskflow.io",
              "job_title": "Product Designer"},
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "Sara Mansour"
    assert response.json()["job_title"] == "Product Designer"
    assert last_log(db_session, "user.updated").details["fields"] == ["first_name", "job_title"]


# --- role ------------------------------------------------------------------------


def test_change_role_is_logged(client, admin_headers, db_session, admin_user, member_user) -> None:
    response = client.patch(
        f"{USERS_URL}/{member_user.id}/role", headers=admin_headers, json={"role": "admin"}
    )

    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    entry = last_log(db_session, "user.role_changed")
    assert entry.actor_id == admin_user.id
    assert entry.entity_id == member_user.id
    assert entry.details == {"label": "Sarah Mansour", "from": "user", "to": "admin"}


def test_cannot_change_own_role(client, admin_headers, admin_user) -> None:
    response = client.patch(
        f"{USERS_URL}/{admin_user.id}/role", headers=admin_headers, json={"role": "user"}
    )

    assert response.status_code == 400
    assert response.json()["code"] == "self_action_forbidden"


def test_can_demote_another_admin(client, admin_headers, second_admin) -> None:
    response = client.patch(
        f"{USERS_URL}/{second_admin.id}/role", headers=admin_headers, json={"role": "user"}
    )

    assert response.status_code == 200


def test_last_admin_is_protected(db_session, admin_user, member_user) -> None:
    # Through the API the acting admin always remains, so exercise the rule directly.
    with pytest.raises(AppError) as demote:
        user_service.change_role(db_session, member_user, admin_user.id, UserRole.USER, None)
    with pytest.raises(AppError) as deactivate:
        user_service.deactivate_user(db_session, member_user, admin_user.id, None)

    assert demote.value.code == deactivate.value.code == "last_admin"
    assert demote.value.status_code == 400


# --- status ------------------------------------------------------------------------


def test_approve_pending_user(client, admin_headers, db_session, pending_user) -> None:
    response = client.post(f"{USERS_URL}/{pending_user.id}/approve", headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert last_log(db_session, "user.approved") is not None
    again = client.post(f"{USERS_URL}/{pending_user.id}/approve", headers=admin_headers)
    assert again.status_code == 400


def test_deactivate_revokes_sessions(client, admin_headers, db_session, member_user) -> None:
    member_login = login(client, "sarah.m@taskflow.io", MEMBER_PASSWORD)
    member_token = member_login.json()["access_token"]
    refresh_cookie = member_login.cookies["refresh_token"]
    client.cookies.clear()

    response = client.post(f"{USERS_URL}/{member_user.id}/deactivate", headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "deactivated"
    tokens = db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == member_user.id))
    assert all(token.revoked for token in tokens)
    # The access token stops working immediately and the session cannot be refreshed.
    me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {member_token}"})
    assert me.status_code == 403
    refreshed = client.post(
        "/api/v1/auth/refresh", headers={"Cookie": f"refresh_token={refresh_cookie}"}
    )
    assert refreshed.status_code == 401
    assert last_log(db_session, "user.deactivated") is not None


def test_cannot_deactivate_self(client, admin_headers, admin_user) -> None:
    response = client.post(f"{USERS_URL}/{admin_user.id}/deactivate", headers=admin_headers)

    assert response.status_code == 400
    assert response.json()["code"] == "self_action_forbidden"


def test_activate_user(client, admin_headers, db_session, deactivated_user) -> None:
    response = client.post(f"{USERS_URL}/{deactivated_user.id}/activate", headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "active"
    assert last_log(db_session, "user.activated") is not None


def test_reset_password(client, admin_headers, db_session, member_user) -> None:
    login(client, "sarah.m@taskflow.io", MEMBER_PASSWORD)
    client.cookies.clear()

    response = client.post(f"{USERS_URL}/{member_user.id}/reset-password", headers=admin_headers)

    assert response.status_code == 200
    password = response.json()["temporary_password"]
    assert login(client, "sarah.m@taskflow.io", MEMBER_PASSWORD).status_code == 401
    tokens = db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == member_user.id))
    assert all(token.revoked for token in tokens)
    assert login(client, "sarah.m@taskflow.io", password).status_code == 200
    assert last_log(db_session, "user.password_reset") is not None


# --- delete --------------------------------------------------------------------------


def test_delete_user_owning_projects_is_refused(
    client, admin_headers, db_session, member_user
) -> None:
    make_project(db_session, member_user)

    response = client.delete(f"{USERS_URL}/{member_user.id}", headers=admin_headers)

    assert response.status_code == 409
    assert response.json()["code"] == "user_owns_projects"


def test_delete_user_unassigns_tasks(
    client, admin_headers, db_session, admin_user, member_user
) -> None:
    project = make_project(db_session, admin_user, members=(member_user,))
    task = make_task(db_session, project, assignee=member_user)
    member_id = member_user.id

    response = client.delete(f"{USERS_URL}/{member_id}", headers=admin_headers)

    assert response.status_code == 204
    db_session.expire_all()
    assert db_session.get(User, member_id) is None
    assert db_session.get(Task, task.id).assignee_id is None
    assert last_log(db_session, "user.deleted").details["label"] == "Sarah Mansour"


def test_cannot_delete_self(client, admin_headers, admin_user) -> None:
    response = client.delete(f"{USERS_URL}/{admin_user.id}", headers=admin_headers)

    assert response.status_code == 400
    assert response.json()["code"] == "self_action_forbidden"


def test_unknown_user_returns_404(client, admin_headers) -> None:
    response = client.post(f"{USERS_URL}/999999/approve", headers=admin_headers)

    assert response.status_code == 404
    assert response.json()["code"] == "user_not_found"
