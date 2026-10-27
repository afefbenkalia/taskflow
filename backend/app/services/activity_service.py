import csv
import io
from collections.abc import Collection
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.orm import Session

from app.core import pdf
from app.models.activity_log import ActivityLog
from app.models.project import Project
from app.models.user import User
from app.schemas.activity import (
    ActivityOut,
    ActivityPage,
    ActivityPeriod,
    ActivityProject,
    ActivityType,
    ProjectActivityOut,
    ProjectActivityPage,
    TargetKind,
    WorkspaceActivityOut,
    WorkspaceActivityPage,
)
from app.schemas.user import UserBrief

ACTION_TYPES: dict[str, ActivityType] = {
    "user.role_changed": ActivityType.ROLE,
    "user.approved": ActivityType.STATUS,
    "user.activated": ActivityType.STATUS,
    "project.archived": ActivityType.STATUS,
    "project.unarchived": ActivityType.STATUS,
    "user.created": ActivityType.CREATE,
    "project.created": ActivityType.CREATE,
    "auth.register": ActivityType.CREATE,
    "auth.login": ActivityType.AUTH,
    "auth.logout": ActivityType.AUTH,
    "user.deactivated": ActivityType.DEACTIVATE,
    "user.deleted": ActivityType.DEACTIVATE,
    "project.deleted": ActivityType.DEACTIVATE,
    "user.updated": ActivityType.UPDATE,
    "user.password_reset": ActivityType.UPDATE,
    "auth.password_changed": ActivityType.UPDATE,
    "auth.password_reset_requested": ActivityType.AUTH,
    "auth.password_reset_completed": ActivityType.UPDATE,
    "task.created": ActivityType.CREATE,
    "task.status_changed": ActivityType.STATUS,
    "task.commented": ActivityType.UPDATE,
    "project.member_added": ActivityType.CREATE,
    "project.member_removed": ActivityType.DEACTIVATE,
    "file.uploaded": ActivityType.CREATE,
    "file.deleted": ActivityType.DEACTIVATE,
    "auth.denied": ActivityType.DENIED,
}

# Entities logged with details["project_id"]; project events use entity_id.
PROJECT_CHILD_ENTITIES = ("task", "file")

TASK_STATUS_LABELS = {"todo": "To do", "in_progress": "In progress", "done": "Done"}

PERIOD_DELTAS: dict[ActivityPeriod, timedelta] = {
    ActivityPeriod.LAST_24_HOURS: timedelta(hours=24),
    ActivityPeriod.LAST_7_DAYS: timedelta(days=7),
    ActivityPeriod.LAST_30_DAYS: timedelta(days=30),
}

ROLE_LABELS = {"admin": "Admin", "user": "Member"}
API_PREFIX = "/api/v1"


def log(
    db: Session,
    actor_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    details: dict[str, Any] | None = None,
    ip: str | None = None,
) -> ActivityLog:
    """Add an activity entry to the session. The caller owns the commit."""
    entry = ActivityLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
        ip_address=ip,
    )
    db.add(entry)
    return entry


def describe_user_agent(user_agent: str | None) -> str:
    """'Mozilla/5.0 (Windows NT 10.0; ...) Chrome/...' -> 'Chrome · Windows'."""
    ua = user_agent or ""
    browsers = [("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"),
                ("Chrome/", "Chrome"), ("Safari/", "Safari")]
    systems = [("Windows", "Windows"), ("iPhone", "iOS"), ("iPad", "iOS"),
               ("Android", "Android"), ("Mac OS X", "macOS"), ("Linux", "Linux")]
    browser = next((name for token, name in browsers if token in ua), None)
    system = next((name for token, name in systems if token in ua), None)
    parts = [part for part in (browser, system) if part]
    return " · ".join(parts) if parts else "Unknown device"


def activity_type(action: str) -> ActivityType:
    return ACTION_TYPES.get(action, ActivityType.UPDATE)


def _actions_of_type(kind: ActivityType) -> list[str]:
    return [action for action, action_kind in ACTION_TYPES.items() if action_kind == kind]


def _target(entry: ActivityLog) -> tuple[TargetKind, str]:
    if entry.action in ("auth.login", "auth.logout"):
        return TargetKind.SESSION, "Session"
    if entry.action == "auth.denied":
        return TargetKind.SECURITY, "Security"
    if entry.entity_type == "project":
        return TargetKind.PROJECT, "Project"
    if entry.entity_type == "task":
        task_key = (entry.details or {}).get("task_key")
        return TargetKind.TASK, f"Task · {task_key}" if task_key else "Task"
    if entry.entity_type == "file":
        return TargetKind.FILE, "File"
    return TargetKind.USER, "User"


def serialize(db: Session, entries: list[ActivityLog]) -> list[ActivityOut]:
    user_ids = {entry.actor_id for entry in entries if entry.actor_id}
    user_ids |= {
        entry.entity_id for entry in entries if entry.entity_type == "user" and entry.entity_id
    }
    users = (
        {user.id: user for user in db.scalars(select(User).where(User.id.in_(user_ids)))}
        if user_ids
        else {}
    )

    result = []
    for entry in entries:
        details = entry.details or {}
        actor = users.get(entry.actor_id) if entry.actor_id else None
        label = details.get("label")
        if entry.action == "auth.denied":
            label = str(details.get("path", "")).removeprefix(API_PREFIX) or None
        elif label is None and entry.entity_type == "user" and entry.entity_id in users:
            label = users[entry.entity_id].full_name
        target_kind, target_label = _target(entry)
        result.append(
            ActivityOut(
                id=entry.id,
                actor=UserBrief.model_validate(actor) if actor else None,
                action=entry.action,
                type=activity_type(entry.action),
                entity_type=entry.entity_type,
                entity_id=entry.entity_id,
                entity_label=label,
                target_kind=target_kind,
                target_label=target_label,
                details=entry.details,
                ip=entry.ip_address,
                created_at=entry.created_at,
            )
        )
    return result


def _filtered_query(
    search: str | None,
    user_id: int | None,
    kind: ActivityType | None,
    project_id: int | None,
    period: ActivityPeriod | None,
):
    query = select(ActivityLog).outerjoin(User, User.id == ActivityLog.actor_id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                func.concat(User.first_name, " ", User.last_name).ilike(pattern),
                User.email.ilike(pattern),
                ActivityLog.action.ilike(pattern),
                cast(ActivityLog.details, String).ilike(pattern),
            )
        )
    if user_id is not None:
        query = query.where(ActivityLog.actor_id == user_id)
    if kind is not None:
        query = query.where(ActivityLog.action.in_(_actions_of_type(kind)))
    if project_id is not None:
        query = query.where(
            ActivityLog.entity_type == "project", ActivityLog.entity_id == project_id
        )
    if period is not None:
        query = query.where(ActivityLog.created_at >= datetime.now(UTC) - PERIOD_DELTAS[period])
    return query


def list_activity(
    db: Session,
    *,
    search: str | None = None,
    user_id: int | None = None,
    kind: ActivityType | None = None,
    project_id: int | None = None,
    period: ActivityPeriod | None = None,
    page: int = 1,
    page_size: int = 10,
) -> ActivityPage:
    query = _filtered_query(search, user_id, kind, project_id, period)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    entries = db.scalars(
        query.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return ActivityPage(
        items=serialize(db, list(entries)), total=total, page=page, page_size=page_size
    )


def _in_projects(project_ids: Collection[int]):
    return or_(
        and_(ActivityLog.entity_type == "project", ActivityLog.entity_id.in_(project_ids)),
        and_(
            ActivityLog.entity_type.in_(PROJECT_CHILD_ENTITIES),
            ActivityLog.details["project_id"].as_integer().in_(project_ids),
        ),
    )


def project_id_of(item: ActivityOut) -> int | None:
    if item.entity_type == "project":
        return item.entity_id
    value = (item.details or {}).get("project_id")
    return value if isinstance(value, int) else None


def _project_page(
    db: Session, project_ids: Collection[int], actor_id: int | None, page: int, page_size: int
) -> tuple[list[ActivityOut], int]:
    if not project_ids:
        return [], 0
    query = select(ActivityLog).where(_in_projects(project_ids))
    if actor_id is not None:
        query = query.where(ActivityLog.actor_id == actor_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    entries = db.scalars(
        query.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return serialize(db, list(entries)), total


# Members never see IP addresses or audit targets.
MEMBER_HIDDEN_FIELDS = {"ip", "target_kind", "target_label"}


def project_activity(
    db: Session, project_id: int, *, page: int = 1, page_size: int = 20
) -> ProjectActivityPage:
    """What happened in one project (tasks, members, files), newest first."""
    items, total = _project_page(db, [project_id], None, page, page_size)
    return ProjectActivityPage(
        items=[ProjectActivityOut.model_validate(item.model_dump(exclude=MEMBER_HIDDEN_FIELDS))
               for item in items],
        total=total, page=page, page_size=page_size,
    )


def workspace_activity(
    db: Session,
    projects: Collection[ActivityProject],
    *,
    actor_id: int | None = None,
    page: int = 1,
    page_size: int = 20,
) -> WorkspaceActivityPage:
    """Activity across the given projects, each entry tagged with its project."""
    by_id = {project.id: project for project in projects}
    items, total = _project_page(db, list(by_id), actor_id, page, page_size)
    return WorkspaceActivityPage(
        items=[
            WorkspaceActivityOut(
                **item.model_dump(exclude=MEMBER_HIDDEN_FIELDS),
                project=by_id.get(project_id_of(item)),
            )
            for item in items
        ],
        total=total, page=page, page_size=page_size,
    )


def recent_admin_activity(db: Session, limit: int = 4) -> list[ActivityOut]:
    """Latest administrative actions (user.* and project.*) for the overview."""
    entries = db.scalars(
        select(ActivityLog)
        .where(or_(ActivityLog.action.like("user.%"), ActivityLog.action.like("project.%")))
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .limit(limit)
    ).all()
    return serialize(db, list(entries))


def describe(item: ActivityOut) -> str:
    """Plain-text sentence, mirrored by the frontend's rich rendering."""
    details = item.details or {}
    label = item.entity_label or "—"
    sentences = {
        "user.role_changed": lambda: (
            f"Changed role of {label} from {ROLE_LABELS.get(details.get('from'), details.get('from'))}"
            f" to {ROLE_LABELS.get(details.get('to'), details.get('to'))}"
        ),
        "user.created": lambda: f"Created user {label}",
        "user.updated": lambda: f"Updated details of {label}",
        "user.approved": lambda: f"Approved {label}",
        "user.deactivated": lambda: f"Deactivated {label}",
        "user.activated": lambda: f"Activated {label}",
        "user.password_reset": lambda: f"Reset password of {label}",
        "user.deleted": lambda: f"Deleted user {label}",
        "project.created": lambda: f"Created project {label}",
        "project.archived": lambda: f"Archived project {label}",
        "project.unarchived": lambda: f"Unarchived project {label}",
        "project.deleted": lambda: f"Deleted project {label}",
        "project.member_added": lambda: f"Added {details.get('member', '—')} to {label}",
        "project.member_removed": lambda: f"Removed {details.get('member', '—')} from {label}",
        "task.commented": lambda: f"Commented on {label}",
        "file.uploaded": lambda: f"Uploaded {label}",
        "file.deleted": lambda: f"Deleted file {label}",
        "task.created": lambda: f"Created task {label}",
        "task.status_changed": lambda: (
            f"Changed status of {label} from {TASK_STATUS_LABELS.get(details.get('from'), details.get('from'))}"
            f" to {TASK_STATUS_LABELS.get(details.get('to'), details.get('to'))}"
        ),
        "auth.password_changed": lambda: "Changed their password",
        "auth.password_reset_requested": lambda: "Requested a password reset link",
        "auth.password_reset_completed": lambda: "Reset their password with an emailed link",
        "auth.login": lambda: f"Signed in from {details.get('client', 'Unknown device')}",
        "auth.logout": lambda: "Signed out",
        "auth.register": lambda: "Created an account",
        "auth.denied": lambda: f"Blocked request to {label} — 403 Forbidden",
    }
    return sentences.get(item.action, lambda: item.action)()


def export_csv(
    db: Session,
    *,
    search: str | None = None,
    user_id: int | None = None,
    kind: ActivityType | None = None,
    project_id: int | None = None,
    period: ActivityPeriod | None = None,
) -> str:
    query = _filtered_query(search, user_id, kind, project_id, period).order_by(
        ActivityLog.created_at.desc(), ActivityLog.id.desc()
    )
    items = serialize(db, list(db.scalars(query).all()))

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Time", "User", "Role", "Action", "Type", "Target", "IP address"])
    for item in items:
        writer.writerow([
            item.created_at.isoformat(timespec="seconds"),
            item.actor.full_name if item.actor else "System",
            ROLE_LABELS.get(item.actor.role.value, "") if item.actor else "",
            describe(item),
            item.type.value,
            item.target_label,
            item.ip or "",
        ])
    return buffer.getvalue()


# A PDF of the whole log would be unreadable; the CSV export has every entry.
PDF_MAX_ROWS = 1000

TYPE_LABELS = {
    ActivityType.ROLE: "Role changes",
    ActivityType.STATUS: "Status changes",
    ActivityType.CREATE: "Creations",
    ActivityType.AUTH: "Sign-ins",
    ActivityType.DEACTIVATE: "Deactivations",
    ActivityType.UPDATE: "Updates",
    ActivityType.DENIED: "Access denied",
}
PERIOD_LABELS = {
    ActivityPeriod.LAST_24_HOURS: "Last 24 hours",
    ActivityPeriod.LAST_7_DAYS: "Last 7 days",
    ActivityPeriod.LAST_30_DAYS: "Last 30 days",
}


def export_pdf(
    db: Session,
    *,
    search: str | None = None,
    user_id: int | None = None,
    kind: ActivityType | None = None,
    project_id: int | None = None,
    period: ActivityPeriod | None = None,
) -> bytes:
    """The filtered log, newest first, like the CSV export (capped at PDF_MAX_ROWS)."""
    query = _filtered_query(search, user_id, kind, project_id, period)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    entries = db.scalars(
        query.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc()).limit(PDF_MAX_ROWS)
    ).all()
    items = serialize(db, list(entries))

    details: list[tuple[str, str]] = [("Period", PERIOD_LABELS[period] if period else "All time")]
    if search:
        details.append(("Search", search.strip()))
    if user_id is not None:
        user = db.get(User, user_id)
        details.append(("User", user.full_name if user else f"#{user_id}"))
    if kind is not None:
        details.append(("Type", TYPE_LABELS[kind]))
    if project_id is not None:
        project = db.get(Project, project_id)
        details.append(("Project", project.name if project else f"#{project_id}"))
    shown = f"{len(items):,} of {total:,}" if total > len(items) else f"{total:,}"
    details.append(("Entries", shown + (" (most recent; export CSV for all)" if total > len(items) else "")))

    rows = [
        [
            item.created_at.astimezone(UTC).strftime("%b %d, %Y %H:%M"),
            item.actor.full_name if item.actor else "System",
            ROLE_LABELS.get(item.actor.role.value, "") if item.actor else "",
            describe(item),
            item.target_label,
            item.ip or "—",
        ]
        for item in items
    ]
    return pdf.build_pdf(
        "Activity log",
        [
            pdf.PdfTable(
                headers=["Time (UTC)", "User", "Role", "Action", "Target", "IP address"],
                rows=rows,
                widths=[1.2, 1.4, 0.7, 3.6, 1.2, 1.0],
                empty_message="No activity matches these filters.",
            )
        ],
        details=details,
    )
