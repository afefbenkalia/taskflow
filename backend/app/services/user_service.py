import secrets
import string
from datetime import UTC, datetime

from sqlalchemy import case, delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.security import hash_password
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.refresh_token import RefreshToken
from app.models.task import Task
from app.models.user import User, UserRole, UserStatus
from app.schemas.user import (
    AdminUserOut,
    AdminUserPage,
    MeOut,
    MeUpdate,
    UserCounts,
    UserCreate,
    UserUpdate,
)
from app.services import activity_service, notification_service

TEMPORARY_PASSWORD_LENGTH = 12
_PASSWORD_SYMBOLS = "@#$%&*!?"


def generate_temporary_password() -> str:
    """Random password that satisfies the sign-up rules (length, uppercase, digit)."""
    alphabet = string.ascii_letters + string.digits + _PASSWORD_SYMBOLS
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(TEMPORARY_PASSWORD_LENGTH))
        if (
            any(c.isupper() for c in password)
            and any(c.islower() for c in password)
            and any(c.isdigit() for c in password)
            and any(c in _PASSWORD_SYMBOLS for c in password)
        ):
            return password


# --- helpers -------------------------------------------------------------------


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise AppError(404, "user_not_found", "User not found.")
    return user


def _ensure_not_self(actor: User, target: User, detail: str) -> None:
    if actor.id == target.id:
        raise AppError(400, "self_action_forbidden", detail)


def _ensure_not_last_admin(db: Session, target: User) -> None:
    if target.role != UserRole.ADMIN or target.status != UserStatus.ACTIVE:
        return
    other_active_admins = db.scalar(
        select(func.count(User.id)).where(
            User.role == UserRole.ADMIN,
            User.status == UserStatus.ACTIVE,
            User.id != target.id,
        )
    )
    if not other_active_admins:
        raise AppError(400, "last_admin", "At least one active administrator is required.")


def _ensure_email_available(db: Session, email: str, exclude_id: int | None = None) -> None:
    query = select(User.id).where(User.email == email.strip().lower())
    if exclude_id is not None:
        query = query.where(User.id != exclude_id)
    if db.scalar(query) is not None:
        raise AppError(409, "email_taken", "An account with this email already exists.")


def revoke_sessions(db: Session, user_id: int) -> None:
    # Deleted rather than flagged: replaying an old token then fails with a plain 401 and
    # does not trigger reuse detection against sessions opened afterwards.
    db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))


def _projects_count(db: Session, user_ids: list[int]) -> dict[int, int]:
    if not user_ids:
        return {}
    rows = db.execute(
        select(ProjectMember.user_id, func.count())
        .where(ProjectMember.user_id.in_(user_ids))
        .group_by(ProjectMember.user_id)
    ).all()
    return dict(rows)


def to_admin_out(db: Session, users: list[User], actor: User) -> list[AdminUserOut]:
    counts = _projects_count(db, [user.id for user in users])
    return [
        AdminUserOut.model_validate(
            {
                **{field: getattr(user, field) for field in (
                    "id", "first_name", "last_name", "full_name", "email", "role",
                    "status", "job_title", "created_at", "last_active_at",
                )},
                "projects_count": counts.get(user.id, 0),
                "is_self": user.id == actor.id,
            }
        )
        for user in users
    ]


def _log(db: Session, actor: User, action: str, target: User, ip: str | None, **extra) -> None:
    activity_service.log(
        db, actor.id, action, "user", target.id, {"label": target.full_name, **extra}, ip
    )


# --- queries -------------------------------------------------------------------


def list_users(
    db: Session,
    actor: User,
    *,
    search: str | None = None,
    role: UserRole | None = None,
    status: UserStatus | None = None,
    page: int = 1,
    page_size: int = 10,
) -> AdminUserPage:
    search_filter = []
    if search:
        pattern = f"%{search.strip()}%"
        search_filter.append(
            or_(
                func.concat(User.first_name, " ", User.last_name).ilike(pattern),
                User.email.ilike(pattern),
            )
        )

    count_row = db.execute(
        select(
            func.count(User.id),
            func.count(User.id).filter(User.role == UserRole.ADMIN),
            func.count(User.id).filter(User.role == UserRole.USER),
            func.count(User.id).filter(User.status == UserStatus.PENDING),
            func.count(User.id).filter(User.status == UserStatus.DEACTIVATED),
        ).where(*search_filter)
    ).one()
    counts = UserCounts(
        all=count_row[0],
        admins=count_row[1],
        members=count_row[2],
        pending=count_row[3],
        deactivated=count_row[4],
    )

    filters = list(search_filter)
    if role is not None:
        filters.append(User.role == role)
    if status is not None:
        filters.append(User.status == status)

    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    users = db.scalars(
        select(User)
        .where(*filters)
        # Accounts awaiting approval first, then by seniority.
        .order_by(case((User.status == UserStatus.PENDING, 0), else_=1), User.created_at, User.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return AdminUserPage(
        items=to_admin_out(db, list(users), actor),
        total=total,
        page=page,
        page_size=page_size,
        counts=counts,
    )


# --- commands ------------------------------------------------------------------


def create_user(db: Session, actor: User, data: UserCreate, ip: str | None) -> tuple[User, str]:
    _ensure_email_available(db, data.email)
    password = generate_temporary_password()
    user = User(
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        password_hash=hash_password(password),
        role=data.role,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.flush()
    _log(db, actor, "user.created", user, ip, role=user.role.value)
    db.commit()
    db.refresh(user)
    return user, password


def update_user(db: Session, actor: User, user_id: int, data: UserUpdate, ip: str | None) -> User:
    user = get_user(db, user_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("email") is not None:
        _ensure_email_available(db, changes["email"], exclude_id=user.id)

    changed = []
    for field, value in changes.items():
        if field in ("first_name", "last_name", "email") and value is None:
            continue
        if getattr(user, field) != value:
            setattr(user, field, value)
            changed.append(field)

    if changed:
        db.flush()
        _log(db, actor, "user.updated", user, ip, fields=changed)
        db.commit()
        db.refresh(user)
    return user


def change_role(db: Session, actor: User, user_id: int, role: UserRole, ip: str | None) -> User:
    user = get_user(db, user_id)
    _ensure_not_self(actor, user, "You can’t change your own role.")
    if user.role == role:
        return user
    if role != UserRole.ADMIN:
        _ensure_not_last_admin(db, user)

    previous = user.role
    user.role = role
    _log(db, actor, "user.role_changed", user, ip, **{"from": previous.value, "to": role.value})
    notification_service.notify(
        db, [user.id], "user.role_changed", actor=actor, data={"from": previous.value, "to": role.value}
    )
    db.commit()
    db.refresh(user)
    return user


def approve_user(db: Session, actor: User, user_id: int, ip: str | None) -> User:
    user = get_user(db, user_id)
    if user.status != UserStatus.PENDING:
        raise AppError(400, "invalid_status", "Only pending accounts can be approved.")
    user.status = UserStatus.ACTIVE
    _log(db, actor, "user.approved", user, ip)
    notification_service.notify(db, [user.id], "user.approved", actor=actor)
    db.commit()
    db.refresh(user)
    return user


def deactivate_user(db: Session, actor: User, user_id: int, ip: str | None) -> User:
    user = get_user(db, user_id)
    _ensure_not_self(actor, user, "You can’t deactivate your own account.")
    if user.status == UserStatus.DEACTIVATED:
        raise AppError(400, "invalid_status", "This account is already deactivated.")
    _ensure_not_last_admin(db, user)

    user.status = UserStatus.DEACTIVATED
    # Sessions end immediately; access tokens are also rejected because
    # get_current_user requires an active account.
    revoke_sessions(db, user.id)
    _log(db, actor, "user.deactivated", user, ip)
    db.commit()
    db.refresh(user)
    return user


def activate_user(db: Session, actor: User, user_id: int, ip: str | None) -> User:
    user = get_user(db, user_id)
    if user.status != UserStatus.DEACTIVATED:
        raise AppError(400, "invalid_status", "Only deactivated accounts can be activated.")
    user.status = UserStatus.ACTIVE
    _log(db, actor, "user.activated", user, ip)
    db.commit()
    db.refresh(user)
    return user


def reset_password(db: Session, actor: User, user_id: int, ip: str | None) -> str:
    user = get_user(db, user_id)
    password = generate_temporary_password()
    user.password_hash = hash_password(password)
    user.password_changed_at = datetime.now(UTC)
    revoke_sessions(db, user.id)
    _log(db, actor, "user.password_reset", user, ip)
    db.commit()
    return password


def sessions_count(db: Session, user_id: int) -> int:
    return db.scalar(
        select(func.count(RefreshToken.id)).where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked.is_(False),
            RefreshToken.expires_at > datetime.now(UTC),
        )
    ) or 0


def me_out(db: Session, user: User) -> MeOut:
    return MeOut.model_validate(
        {
            **{field: getattr(user, field) for field in (
                "id", "first_name", "last_name", "full_name", "email", "role", "status",
                "job_title", "created_at", "phone", "timezone", "last_active_at",
                "password_changed_at",
            )},
            "sessions_count": sessions_count(db, user.id),
        }
    )


def update_me(db: Session, user: User, data: MeUpdate, ip: str | None) -> User:
    """Profile edit by the user; required fields cannot be cleared."""
    changes = data.model_dump(exclude_unset=True)
    if changes.get("email") is not None:
        _ensure_email_available(db, changes["email"], exclude_id=user.id)

    changed = []
    for field, value in changes.items():
        if field in ("first_name", "last_name", "email", "timezone") and value is None:
            continue
        if getattr(user, field) != value:
            setattr(user, field, value)
            changed.append(field)

    if changed:
        db.flush()
        _log(db, user, "user.updated", user, ip, fields=changed)
        db.commit()
        db.refresh(user)
    return user


def delete_user(db: Session, actor: User, user_id: int, ip: str | None) -> None:
    user = get_user(db, user_id)
    _ensure_not_self(actor, user, "You can’t delete your own account.")
    owned = db.scalar(select(func.count(Project.id)).where(Project.owner_id == user.id))
    if owned:
        raise AppError(
            409,
            "user_owns_projects",
            "This user owns projects. Transfer or delete them before deleting the user.",
        )
    _ensure_not_last_admin(db, user)

    db.execute(update(Task).where(Task.assignee_id == user.id).values(assignee_id=None))
    _log(db, actor, "user.deleted", user, ip, email=user.email)
    db.delete(user)
    db.commit()
