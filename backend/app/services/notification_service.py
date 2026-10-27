"""In-app notifications for members and admins.

Services call `notify` inside their own transaction (the caller commits), so a
notification exists only if the action it describes was saved. The actor is
never notified of their own action.
"""

from collections.abc import Callable, Iterable
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.notification import Notification
from app.models.project import Project
from app.models.user import User, UserRole, UserStatus
from app.schemas.notification import (
    MarkAllReadResult,
    NotificationOut,
    NotificationPage,
    NotificationProject,
    UnreadCount,
)
from app.schemas.user import UserBrief

TASK_STATUS_LABELS = {"todo": "To do", "in_progress": "In progress", "done": "Done"}
ROLE_LABELS = {"admin": "Admin", "user": "Member"}


def notify(
    db: Session,
    recipient_ids: Iterable[int | None],
    kind: str,
    *,
    actor: User | None,
    project: Project | None = None,
    data: dict[str, Any] | None = None,
) -> list[Notification]:
    """Adds one notification per recipient (deduplicated, actor excluded)."""
    payload = dict(data or {})
    if project is not None:
        payload.setdefault("project", project.name)
    created = []
    for recipient_id in dict.fromkeys(recipient_ids):
        if recipient_id is None or (actor is not None and recipient_id == actor.id):
            continue
        notification = Notification(
            user_id=recipient_id,
            actor_id=actor.id if actor else None,
            kind=kind,
            project_id=project.id if project else None,
            data=payload or None,
        )
        db.add(notification)
        created.append(notification)
    return created


def active_admin_ids(db: Session) -> list[int]:
    return list(db.scalars(
        select(User.id).where(User.role == UserRole.ADMIN, User.status == UserStatus.ACTIVE)
    ))


# --- presentation ------------------------------------------------------------------


def _message(notification: Notification) -> str:
    data = notification.data or {}
    title = data.get("title", "a task")
    project = data.get("project", "a project")
    messages: dict[str, Callable[[], str]] = {
        "task.assigned": lambda: f"assigned you {title} in {project}",
        "task.status_changed": lambda: (
            f"moved {title} to {TASK_STATUS_LABELS.get(data.get('to'), data.get('to'))} in {project}"
        ),
        "task.commented": lambda: f"commented on {title} in {project}",
        "project.member_added": lambda: f"added you to {project}",
        "project.member_removed": lambda: f"removed you from {project}",
        "project.owner_assigned": lambda: f"made you the owner of {project}",
        "project.archived": lambda: f"archived {project}",
        "project.unarchived": lambda: f"restored {project}",
        "user.role_changed": lambda: f"changed your role to {ROLE_LABELS.get(data.get('to'), data.get('to'))}",
        "user.approved": lambda: "approved your account",
        "user.registered": lambda: "signed up and is waiting for approval",
        "user.password_reset_requested": lambda: "requested a password reset link",
    }
    return messages.get(notification.kind, lambda: notification.kind)()


def _link(notification: Notification) -> str | None:
    """Admins use the console and members the workspace, so links depend on the recipient's role."""
    admin = notification.recipient.role == UserRole.ADMIN
    kind = notification.kind
    if kind == "user.registered":
        return "/admin/users?status=pending" if admin else None
    if kind == "user.password_reset_requested":
        email = (notification.data or {}).get("email", "")
        return f"/admin/users?search={quote(email)}" if admin else None
    if kind in ("user.role_changed", "user.approved"):
        return "/admin" if admin else "/app"
    if kind == "project.member_removed" or notification.project_id is None:
        return None
    if admin:
        return "/admin/projects"
    if kind.startswith("task."):
        return f"/app/projects/{notification.project_id}?tab=tasks"
    return f"/app/projects/{notification.project_id}"


def _serialize(db: Session, notifications: list[Notification]) -> list[NotificationOut]:
    project_ids = {n.project_id for n in notifications if n.project_id is not None}
    projects = (
        {p.id: p for p in db.scalars(select(Project).where(Project.id.in_(project_ids)))}
        if project_ids
        else {}
    )
    result = []
    for notification in notifications:
        project = projects.get(notification.project_id) if notification.project_id else None
        result.append(
            NotificationOut(
                id=notification.id,
                kind=notification.kind,
                actor=UserBrief.model_validate(notification.actor) if notification.actor else None,
                message=_message(notification),
                link=_link(notification),
                project=(
                    NotificationProject(id=project.id, name=project.name, color=project.color)
                    if project
                    else None
                ),
                read=notification.read_at is not None,
                created_at=notification.created_at,
            )
        )
    return result


# --- queries and commands ----------------------------------------------------------


def unread_count(db: Session, user: User) -> UnreadCount:
    count = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    )
    return UnreadCount(count=count or 0)


def list_notifications(
    db: Session, user: User, *, unread: bool = False, page: int = 1, page_size: int = 20
) -> NotificationPage:
    query = select(Notification).where(Notification.user_id == user.id)
    if unread:
        query = query.where(Notification.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique().all()
    return NotificationPage(
        items=_serialize(db, list(rows)),
        total=total,
        page=page,
        page_size=page_size,
        unread_count=unread_count(db, user).count,
    )


def mark_read(db: Session, user: User, notification_id: int) -> NotificationOut:
    notification = db.get(Notification, notification_id)
    # Someone else's notification is reported as missing.
    if notification is None or notification.user_id != user.id:
        raise AppError(404, "notification_not_found", "Notification not found.")
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        db.commit()
        db.refresh(notification)
    return _serialize(db, [notification])[0]


def mark_all_read(db: Session, user: User) -> MarkAllReadResult:
    result = db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    db.commit()
    return MarkAllReadResult(updated=result.rowcount or 0)
