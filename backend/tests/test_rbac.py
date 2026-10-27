import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog
from app.models.user import User

PING_URL = "/api/v1/admin/ping"
ME_URL = "/api/v1/me"

ADMIN_ENDPOINTS = [
    ("GET", "/api/v1/admin/stats/counts"),
    ("GET", "/api/v1/admin/stats/overview"),
    ("GET", "/api/v1/admin/stats/export"),
    ("GET", "/api/v1/admin/users"),
    ("POST", "/api/v1/admin/users"),
    ("PATCH", "/api/v1/admin/users/1"),
    ("PATCH", "/api/v1/admin/users/1/role"),
    ("POST", "/api/v1/admin/users/1/approve"),
    ("POST", "/api/v1/admin/users/1/deactivate"),
    ("POST", "/api/v1/admin/users/1/activate"),
    ("POST", "/api/v1/admin/users/1/reset-password"),
    ("DELETE", "/api/v1/admin/users/1"),
    ("GET", "/api/v1/admin/projects"),
    ("GET", "/api/v1/admin/projects/export"),
    ("POST", "/api/v1/admin/projects"),
    ("POST", "/api/v1/admin/projects/1/archive"),
    ("POST", "/api/v1/admin/projects/1/unarchive"),
    ("DELETE", "/api/v1/admin/projects/1"),
    ("GET", "/api/v1/admin/activity"),
    ("GET", "/api/v1/admin/activity/export"),
]


@pytest.mark.parametrize(("method", "path"), ADMIN_ENDPOINTS)
def test_member_is_forbidden_on_every_admin_endpoint(
    client: TestClient, member_headers: dict[str, str], method: str, path: str
) -> None:
    # The role check runs before body validation, so no payload is needed.
    response = client.request(method, path, headers=member_headers)

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin role required", "code": "forbidden"}


@pytest.mark.parametrize(("method", "path"), ADMIN_ENDPOINTS)
def test_anonymous_is_rejected_on_every_admin_endpoint(
    client: TestClient, method: str, path: str
) -> None:
    assert client.request(method, path).status_code == 401


def test_admin_ping_without_token_returns_401(client: TestClient) -> None:
    response = client.get(PING_URL)

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"


def test_admin_ping_with_invalid_token_returns_401(client: TestClient) -> None:
    response = client.get(PING_URL, headers={"Authorization": "Bearer not-a-jwt"})

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


def test_admin_ping_as_member_returns_403(
    client: TestClient, member_headers: dict[str, str]
) -> None:
    response = client.get(PING_URL, headers=member_headers)

    assert response.status_code == 403
    assert response.json() == {"detail": "Admin role required", "code": "forbidden"}


def test_admin_ping_as_admin_returns_200(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = client.get(PING_URL, headers=admin_headers)

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_me_works_for_both_roles(
    client: TestClient,
    admin_headers: dict[str, str],
    member_headers: dict[str, str],
) -> None:
    admin = client.get(ME_URL, headers=admin_headers)
    member = client.get(ME_URL, headers=member_headers)

    assert admin.status_code == 200
    assert admin.json()["role"] == "admin"
    assert member.status_code == 200
    assert member.json()["role"] == "user"
    assert member.json()["full_name"] == "Sarah Mansour"


def test_denied_request_is_logged(
    client: TestClient,
    db_session: Session,
    member_user: User,
    member_headers: dict[str, str],
) -> None:
    client.get(PING_URL, headers=member_headers)

    entry = db_session.scalars(
        select(ActivityLog).where(ActivityLog.action == "auth.denied")
    ).one()
    assert entry.actor_id == member_user.id
    assert entry.details == {"method": "GET", "path": PING_URL}
