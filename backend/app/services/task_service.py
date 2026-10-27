import re
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Select, and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.core import permissions
from app.core.exceptions import AppError
from app.models.comment import Comment
from app.models.project import Project
from app.models.subtask import Subtask
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User
from app.schemas.stats import (
    Dashboard,
    DashboardFocus,
    DashboardHero,
    DashboardStats,
    FocusCounts,
    WeekDay,
)
from app.schemas.project import ProjectScope
from app.schemas.task import (
    AdminTaskOut,
    AdminTaskPage,
    AdminTaskProject,
    AdminTaskStatus,
    DueFilter,
    TaskCreate,
    TaskOut,
    TaskProject,
    TaskSort,
    TaskSummary,
)
from app.schemas.user import MeCounts, UserBrief
from app.services import activity_service, notification_service, project_service

WEEKLY_TARGET = 10
UPCOMING_DAYS = 7
MY_PROJECTS_ON_HOME = 3

STATUS_LABELS = {
    TaskStatus.TODO: "To do",
    TaskStatus.IN_PROGRESS: "In progress",
    TaskStatus.DONE: "Done",
}


def _now() -> datetime:
    return datetime.now(UTC)


def _week_bounds(on: date) -> tuple[date, date]:
    monday = on - timedelta(days=on.weekday())
    return monday, monday + timedelta(days=6)


def task_key(project: Project, task: Task) -> str:
    return f"{project.key}-{task.id}"


def _is_open(task: Task) -> bool:
    return task.status != TaskStatus.DONE


def _is_overdue(task: Task, on: date) -> bool:
    return _is_open(task) and task.due_date is not None and task.due_date < on


def _due_sort_key(task: Task) -> tuple[bool, date, int]:
    return (task.due_date is None, task.due_date or date.max, task.id)


# --- serialization ---------------------------------------------------------------


def serialize(db: Session, user: User, tasks: list[Task]) -> list[TaskOut]:
    if not tasks:
        return []
    task_ids = [task.id for task in tasks]
    projects = {
        project.id: project
        for project in db.scalars(select(Project).where(Project.id.in_({t.project_id for t in tasks})))
    }
    assignee_ids = {task.assignee_id for task in tasks if task.assignee_id}
    assignees = (
        {u.id: u for u in db.scalars(select(User).where(User.id.in_(assignee_ids)))}
        if assignee_ids
        else {}
    )
    subtasks = {
        task_id: (total, done)
        for task_id, total, done in db.execute(
            select(
                Subtask.task_id,
                func.count(Subtask.id),
                func.count(Subtask.id).filter(Subtask.is_done.is_(True)),
            )
            .where(Subtask.task_id.in_(task_ids))
            .group_by(Subtask.task_id)
        )
    }
    comments = dict(
        db.execute(
            select(Comment.task_id, func.count(Comment.id))
            .where(Comment.task_id.in_(task_ids))
            .group_by(Comment.task_id)
        ).all()
    )

    result = []
    for task in tasks:
        project = projects[task.project_id]
        assignee = assignees.get(task.assignee_id) if task.assignee_id else None
        subtasks_total, subtasks_done = subtasks.get(task.id, (0, 0))
        result.append(
            TaskOut(
                id=task.id,
                key=task_key(project, task),
                title=task.title,
                description=task.description,
                status=task.status,
                priority=task.priority,
                due_date=task.due_date,
                completed_at=task.completed_at,
                created_at=task.created_at,
                project=TaskProject(id=project.id, key=project.key, name=project.name, color=project.color),
                assignee=UserBrief.model_validate(assignee) if assignee else None,
                creator_id=task.creator_id,
                subtasks_done=subtasks_done,
                subtasks_total=subtasks_total,
                comments_count=comments.get(task.id, 0),
                can_change_status=permissions.can_change_task_status(user, task, project),
            )
        )
    return result


# --- queries ---------------------------------------------------------------------


def _mine(user: User) -> Select:
    """Tasks the user is assigned to or created, in active projects."""
    return (
        select(Task)
        .join(Project, Project.id == Task.project_id)
        .where(
            Project.archived.is_(False),
            or_(Task.assignee_id == user.id, Task.creator_id == user.id),
        )
    )


def my_tasks(
    db: Session,
    user: User,
    *,
    search: str | None = None,
    project_id: int | None = None,
    priority: TaskPriority | None = None,
    due: DueFilter = DueFilter.ANY,
    due_from: date | None = None,
    due_to: date | None = None,
) -> list[TaskOut]:
    if due_from is not None and due_to is not None and due_from > due_to:
        raise AppError(
            400,
            "invalid_date_range",
            "The start date must be before the end date.",
            errors=[{"field": "due_from", "message": "The start date must be before the end date."}],
        )
    on = _now().date()
    query = _mine(user)
    # Calendar range: tasks without a due date are left out.
    if due_from is not None:
        query = query.where(Task.due_date >= due_from)
    if due_to is not None:
        query = query.where(Task.due_date <= due_to)
    if search:
        query = query.where(Task.title.ilike(f"%{search.strip()}%"))
    if project_id is not None:
        query = query.where(Task.project_id == project_id)
    if priority is not None:
        query = query.where(Task.priority == priority)
    if due == DueFilter.TODAY:
        query = query.where(Task.due_date == on)
    elif due == DueFilter.WEEK:
        query = query.where(Task.due_date >= on, Task.due_date <= _week_bounds(on)[1])
    elif due == DueFilter.OVERDUE:
        query = query.where(Task.status != TaskStatus.DONE, Task.due_date < on)
    tasks = sorted(db.scalars(query).all(), key=_due_sort_key)
    return serialize(db, user, tasks)


def project_tasks(db: Session, user: User, project: Project) -> list[TaskOut]:
    tasks = db.scalars(select(Task).where(Task.project_id == project.id)).all()
    return serialize(db, user, sorted(tasks, key=_due_sort_key))


def my_counts(db: Session, user: User) -> MeCounts:
    open_tasks = db.scalar(
        select(func.count()).select_from(
            _mine(user).where(Task.status != TaskStatus.DONE).subquery()
        )
    )
    return MeCounts(open_tasks=open_tasks or 0, projects=len(project_service.my_projects(db, user)))


# --- commands --------------------------------------------------------------------


def get_task_for_member(db: Session, user: User, task_id: int) -> tuple[Task, Project]:
    task = db.get(Task, task_id)
    if task is None:
        raise AppError(404, "task_not_found", "Task not found")
    try:
        project = project_service.get_project_for_member(db, user, task.project_id)
    except AppError:
        raise AppError(404, "task_not_found", "Task not found") from None
    return task, project


def create_task(db: Session, user: User, data: TaskCreate, ip: str | None) -> TaskOut:
    project = project_service.get_project_for_member(db, user, data.project_id)
    members = project_service.member_ids(db, project.id)
    if not permissions.can_create_task(user, project, members):
        raise AppError(403, "task_create_forbidden", "Only project members can create tasks.")

    assignee_id = data.assignee_id if data.assignee_id is not None else user.id
    if not permissions.can_assign(project, assignee_id, members):
        raise AppError(
            400,
            "invalid_assignee",
            "Assignee must be a project member",
            errors=[{"field": "assignee_id", "message": "Assignee must be a project member"}],
        )

    task = Task(
        project_id=project.id,
        title=data.title,
        description=data.description,
        status=data.status,
        priority=data.priority,
        assignee_id=assignee_id,
        creator_id=user.id,
        due_date=data.due_date,
        completed_at=_now() if data.status == TaskStatus.DONE else None,
    )
    db.add(task)
    db.flush()
    activity_service.log(
        db, user.id, "task.created", "task", task.id,
        {"label": task.title, "task_key": task_key(project, task), "project_id": project.id,
         "project": project.name},
        ip,
    )
    notification_service.notify(
        db, [assignee_id], "task.assigned", actor=user, project=project,
        data={"title": task.title, "task_id": task.id},
    )
    db.commit()
    db.refresh(task)
    return serialize(db, user, [task])[0]


def change_status(
    db: Session, user: User, task_id: int, status: TaskStatus, ip: str | None
) -> TaskOut:
    task, project = get_task_for_member(db, user, task_id)
    if not permissions.can_change_task_status(user, task, project):
        raise AppError(
            403,
            "status_change_forbidden",
            "Only the assignee or the project owner can change the status.",
        )
    if task.status != status:
        previous = task.status
        task.status = status
        task.completed_at = _now() if status == TaskStatus.DONE else None
        activity_service.log(
            db, user.id, "task.status_changed", "task", task.id,
            {"label": task.title, "task_key": task_key(project, task), "project_id": project.id,
             "from": previous.value, "to": status.value},
            ip,
        )
        # Whoever the task concerns: its assignee and its creator.
        notification_service.notify(
            db, [task.assignee_id, task.creator_id], "task.status_changed", actor=user, project=project,
            data={"title": task.title, "task_id": task.id, "from": previous.value, "to": status.value},
        )
        db.commit()
        db.refresh(task)
    return serialize(db, user, [task])[0]


# --- admin console (read-only) --------------------------------------------------------

TASK_KEY_PATTERN = re.compile(r"^([A-Za-z]{3})-(\d+)$")
PRIORITY_RANK = case(
    (Task.priority == TaskPriority.HIGH, 0), (Task.priority == TaskPriority.MEDIUM, 1), else_=2
)


def _in_scope(query: Select, scope: ProjectScope) -> Select:
    if scope == ProjectScope.ACTIVE:
        return query.where(Project.archived.is_(False))
    if scope == ProjectScope.ARCHIVED:
        return query.where(Project.archived.is_(True))
    return query


def _overdue_clause(on: date):
    return and_(Task.status != TaskStatus.DONE, Task.due_date.is_not(None), Task.due_date < on)


def task_summary(db: Session, scope: ProjectScope) -> TaskSummary:
    on = _now().date()
    query = _in_scope(select(Task.id).join(Project, Project.id == Task.project_id), scope).subquery()
    row = db.execute(
        select(
            func.count(Task.id),
            func.count(Task.id).filter(Task.status == TaskStatus.TODO),
            func.count(Task.id).filter(Task.status == TaskStatus.IN_PROGRESS),
            func.count(Task.id).filter(Task.status == TaskStatus.DONE),
            func.count(Task.id).filter(_overdue_clause(on)),
            func.count(Task.id).filter(Task.assignee_id.is_(None)),
        ).where(Task.id.in_(select(query.c.id)))
    ).one()
    return TaskSummary(
        total=row[0], todo=row[1], in_progress=row[2], done=row[3], overdue=row[4], unassigned=row[5]
    )


def admin_tasks(
    db: Session,
    *,
    scope: ProjectScope = ProjectScope.ACTIVE,
    search: str | None = None,
    project_id: int | None = None,
    assignee_id: int | None = None,
    unassigned: bool = False,
    status: AdminTaskStatus | None = None,
    priority: TaskPriority | None = None,
    due: DueFilter = DueFilter.ANY,
    sort: TaskSort = TaskSort.DUE,
    page: int = 1,
    page_size: int = 10,
) -> AdminTaskPage:
    """Every task of the workspace, for the admin console. Nothing here modifies data."""
    on = _now().date()
    query = _in_scope(select(Task).join(Project, Project.id == Task.project_id), scope)

    if search and (term := search.strip()):
        key = TASK_KEY_PATTERN.fullmatch(term)
        if key:  # "WEB-42": the task with that key
            query = query.where(Project.key == key.group(1).upper(), Task.id == int(key.group(2)))
        else:
            query = query.where(Task.title.ilike(f"%{term}%"))
    if project_id is not None:
        query = query.where(Task.project_id == project_id)
    if unassigned:
        query = query.where(Task.assignee_id.is_(None))
    elif assignee_id is not None:
        query = query.where(Task.assignee_id == assignee_id)
    if status == AdminTaskStatus.OVERDUE:
        query = query.where(_overdue_clause(on))
    elif status is not None:
        query = query.where(Task.status == TaskStatus(status.value))
    if priority is not None:
        query = query.where(Task.priority == priority)
    if due == DueFilter.TODAY:
        query = query.where(Task.due_date == on)
    elif due == DueFilter.WEEK:
        query = query.where(Task.due_date >= on, Task.due_date <= _week_bounds(on)[1])
    elif due == DueFilter.OVERDUE:
        query = query.where(_overdue_clause(on))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    order = {
        TaskSort.DUE: (Task.due_date.asc().nulls_last(), Task.id),
        TaskSort.RECENT: (Task.created_at.desc(), Task.id.desc()),
        TaskSort.PRIORITY: (PRIORITY_RANK, Task.due_date.asc().nulls_last(), Task.id),
    }[sort]
    tasks = list(db.scalars(query.order_by(*order).offset((page - 1) * page_size).limit(page_size)))

    return AdminTaskPage(
        items=_admin_serialize(db, tasks, on),
        total=total,
        page=page,
        page_size=page_size,
        summary=task_summary(db, scope),
    )


def _admin_serialize(db: Session, tasks: list[Task], on: date) -> list[AdminTaskOut]:
    if not tasks:
        return []
    task_ids = [task.id for task in tasks]
    projects = {
        project.id: project
        for project in db.scalars(select(Project).where(Project.id.in_({t.project_id for t in tasks})))
    }
    user_ids = {uid for task in tasks for uid in (task.assignee_id, task.creator_id) if uid}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids)))} if user_ids else {}
    subtasks = {
        task_id: (total, done)
        for task_id, total, done in db.execute(
            select(
                Subtask.task_id,
                func.count(Subtask.id),
                func.count(Subtask.id).filter(Subtask.is_done.is_(True)),
            )
            .where(Subtask.task_id.in_(task_ids))
            .group_by(Subtask.task_id)
        )
    }
    comments = dict(
        db.execute(
            select(Comment.task_id, func.count(Comment.id))
            .where(Comment.task_id.in_(task_ids))
            .group_by(Comment.task_id)
        ).all()
    )

    def brief(user_id: int | None) -> UserBrief | None:
        user = users.get(user_id) if user_id else None
        return UserBrief.model_validate(user) if user else None

    result = []
    for task in tasks:
        project = projects[task.project_id]
        subtasks_total, subtasks_done = subtasks.get(task.id, (0, 0))
        result.append(
            AdminTaskOut(
                id=task.id,
                key=task_key(project, task),
                title=task.title,
                status=task.status,
                priority=task.priority,
                due_date=task.due_date,
                completed_at=task.completed_at,
                created_at=task.created_at,
                overdue=_is_overdue(task, on),
                project=AdminTaskProject(
                    id=project.id, key=project.key, name=project.name, color=project.color,
                    archived=project.archived,
                ),
                assignee=brief(task.assignee_id),
                creator=brief(task.creator_id),
                subtasks_done=subtasks_done,
                subtasks_total=subtasks_total,
                comments_count=comments.get(task.id, 0),
            )
        )
    return result


# --- Home dashboard ----------------------------------------------------------------


def _month_start(on: date) -> date:
    return on.replace(day=1)


def dashboard(db: Session, user: User) -> Dashboard:
    now = _now()
    on = now.date()
    monday, sunday = _week_bounds(on)
    week_start = datetime.combine(monday, datetime.min.time(), tzinfo=UTC)
    month_start = _month_start(on)
    prev_month_start = _month_start(month_start - timedelta(days=1))

    # "Assigned to me": tasks where I am the assignee, in active projects.
    assigned = list(
        db.scalars(
            select(Task)
            .join(Project, Project.id == Task.project_id)
            .where(Project.archived.is_(False), Task.assignee_id == user.id)
        )
    )
    open_tasks = [task for task in assigned if _is_open(task)]
    overdue = sorted((task for task in open_tasks if _is_overdue(task, on)), key=_due_sort_key)
    due_this_week = [t for t in open_tasks if t.due_date is not None and on <= t.due_date <= sunday]
    upcoming = sorted(
        (t for t in open_tasks
         if t.due_date is not None and on < t.due_date <= on + timedelta(days=UPCOMING_DAYS)),
        key=_due_sort_key,
    )
    today = sorted(
        (
            task for task in assigned
            if task.due_date == on
            or task.status == TaskStatus.IN_PROGRESS
            or (task.completed_at is not None and task.completed_at.date() == on)
        ),
        key=_due_sort_key,
    )

    def completed_between(start: date, end: date | None) -> int:
        return sum(
            task.completed_at is not None
            and start <= task.completed_at.date()
            and (end is None or task.completed_at.date() < end)
            for task in assigned
        )

    upcoming_deadlines = sorted(
        (t for t in open_tasks if t.due_date is not None and t.due_date >= on), key=_due_sort_key
    )
    next_deadline = upcoming_deadlines[0] if upcoming_deadlines else None
    due_days = {task.due_date for task in open_tasks if task.due_date is not None}

    # Serialize every task shown on Home in one batch.
    shown = {task.id: task for task in [*today, *upcoming, *overdue]}
    if next_deadline is not None:
        shown[next_deadline.id] = next_deadline
    serialized = {item.id: item for item in serialize(db, user, list(shown.values()))}

    return Dashboard(
        hero=DashboardHero(
            due_this_week=len(due_this_week),
            overdue=len(overdue),
            weekly_done=sum(t.completed_at is not None and t.completed_at >= week_start for t in assigned),
            weekly_target=WEEKLY_TARGET,
        ),
        stats=DashboardStats(
            assigned_open=len(open_tasks),
            high_priority=sum(task.priority == TaskPriority.HIGH for task in open_tasks),
            due_this_week=len(due_this_week),
            overdue=len(overdue),
            completed_this_month=completed_between(month_start, None),
            completed_prev_month=completed_between(prev_month_start, month_start),
            prev_month_label=prev_month_start.strftime("%b"),
        ),
        focus=DashboardFocus(
            today=[serialized[task.id] for task in today],
            upcoming=[serialized[task.id] for task in upcoming],
            overdue=[serialized[task.id] for task in overdue],
            counts=FocusCounts(today=len(today), upcoming=len(upcoming), overdue=len(overdue)),
        ),
        my_projects=project_service.my_projects(db, user, limit=MY_PROJECTS_ON_HOME),
        week=[
            WeekDay(date=day, has_due=day in due_days)
            for day in (monday + timedelta(days=offset) for offset in range(7))
        ],
        next_deadline=serialized[next_deadline.id] if next_deadline else None,
    )
