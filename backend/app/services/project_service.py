import csv
import io
from datetime import UTC, date, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import pdf, permissions, storage
from app.core.exceptions import AppError
from app.models.project import Project
from app.models.project_file import ProjectFile
from app.models.project_member import ProjectMember, ProjectRole
from app.models.task import Task, TaskStatus
from app.models.user import User, UserStatus
from app.schemas.activity import ActivityProject, WorkspaceActivityPage
from app.schemas.project import (
    MemberCandidate,
    MyProjectOut,
    PermissionOut,
    ProjectCreate,
    ProjectDetail,
    ProjectHealth,
    ProjectMemberOut,
    ProjectOut,
    ProjectPage,
    ProjectScope,
    ProjectSummary,
)
from app.schemas.user import UserBrief
from app.services import activity_service, notification_service

AT_RISK_WINDOW_DAYS = 14
AT_RISK_MAX_PROGRESS = 70

HEALTH_LABELS = {
    ProjectHealth.ON_TRACK: "On track",
    ProjectHealth.AT_RISK: "At risk",
    ProjectHealth.OVERDUE: "Overdue",
    ProjectHealth.COMPLETED: "Completed",
}


def today() -> date:
    return datetime.now(UTC).date()


def compute_progress(done: int, total: int) -> int:
    return round(done * 100 / total) if total else 0


def compute_health(progress: int, due_date: date | None, on: date) -> ProjectHealth:
    if progress >= 100:
        return ProjectHealth.COMPLETED
    if due_date is not None and due_date < on:
        return ProjectHealth.OVERDUE
    if (
        due_date is not None
        and (due_date - on).days <= AT_RISK_WINDOW_DAYS
        and progress < AT_RISK_MAX_PROGRESS
    ):
        return ProjectHealth.AT_RISK
    return ProjectHealth.ON_TRACK


def _task_counts(db: Session, project_ids: list[int]) -> dict[int, tuple[int, int]]:
    if not project_ids:
        return {}
    rows = db.execute(
        select(
            Task.project_id,
            func.count(Task.id),
            func.count(Task.id).filter(Task.status == TaskStatus.DONE),
        )
        .where(Task.project_id.in_(project_ids))
        .group_by(Task.project_id)
    ).all()
    return {project_id: (total, done) for project_id, total, done in rows}


def _members(db: Session, project_ids: list[int]) -> dict[int, list[User]]:
    members: dict[int, list[User]] = {project_id: [] for project_id in project_ids}
    if not project_ids:
        return members
    rows = db.scalars(
        select(ProjectMember)
        .where(ProjectMember.project_id.in_(project_ids))
        # Owner first (enum order: owner < member), then by join date.
        .order_by(
            ProjectMember.project_id,
            ProjectMember.role_in_project,
            ProjectMember.joined_at,
            ProjectMember.user_id,
        )
    ).all()
    for row in rows:
        members[row.project_id].append(row.user)
    return members


def to_out(db: Session, projects: list[Project]) -> list[ProjectOut]:
    ids = [project.id for project in projects]
    counts = _task_counts(db, ids)
    members = _members(db, ids)
    on = today()
    result = []
    for project in projects:
        total, done = counts.get(project.id, (0, 0))
        progress = compute_progress(done, total)
        result.append(
            ProjectOut(
                id=project.id,
                key=project.key,
                name=project.name,
                description=project.description,
                color=project.color,
                owner=UserBrief.model_validate(project.owner),
                members=[UserBrief.model_validate(user) for user in members[project.id]],
                members_count=len(members[project.id]),
                tasks_total=total,
                tasks_done=done,
                progress=progress,
                due_date=project.due_date,
                health=compute_health(progress, project.due_date, on),
                archived=project.archived,
                created_at=project.created_at,
            )
        )
    return result


def _all_projects(
    db: Session, search: str | None = None, owner_id: int | None = None
) -> list[Project]:
    query = select(Project)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Project.name.ilike(pattern), Project.key.ilike(pattern)))
    if owner_id is not None:
        query = query.where(Project.owner_id == owner_id)
    return list(db.scalars(query.order_by(Project.id)).all())


def summarize(projects: list[ProjectOut]) -> ProjectSummary:
    active = [project for project in projects if not project.archived]
    return ProjectSummary(
        active=len(active),
        on_track=sum(project.health == ProjectHealth.ON_TRACK for project in active),
        at_risk=sum(project.health == ProjectHealth.AT_RISK for project in active),
        overdue=sum(project.health == ProjectHealth.OVERDUE for project in active),
        archived=len(projects) - len(active),
        all=len(projects),
    )


def list_projects(
    db: Session,
    *,
    scope: ProjectScope = ProjectScope.ACTIVE,
    search: str | None = None,
    owner_id: int | None = None,
    health: ProjectHealth | None = None,
    page: int = 1,
    page_size: int = 10,
) -> ProjectPage:
    # Health is derived from task progress and dates, so filtering happens after
    # computing it. The summary cards always describe the whole workspace.
    summary = summarize(to_out(db, _all_projects(db)))

    projects = to_out(db, _all_projects(db, search, owner_id))
    if scope == ProjectScope.ACTIVE:
        projects = [project for project in projects if not project.archived]
    elif scope == ProjectScope.ARCHIVED:
        projects = [project for project in projects if project.archived]
    if health is not None:
        projects = [project for project in projects if project.health == health]

    start = (page - 1) * page_size
    return ProjectPage(
        items=projects[start : start + page_size],
        total=len(projects),
        page=page,
        page_size=page_size,
        summary=summary,
    )


def _get_project(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise AppError(404, "project_not_found", "Project not found.")
    return project


def _log(db: Session, actor: User, action: str, project: Project, ip: str | None) -> None:
    activity_service.log(
        db, actor.id, action, "project", project.id,
        {"label": project.name, "key": project.key}, ip,
    )


def create_project(db: Session, actor: User, data: ProjectCreate, ip: str | None) -> ProjectOut:
    if db.scalar(select(Project.id).where(Project.key == data.key)) is not None:
        raise AppError(409, "project_key_taken", "A project with this key already exists.")
    owner = db.get(User, data.owner_id)
    if owner is None or owner.status != UserStatus.ACTIVE:
        raise AppError(400, "invalid_owner", "The owner must be an active user.")

    project = Project(
        key=data.key,
        name=data.name,
        description=data.description,
        color=data.color,
        owner_id=owner.id,
        due_date=data.due_date,
    )
    db.add(project)
    db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=owner.id, role_in_project=ProjectRole.OWNER))
    _log(db, actor, "project.created", project, ip)
    notification_service.notify(db, [owner.id], "project.owner_assigned", actor=actor, project=project)
    db.commit()
    db.refresh(project)
    return to_out(db, [project])[0]


def set_archived(
    db: Session, actor: User, project_id: int, archived: bool, ip: str | None
) -> ProjectOut:
    project = _get_project(db, project_id)
    if project.archived == archived:
        state = "archived" if archived else "active"
        raise AppError(400, "invalid_state", f"This project is already {state}.")
    project.archived = archived
    _log(db, actor, "project.archived" if archived else "project.unarchived", project, ip)
    notification_service.notify(
        db, sorted(member_ids(db, project.id) | {project.owner_id}),
        "project.archived" if archived else "project.unarchived", actor=actor, project=project,
    )
    db.commit()
    db.refresh(project)
    return to_out(db, [project])[0]


def delete_project(db: Session, actor: User, project_id: int, ip: str | None) -> None:
    project = _get_project(db, project_id)
    storage_keys = list(
        db.scalars(select(ProjectFile.storage_key).where(ProjectFile.project_id == project.id))
    )
    _log(db, actor, "project.deleted", project, ip)
    # Members, tasks and file rows are removed by ON DELETE CASCADE.
    db.delete(project)
    db.commit()
    storage.delete(storage_keys)


# --- member workspace ------------------------------------------------------------


def member_ids(db: Session, project_id: int) -> set[int]:
    return set(db.scalars(select(ProjectMember.user_id).where(ProjectMember.project_id == project_id)))


def _my_role(user: User, project: Project) -> ProjectRole:
    return ProjectRole.OWNER if permissions.is_project_owner(user, project) else ProjectRole.MEMBER


def my_projects(db: Session, user: User, limit: int | None = None) -> list[MyProjectOut]:
    """Active projects the user belongs to, most recent first."""
    query = (
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id, Project.archived.is_(False))
        .order_by(Project.created_at.desc(), Project.id.desc())
    )
    if limit is not None:
        query = query.limit(limit)
    projects = list(db.scalars(query).unique())
    counts = _task_counts(db, [project.id for project in projects])
    on = today()
    result = []
    for project in projects:
        total, done = counts.get(project.id, (0, 0))
        progress = compute_progress(done, total)
        result.append(
            MyProjectOut(
                id=project.id,
                key=project.key,
                name=project.name,
                color=project.color,
                my_role=_my_role(user, project),
                progress=progress,
                done=done,
                total=total,
                due_date=project.due_date,
                health=compute_health(progress, project.due_date, on),
            )
        )
    return result


def workspace_activity(
    db: Session,
    user: User,
    *,
    project_id: int | None = None,
    mine: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> WorkspaceActivityPage:
    """Activity of the user's active projects; 404 for a project they don't belong to."""
    projects = [
        ActivityProject(id=project.id, key=project.key, name=project.name, color=project.color)
        for project in my_projects(db, user)
    ]
    if project_id is not None:
        projects = [project for project in projects if project.id == project_id]
        if not projects:
            raise AppError(404, "project_not_found", "Project not found")
    return activity_service.workspace_activity(
        db, projects, actor_id=user.id if mine else None, page=page, page_size=page_size
    )


def project_detail(db: Session, user: User, project: Project) -> ProjectDetail:
    total, done = _task_counts(db, [project.id]).get(project.id, (0, 0))
    progress = compute_progress(done, total)
    return ProjectDetail(
        id=project.id,
        key=project.key,
        name=project.name,
        description=project.description,
        color=project.color,
        owner=UserBrief.model_validate(project.owner),
        due_date=project.due_date,
        health=compute_health(progress, project.due_date, today()),
        progress=progress,
        tasks_done=done,
        tasks_count=total,
        members_count=len(member_ids(db, project.id) | {project.owner_id}),
        files_count=db.scalar(
            select(func.count(ProjectFile.id)).where(ProjectFile.project_id == project.id)
        ) or 0,
        my_role=_my_role(user, project),
        archived=project.archived,
        created_at=project.created_at,
    )


def _assigned_counts(db: Session, project_id: int) -> dict[int, tuple[int, int]]:
    """{assignee_id: (open, done)} for one project."""
    rows = db.execute(
        select(
            Task.assignee_id,
            func.count(Task.id).filter(Task.status != TaskStatus.DONE),
            func.count(Task.id).filter(Task.status == TaskStatus.DONE),
        )
        .where(Task.project_id == project_id, Task.assignee_id.is_not(None))
        .group_by(Task.assignee_id)
    ).all()
    return {assignee_id: (open_count, done_count) for assignee_id, open_count, done_count in rows}


def project_members(db: Session, user: User, project: Project) -> list[ProjectMemberOut]:
    """Owner first, then the current user, then everyone else by name."""
    rows = db.scalars(select(ProjectMember).where(ProjectMember.project_id == project.id)).all()
    counts = _assigned_counts(db, project.id)

    def rank(row: ProjectMember) -> tuple[int, str]:
        if row.user_id == project.owner_id:
            return (0, "")
        if row.user_id == user.id:
            return (1, "")
        return (2, row.user.full_name.lower())

    result = []
    for row in sorted(rows, key=rank):
        open_tasks, done_tasks = counts.get(row.user_id, (0, 0))
        result.append(
            ProjectMemberOut(
                user=UserBrief.model_validate(row.user),
                email=row.user.email,
                job_title=row.user.job_title,
                role_in_project=(
                    ProjectRole.OWNER if row.user_id == project.owner_id else ProjectRole.MEMBER
                ),
                is_self=row.user_id == user.id,
                joined_at=row.joined_at,
                open_tasks=open_tasks,
                done_tasks=done_tasks,
                can_remove=permissions.can_remove_member(user, project, row.user_id),
            )
        )
    return result


def _require_member_manager(user: User, project: Project) -> None:
    if not permissions.can_manage_members(user, project):
        raise AppError(
            403, "members_manage_forbidden", "Only the project owner can manage members."
        )


def member_candidates(db: Session, user: User, project: Project) -> list[MemberCandidate]:
    """Active users who are not in the project yet, by name."""
    _require_member_manager(user, project)
    current = member_ids(db, project.id) | {project.owner_id}
    users = db.scalars(
        select(User)
        .where(User.status == UserStatus.ACTIVE, User.id.not_in(current))
        .order_by(User.first_name, User.last_name, User.id)
    ).all()
    return [MemberCandidate.model_validate(candidate) for candidate in users]


def _log_membership(
    db: Session, actor: User, action: str, project: Project, member: User, ip: str | None
) -> None:
    activity_service.log(
        db, actor.id, action, "project", project.id,
        {"label": project.name, "key": project.key, "member_id": member.id,
         "member": member.full_name},
        ip,
    )


def add_member(
    db: Session, user: User, project: Project, member_id: int, ip: str | None
) -> list[ProjectMemberOut]:
    _require_member_manager(user, project)
    members = member_ids(db, project.id)
    candidate = db.get(User, member_id)
    if candidate is not None and permissions.is_project_member(candidate, project, members):
        raise AppError(409, "already_member", "This user is already a member of the project.")
    if candidate is None or not permissions.can_add_member(user, project, candidate, members):
        raise AppError(
            400,
            "invalid_member",
            "Choose an active user.",
            errors=[{"field": "user_id", "message": "Choose an active user."}],
        )

    db.add(ProjectMember(project_id=project.id, user_id=candidate.id))
    _log_membership(db, user, "project.member_added", project, candidate, ip)
    notification_service.notify(db, [candidate.id], "project.member_added", actor=user, project=project)
    db.commit()
    return project_members(db, user, project)


def remove_member(db: Session, user: User, project: Project, member_id: int, ip: str | None) -> None:
    _require_member_manager(user, project)
    if not permissions.can_remove_member(user, project, member_id):
        raise AppError(400, "cannot_remove_owner", "The project owner can’t be removed.")
    membership = db.get(ProjectMember, (project.id, member_id))
    if membership is None:
        raise AppError(404, "member_not_found", "Member not found.")

    # Their open tasks go back to the pool; completed work keeps its history.
    for task in db.scalars(
        select(Task).where(
            Task.project_id == project.id,
            Task.assignee_id == member_id,
            Task.status != TaskStatus.DONE,
        )
    ):
        task.assignee_id = None
    _log_membership(db, user, "project.member_removed", project, membership.user, ip)
    notification_service.notify(db, [member_id], "project.member_removed", actor=user, project=project)
    db.delete(membership)
    db.commit()


def project_permissions(db: Session, user: User, project: Project) -> list[PermissionOut]:
    return [
        PermissionOut(key=item.key, label=item.label, allowed=item.allowed)
        for item in permissions.project_permissions(user, project, member_ids(db, project.id))
    ]


def get_project_for_member(db: Session, user: User, project_id: int) -> Project:
    """404 when the project does not exist or the user is not a member (no information leak)."""
    project = db.get(Project, project_id)
    if project is None or not permissions.can_view_project(user, project, member_ids(db, project.id)):
        raise AppError(404, "project_not_found", "Project not found")
    return project


def export_csv(db: Session) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["Key", "Project", "Owner", "Members", "Progress (%)", "Tasks done", "Tasks total",
         "Due date", "Health", "Archived"]
    )
    for project in to_out(db, _all_projects(db)):
        writer.writerow([
            project.key,
            project.name,
            project.owner.full_name,
            project.members_count,
            project.progress,
            project.tasks_done,
            project.tasks_total,
            project.due_date.isoformat() if project.due_date else "",
            HEALTH_LABELS[project.health],
            "yes" if project.archived else "no",
        ])
    return buffer.getvalue()


def export_pdf(db: Session) -> bytes:
    """Same projects as the CSV export (all of them, archived included)."""
    projects = to_out(db, _all_projects(db))
    summary = summarize(projects)
    rows = [
        [
            project.key,
            project.name,
            project.owner.full_name,
            project.members_count,
            f"{project.progress}%",
            f"{project.tasks_done} / {project.tasks_total}",
            project.due_date.strftime("%b %d, %Y") if project.due_date else "—",
            HEALTH_LABELS[project.health],
            "Archived" if project.archived else "Active",
        ]
        for project in projects
    ]
    return pdf.build_pdf(
        "All projects",
        [
            pdf.PdfTable(
                headers=["Key", "Project", "Owner", "Members", "Progress", "Tasks done", "Due date",
                         "Health", "Status"],
                rows=rows,
                widths=[0.6, 2.4, 1.7, 0.8, 0.8, 0.9, 1.1, 0.9, 0.8],
                numeric=frozenset({3, 4, 5}),
                empty_message="No projects yet.",
            )
        ],
        details=[
            ("Projects", f"{summary.all} ({summary.active} active, {summary.archived} archived)"),
            ("Health of active projects",
             f"{summary.on_track} on track, {summary.at_risk} at risk, {summary.overdue} overdue"),
        ],
    )
