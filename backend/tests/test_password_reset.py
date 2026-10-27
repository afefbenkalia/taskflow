"""Forgot password: emailed single-use link, then a new password."""

import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.services import auth_service
from tests.conftest import MEMBER_PASSWORD

FORGOT = "/api/v1/auth/forgot-password"
RESET = "/api/v1/auth/reset-password"
LOGIN = "/api/v1/auth/login"
SAME_ANSWER = {"message": "If an account exists for this email, we’ve sent a link to reset the password."}


@pytest.fixture
def outbox(monkeypatch) -> list[dict[str, str]]:
    sent: list[dict[str, str]] = []
    monkeypatch.setattr(auth_service, "send_email", lambda to, subject, body: sent.append(
        {"to": to, "subject": subject, "body": body}
    ))
    return sent


def token_from(email: dict[str, str]) -> str:
    match = re.search(r"/reset-password\?token=(\S+)", email["body"])
    assert match, email["body"]
    return match.group(1)


def reset(client, token: str, password: str = "Brand-new1", confirm: str | None = None):
    return client.post(RESET, json={"token": token, "new_password": password,
                                    "confirm_password": confirm if confirm is not None else password})


def test_full_reset_flow(client, db_session: Session, member_user, outbox) -> None:
    client.post(LOGIN, json={"email": member_user.email, "password": MEMBER_PASSWORD})  # an open session

    response = client.post(FORGOT, json={"email": "  SARAH.M@taskflow.io "})

    assert (response.status_code, response.json()) == (200, SAME_ANSWER)
    assert len(outbox) == 1
    assert outbox[0]["to"] == "sarah.m@taskflow.io"
    assert outbox[0]["body"].count("http://localhost:5173/reset-password?token=") == 1

    done = reset(client, token_from(outbox[0]))

    assert (done.status_code, done.json()["message"]) == (200, "Your password has been reset. You can now sign in.")
    assert client.post(LOGIN, json={"email": member_user.email, "password": MEMBER_PASSWORD}).status_code == 401
    assert client.post(LOGIN, json={"email": member_user.email, "password": "Brand-new1"}).status_code == 200
    # Sessions that existed before the reset are gone (only the new sign-in remains).
    assert db_session.scalar(select(RefreshToken).where(RefreshToken.user_id == member_user.id).limit(1)) is not None
    actions = set(db_session.scalars(select(ActivityLog.action)))
    assert {"auth.password_reset_requested", "auth.password_reset_completed"} <= actions


def test_reset_ends_existing_sessions(client, db_session: Session, member_user, outbox) -> None:
    client.post(LOGIN, json={"email": member_user.email, "password": MEMBER_PASSWORD})
    client.post(FORGOT, json={"email": member_user.email})

    reset(client, token_from(outbox[0]))

    assert db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == member_user.id)).all() == []
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_unknown_or_inactive_accounts_get_the_same_answer(
    client, outbox, pending_user, deactivated_user
) -> None:
    for email in ("nobody@taskflow.io", pending_user.email, deactivated_user.email):
        response = client.post(FORGOT, json={"email": email})
        assert (response.status_code, response.json()) == (200, SAME_ANSWER)

    assert outbox == []


def test_a_link_works_once(client, member_user, outbox) -> None:
    client.post(FORGOT, json={"email": member_user.email})
    token = token_from(outbox[0])

    assert reset(client, token).status_code == 200
    again = reset(client, token, "Another-one2")

    assert again.status_code == 400
    assert again.json() == {
        "detail": "This reset link is invalid or has expired. Request a new one.", "code": "invalid_reset_token",
    }


def test_expired_and_unknown_links_are_refused(client, db_session: Session, member_user, outbox) -> None:
    client.post(FORGOT, json={"email": member_user.email})
    stored = db_session.scalars(select(PasswordResetToken)).one()
    stored.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.commit()

    assert reset(client, token_from(outbox[0])).json()["code"] == "invalid_reset_token"
    assert reset(client, "not-a-real-token").json()["code"] == "invalid_reset_token"


def test_only_the_newest_link_works(client, db_session: Session, member_user, outbox, monkeypatch) -> None:
    monkeypatch.setattr(auth_service, "RESET_RESEND_DELAY", timedelta(0))
    client.post(FORGOT, json={"email": member_user.email})
    client.post(FORGOT, json={"email": member_user.email})

    assert len(outbox) == 2
    assert reset(client, token_from(outbox[0])).status_code == 400
    assert reset(client, token_from(outbox[1])).status_code == 200


def test_repeated_requests_send_one_email(client, member_user, outbox) -> None:
    for _ in range(3):
        assert client.post(FORGOT, json={"email": member_user.email}).status_code == 200

    assert len(outbox) == 1


def test_new_password_rules(client, member_user, outbox) -> None:
    client.post(FORGOT, json={"email": member_user.email})
    token = token_from(outbox[0])

    weak = reset(client, token, "short1A")
    mismatch = reset(client, token, "Brand-new1", "Brand-new2")

    assert weak.status_code == mismatch.status_code == 422
    assert weak.json()["errors"] == [{"field": "new_password", "message": "Must be at least 8 characters."}]
    assert mismatch.json()["errors"] == [{"field": "confirm_password", "message": "Passwords don’t match."}]
    assert reset(client, token).status_code == 200  # the link was not used up by invalid attempts


def test_admins_are_notified_of_a_reset_request(
    client, member_user, admin_user, second_admin, outbox
) -> None:
    from app.core.security import create_access_token

    def inbox(user) -> list[dict]:
        headers = {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}
        return client.get("/api/v1/notifications", headers=headers).json()["items"]

    client.post(FORGOT, json={"email": member_user.email})
    client.post(FORGOT, json={"email": member_user.email})  # within the resend delay: no second notification
    client.post(FORGOT, json={"email": "nobody@taskflow.io"})  # unknown account: nothing

    for admin in (admin_user, second_admin):
        items = inbox(admin)
        assert len(items) == 1
        assert (items[0]["actor"]["full_name"], items[0]["message"], items[0]["link"]) == (
            "Sarah Mansour", "requested a password reset link", "/admin/users?search=sarah.m%40taskflow.io",
        )
    assert inbox(member_user) == []

    # An admin asking for their own link does not notify themselves, only the other admins.
    client.post(FORGOT, json={"email": admin_user.email})
    assert len(inbox(admin_user)) == 1
    assert inbox(second_admin)[0]["actor"]["full_name"] == "Afef Ben Kalia"


def test_invalid_email_is_rejected(client, outbox) -> None:
    response = client.post(FORGOT, json={"email": "not-an-email"})

    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "email"


def test_without_smtp_the_email_is_logged(caplog) -> None:
    from app.core.mailer import send_email

    with caplog.at_level("WARNING", logger="taskflow.mail"):
        send_email("sarah.m@taskflow.io", "Reset your TaskFlow password", "Open http://localhost:5173/reset-password?token=abc")

    assert "reset-password?token=abc" in caplog.text
