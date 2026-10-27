import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog
from app.models.refresh_token import RefreshToken
from app.models.user import User
from tests.conftest import ADMIN_PASSWORD, MEMBER_PASSWORD

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"


def register_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "first_name": "Lina",
        "last_name": "Haddad",
        "email": "Lina.Haddad@Example.com",
        "password": "Secret123",
    }
    payload.update(overrides)
    return payload


def error_fields(response) -> set[str]:
    return {error["field"] for error in response.json()["errors"]}


def login(client: TestClient, email: str, password: str, remember_me: bool = False):
    return client.post(
        LOGIN_URL, json={"email": email, "password": password, "remember_me": remember_me}
    )


def replay_refresh(client: TestClient, refresh_token: str):
    """Call /auth/refresh with an explicit token instead of the cookie jar."""
    client.cookies.clear()
    return client.post(REFRESH_URL, headers={"Cookie": f"refresh_token={refresh_token}"})


# --- register -----------------------------------------------------------------


def test_register_creates_pending_member(client: TestClient, db_session: Session) -> None:
    response = client.post(REGISTER_URL, json=register_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["message"]
    assert body["user"]["email"] == "lina.haddad@example.com"
    assert body["user"]["full_name"] == "Lina Haddad"
    assert body["user"]["role"] == "user"
    assert body["user"]["status"] == "pending"

    actions = db_session.scalars(select(ActivityLog.action)).all()
    assert "auth.register" in actions


def test_register_duplicate_email_returns_409(client: TestClient, member_user: User) -> None:
    response = client.post(REGISTER_URL, json=register_payload(email="SARAH.M@taskflow.io"))

    assert response.status_code == 409
    assert response.json() == {
        "detail": "An account with this email already exists.",
        "code": "email_taken",
    }


def test_register_weak_password_returns_422(client: TestClient) -> None:
    for weak in ("Short1", "alllowercase1", "NoDigitsHere"):
        response = client.post(REGISTER_URL, json=register_payload(password=weak))
        assert response.status_code == 422, weak
        assert response.json()["code"] == "validation_error"
        assert error_fields(response) == {"password"}


def test_register_ignores_the_former_terms_field(client: TestClient) -> None:
    """The Terms checkbox was removed; older clients that still send the field keep working."""
    response = client.post(REGISTER_URL, json=register_payload(accept_terms=False))

    assert response.status_code == 201


# --- login --------------------------------------------------------------------


def test_login_admin_returns_token_and_cookie(client: TestClient, admin_user: User) -> None:
    response = login(client, "afef@taskflow.io", ADMIN_PASSWORD)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["expires_in"] > 0
    assert body["user"]["role"] == "admin"
    assert "refresh_token" not in body

    assert response.cookies.get("refresh_token")
    set_cookie = response.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "path=/api/v1/auth" in set_cookie


def test_login_wrong_password_returns_401(client: TestClient, admin_user: User) -> None:
    response = login(client, "afef@taskflow.io", "Wrong@1234")

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password."
    assert "refresh_token" not in response.cookies


def test_login_unknown_email_uses_same_message(client: TestClient) -> None:
    response = login(client, "nobody@taskflow.io", "Whatever1")

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password."


def test_login_pending_account_returns_403(client: TestClient, pending_user: User) -> None:
    response = login(client, "nour.k@company.com", MEMBER_PASSWORD)

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Your account is awaiting administrator approval.",
        "code": "account_pending",
    }


def test_login_deactivated_account_returns_403(client: TestClient, deactivated_user: User) -> None:
    response = login(client, "youssef.t@taskflow.io", MEMBER_PASSWORD)

    assert response.status_code == 403
    assert response.json()["code"] == "account_deactivated"


def test_login_updates_last_active_and_logs(
    client: TestClient, db_session: Session, member_user: User
) -> None:
    assert member_user.last_active_at is None

    login(client, "sarah.m@taskflow.io", MEMBER_PASSWORD)

    db_session.refresh(member_user)
    assert member_user.last_active_at is not None
    log = db_session.scalars(select(ActivityLog).where(ActivityLog.action == "auth.login")).one()
    assert log.actor_id == member_user.id
    assert log.ip_address


# --- refresh / logout ---------------------------------------------------------


def test_refresh_rotates_token(client: TestClient, db_session: Session, member_user: User) -> None:
    first = login(client, "sarah.m@taskflow.io", MEMBER_PASSWORD).cookies["refresh_token"]

    response = client.post(REFRESH_URL)

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "sarah.m@taskflow.io"
    second = response.cookies["refresh_token"]
    assert second and second != first

    tokens = db_session.scalars(select(RefreshToken).order_by(RefreshToken.id)).all()
    assert [token.revoked for token in tokens] == [True, False]

    # The rotated token can no longer be used.
    assert replay_refresh(client, first).status_code == 401


def test_refresh_without_cookie_returns_401(client: TestClient) -> None:
    response = client.post(REFRESH_URL)

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_refresh_token"


def test_logout_then_refresh_returns_401(
    client: TestClient, db_session: Session, admin_user: User
) -> None:
    token = login(client, "afef@taskflow.io", ADMIN_PASSWORD).cookies["refresh_token"]

    response = client.post(LOGOUT_URL)

    assert response.status_code == 200
    assert 'refresh_token=""' in response.headers["set-cookie"] or "max-age=0" in (
        response.headers["set-cookie"].lower()
    )
    assert replay_refresh(client, token).status_code == 401
    actions = db_session.scalars(select(ActivityLog.action)).all()
    assert "auth.logout" in actions


def test_password_never_returned(client: TestClient, admin_user: User) -> None:
    responses = [
        client.post(REGISTER_URL, json=register_payload()),
        login(client, "afef@taskflow.io", ADMIN_PASSWORD),
        client.post(REFRESH_URL),
    ]
    access_token = responses[1].json()["access_token"]
    responses.append(client.get("/api/v1/me", headers={"Authorization": f"Bearer {access_token}"}))

    for response in responses:
        assert response.status_code in (200, 201)
        assert "password_hash" not in response.text
        assert ADMIN_PASSWORD not in response.text


# --- /me profile & password ------------------------------------------------------------


def bearer_for(client: TestClient, email: str, password: str) -> dict[str, str]:
    token = login(client, email, password).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_get_me_profile_fields(client: TestClient, member_headers) -> None:
    body = client.get("/api/v1/me", headers=member_headers).json()

    assert {"job_title", "phone", "timezone", "created_at", "password_changed_at", "sessions_count"} <= body.keys()
    assert body["timezone"] == "Africa/Tunis"


def test_update_me(client: TestClient, member_headers, db_session: Session) -> None:
    response = client.patch(
        "/api/v1/me",
        headers=member_headers,
        json={"first_name": "Sara", "phone": "+216 22 123 456", "job_title": "Product Designer",
              "timezone": "Europe/Paris"},
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["first_name"], body["phone"], body["job_title"], body["timezone"]) == (
        "Sara", "+216 22 123 456", "Product Designer", "Europe/Paris",
    )
    assert "auth.register" not in db_session.scalars(select(ActivityLog.action)).all()


def test_admin_manages_own_profile(client: TestClient, admin_user) -> None:
    """The admin console's Profile page uses the same /me endpoints as members."""
    headers = bearer_for(client, "afef@taskflow.io", ADMIN_PASSWORD)

    updated = client.patch("/api/v1/me", headers=headers, json={"job_title": "COO", "phone": "+216 71 000 000"})
    password = client.put(
        PASSWORD_URL, headers=headers,
        json={"current_password": ADMIN_PASSWORD, "new_password": "Stronger123", "confirm_password": "Stronger123"},
    )

    assert updated.status_code == 200
    assert (updated.json()["role"], updated.json()["job_title"]) == ("admin", "COO")
    assert password.status_code == 200
    assert login(client, "afef@taskflow.io", "Stronger123").status_code == 200


def test_update_me_email_taken(client: TestClient, member_headers, admin_user) -> None:
    response = client.patch("/api/v1/me", headers=member_headers, json={"email": "AFEF@taskflow.io"})

    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


def test_update_me_invalid_timezone(client: TestClient, member_headers) -> None:
    response = client.patch("/api/v1/me", headers=member_headers, json={"timezone": "Mars/Base"})

    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "timezone"


PASSWORD_URL = "/api/v1/me/password"


def test_change_password_wrong_current(client: TestClient, member_headers) -> None:
    response = client.put(
        PASSWORD_URL, headers=member_headers,
        json={"current_password": "Wrong@1234", "new_password": "Better123", "confirm_password": "Better123"},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_current_password"
    assert response.json()["errors"] == [
        {"field": "current_password", "message": "Current password is incorrect."}
    ]


@pytest.mark.parametrize(
    ("new_password", "confirm", "field", "message"),
    [
        ("NoDigitsHere", "NoDigitsHere", "new_password", "Must include at least one number."),
        ("short1A", "short1A", "new_password", "Must be at least 8 characters."),
        ("Better123", "Better124", "confirm_password", "Passwords don’t match."),
    ],
)
def test_change_password_validation(client, member_headers, new_password, confirm, field, message) -> None:
    response = client.put(
        PASSWORD_URL, headers=member_headers,
        json={"current_password": MEMBER_PASSWORD, "new_password": new_password, "confirm_password": confirm},
    )

    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": field, "message": message}]


def test_change_password_revokes_other_sessions(
    client: TestClient, db_session: Session, member_user: User
) -> None:
    other_device = login(client, "sarah.m@taskflow.io", MEMBER_PASSWORD).cookies["refresh_token"]
    client.cookies.clear()
    headers = bearer_for(client, "sarah.m@taskflow.io", MEMBER_PASSWORD)

    response = client.put(
        PASSWORD_URL, headers=headers,
        json={"current_password": MEMBER_PASSWORD, "new_password": "Better123", "confirm_password": "Better123"},
    )

    assert response.status_code == 200
    this_device = response.cookies["refresh_token"]
    assert replay_refresh(client, other_device).status_code == 401
    assert replay_refresh(client, this_device).status_code == 200
    db_session.refresh(member_user)
    assert member_user.password_changed_at is not None
    assert login(client, "sarah.m@taskflow.io", "Better123").status_code == 200
    assert login(client, "sarah.m@taskflow.io", MEMBER_PASSWORD).status_code == 401
