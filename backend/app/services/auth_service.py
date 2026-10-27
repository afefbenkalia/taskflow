from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppError
from app.core.security import (
    access_token_ttl_seconds,
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.core.mailer import send_email
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.models.user import User, UserRole, UserStatus
from app.schemas.auth import LoginRequest, RegisterRequest, ResetPasswordRequest
from app.schemas.user import PasswordChange
from app.services import activity_service, notification_service

INVALID_CREDENTIALS = "Incorrect email or password."
SESSION_EXPIRED = "Your session has expired. Please sign in again."

# Compared against when the email is unknown, so both failure paths cost one bcrypt check.
_DUMMY_PASSWORD_HASH = hash_password("timing-equalizer")


@dataclass(frozen=True)
class ClientInfo:
    ip: str | None = None
    user_agent: str | None = None


@dataclass(frozen=True)
class AuthResult:
    user: User
    access_token: str
    expires_in: int
    refresh_token: str
    refresh_expires_at: datetime


def _now() -> datetime:
    return datetime.now(UTC)


def _issue_tokens(
    db: Session, user: User, refresh_lifetime: timedelta, client: ClientInfo
) -> AuthResult:
    refresh_token = generate_refresh_token()
    expires_at = _now() + refresh_lifetime
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=expires_at,
            user_agent=(client.user_agent or "")[:255] or None,
            ip_address=client.ip,
        )
    )
    return AuthResult(
        user=user,
        access_token=create_access_token(user.id, user.role.value),
        expires_in=access_token_ttl_seconds(),
        refresh_token=refresh_token,
        refresh_expires_at=expires_at,
    )


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.strip().lower()))


def register(db: Session, data: RegisterRequest, client: ClientInfo) -> User:
    if get_user_by_email(db, data.email) is not None:
        raise AppError(409, "email_taken", "An account with this email already exists.")

    user = User(
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        password_hash=hash_password(data.password),
        role=UserRole.USER,
        status=UserStatus.PENDING,
    )
    db.add(user)
    db.flush()
    activity_service.log(
        db, user.id, "auth.register", "user", user.id, {"email": user.email}, client.ip
    )
    # Pending accounts need an admin's approval: tell every active admin.
    notification_service.notify(
        db, notification_service.active_admin_ids(db), "user.registered", actor=user,
        data={"email": user.email},
    )
    db.commit()
    db.refresh(user)
    return user


def login(db: Session, data: LoginRequest, client: ClientInfo) -> AuthResult:
    user = get_user_by_email(db, data.email)
    password_ok = verify_password(
        data.password, user.password_hash if user else _DUMMY_PASSWORD_HASH
    )
    if user is None or not password_ok:
        raise AppError(401, "invalid_credentials", INVALID_CREDENTIALS)

    if user.status == UserStatus.PENDING:
        raise AppError(403, "account_pending", "Your account is awaiting administrator approval.")
    if user.status == UserStatus.DEACTIVATED:
        raise AppError(403, "account_deactivated", "This account has been deactivated.")

    days = (
        settings.REFRESH_TOKEN_REMEMBER_DAYS
        if data.remember_me
        else settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    user.last_active_at = _now()
    result = _issue_tokens(db, user, timedelta(days=days), client)
    activity_service.log(
        db,
        user.id,
        "auth.login",
        "user",
        user.id,
        {
            "remember_me": data.remember_me,
            "client": activity_service.describe_user_agent(client.user_agent),
        },
        client.ip,
    )
    db.commit()
    return result


def refresh(db: Session, refresh_token: str | None, client: ClientInfo) -> AuthResult:
    if not refresh_token:
        raise AppError(401, "invalid_refresh_token", SESSION_EXPIRED)

    stored = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
    )
    if stored is None:
        raise AppError(401, "invalid_refresh_token", SESSION_EXPIRED)

    if stored.revoked:
        # A rotated token was replayed: treat the whole session family as compromised.
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == stored.user_id)
            .values(revoked=True)
        )
        db.commit()
        raise AppError(401, "invalid_refresh_token", SESSION_EXPIRED)

    if stored.expires_at <= _now() or not stored.user.is_active:
        raise AppError(401, "invalid_refresh_token", SESSION_EXPIRED)

    # Rotation keeps the lifetime chosen at login (default vs. "remember me").
    lifetime = stored.expires_at - stored.created_at
    stored.revoked = True
    user = stored.user
    user.last_active_at = _now()
    result = _issue_tokens(db, user, lifetime, client)
    db.commit()
    return result


def change_password(
    db: Session, user: User, data: PasswordChange, client: ClientInfo
) -> AuthResult:
    """Changes the password, ends every other session and opens a fresh one for this device."""
    if not verify_password(data.current_password, user.password_hash):
        raise AppError(
            400,
            "invalid_current_password",
            "Current password is incorrect.",
            errors=[{"field": "current_password", "message": "Current password is incorrect."}],
        )

    user.password_hash = hash_password(data.new_password)
    user.password_changed_at = _now()
    # Sessions are deleted rather than revoked: a replayed old token then gets a plain 401
    # instead of triggering reuse detection, which would also end this new session.
    db.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    result = _issue_tokens(db, user, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS), client)
    activity_service.log(
        db, user.id, "auth.password_changed", "user", user.id, {"label": user.full_name}, client.ip
    )
    db.commit()
    return result


# --- forgot password -------------------------------------------------------------------

RESET_LINK_INVALID = "This reset link is invalid or has expired. Request a new one."
# A user asking again within this delay does not get a second email.
RESET_RESEND_DELAY = timedelta(seconds=60)


def request_password_reset(db: Session, email: str, client: ClientInfo) -> None:
    """Emails a single-use reset link to an active account.

    The caller always answers the same way, whether the account exists or not,
    so the endpoint cannot be used to discover registered emails.
    """
    user = get_user_by_email(db, email)
    if user is None or user.status != UserStatus.ACTIVE:
        return
    now = _now()
    latest = db.scalar(
        select(PasswordResetToken.created_at)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .order_by(PasswordResetToken.created_at.desc())
        .limit(1)
    )
    if latest is not None and now - latest < RESET_RESEND_DELAY:
        return

    # Only the newest link works.
    db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    token = generate_refresh_token()
    db.add(PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=now + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES),
        created_at=now,
    ))
    activity_service.log(
        db, user.id, "auth.password_reset_requested", "user", user.id, {"label": user.full_name}, client.ip
    )
    # Admins are told, so they can react if the request looks suspicious.
    notification_service.notify(
        db, notification_service.active_admin_ids(db), "user.password_reset_requested", actor=user,
        data={"email": user.email},
    )
    db.commit()

    link =f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    send_email(
        user.email,
        "Reset your TaskFlow password",
        f"Hi {user.first_name},\n\n"
        f"We received a request to reset the password of your TaskFlow account.\n"
        f"Open this link to choose a new password (valid for {settings.PASSWORD_RESET_EXPIRE_MINUTES} minutes):\n\n"
        f"{link}\n\n"
        f"If you didn’t ask for this, you can ignore this email: your password stays the same.\n",
    )


def reset_password(db: Session, data: ResetPasswordRequest, client: ClientInfo) -> None:
    """Sets the new password from a reset link, which can be used once; ends every session."""
    stored = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(data.token))
    )
    user = db.get(User, stored.user_id) if stored is not None else None
    if (
        stored is None
        or stored.used_at is not None
        or stored.expires_at <= _now()
        or user is None
        or user.status != UserStatus.ACTIVE
    ):
        raise AppError(400, "invalid_reset_token", RESET_LINK_INVALID)

    user.password_hash = hash_password(data.new_password)
    user.password_changed_at = _now()
    stored.used_at = _now()
    # Whoever had a session (possibly the person who took over the account) is signed out.
    db.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    activity_service.log(
        db, user.id, "auth.password_reset_completed", "user", user.id, {"label": user.full_name}, client.ip
    )
    db.commit()


def logout(db: Session, refresh_token: str | None, client: ClientInfo) -> None:
    if not refresh_token:
        return

    stored = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
    )
    if stored is None or stored.revoked:
        return

    stored.revoked = True
    activity_service.log(db, stored.user_id, "auth.logout", "user", stored.user_id, None, client.ip)
    db.commit()
