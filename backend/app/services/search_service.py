"""Top bar search ("Search projects, tasks, people…").

Admins search the whole workspace and land on the admin pages; members only
find their own active projects, the tasks of those projects and the people
they work with, and land on their workspace pages.
"""

from urllib.parse import quote

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task
from app.models.user import User, UserRole
from app.schemas.search import SearchGroup, SearchItem, SearchKind, SearchResults
from app.services import project_service
from app.services.task_service import TASK_KEY_PATTERN, task_key

MIN_QUERY_LENGTH = 2
LIMIT = 5

STATUS_LABELS = {"todo": "To do", "in_progress": "In progress", "done": "Done"}
ROLE_LABELS = {UserRole.ADMIN: "Admin", UserRole.USER: "Member"}


def _task_filter(term: str, pattern: str):
    key = TASK_KEY_PATTERN.fullmatch(term)
    if key:  # "WEB-42"
        return (Project.key == key.group(1).upper()) & (Task.id == int(key.group(2)))
    return Task.title.ilike(pattern)


def _task_items(db: Session, query, link) -> list[SearchItem]:
    rows = db.execute(query.order_by(Task.due_date.asc().nulls_last(), Task.id).limit(LIMIT)).all()
    return [
        SearchItem(
            id=task.id,
            title=task.title,
            subtitle=f"{task_key(project, task)} · {project.name} · {STATUS_LABELS[task.status.value]}",
            link=link(project, task),
            color=project.color,
        )
        for task, project in rows
    ]


def _admin(db: Session, term: str, pattern: str) -> list[SearchGroup]:
    users = db.scalars(
        select(User)
        .where(or_(func.concat(User.first_name, " ", User.last_name).ilike(pattern), User.email.ilike(pattern)))
        .order_by(User.first_name, User.last_name, User.id)
        .limit(LIMIT)
    ).all()
    projects = db.scalars(
        select(Project)
        .where(or_(Project.name.ilike(pattern), Project.key.ilike(pattern)))
        .order_by(Project.archived, Project.name)
        .limit(LIMIT)
    ).all()
    tasks = _task_items(
        db,
        select(Task, Project).join(Project, Project.id == Task.project_id).where(_task_filter(term, pattern)),
        lambda project, task: f"/admin/tasks?scope=all&search={quote(task_key(project, task))}",
    )
    return [
        SearchGroup(kind=SearchKind.PROJECTS, items=[
            SearchItem(
                id=project.id, title=project.name,
                subtitle=f"{project.key} · Owned by {project.owner.full_name}" + (" · Archived" if project.archived else ""),
                link=f"/admin/projects?scope=all&search={quote(project.key)}", color=project.color,
            )
            for project in projects
        ]),
        SearchGroup(kind=SearchKind.TASKS, items=tasks),
        SearchGroup(kind=SearchKind.PEOPLE, items=[
            SearchItem(
                id=user.id, title=user.full_name, subtitle=f"{user.email} · {ROLE_LABELS[user.role]}",
                link=f"/admin/users?search={quote(user.email)}",
            )
            for user in users
        ]),
    ]


def _member(db: Session, user: User, term: str, pattern: str) -> list[SearchGroup]:
    mine = project_service.my_projects(db, user)
    ids = [project.id for project in mine]
    if not ids:
        return []
    needle = term.lower()
    projects = [p for p in mine if needle in p.name.lower() or needle in p.key.lower()][:LIMIT]
    tasks = _task_items(
        db,
        select(Task, Project)
        .join(Project, Project.id == Task.project_id)
        .where(Task.project_id.in_(ids), _task_filter(term, pattern)),
        lambda project, task: f"/app/projects/{project.id}?tab=tasks",
    )
    # People who share at least one active project with the member; opens that project's Members tab.
    shared = db.execute(
        select(User, func.min(ProjectMember.project_id))
        .join(ProjectMember, ProjectMember.user_id == User.id)
        .where(
            ProjectMember.project_id.in_(ids),
            User.id != user.id,
            or_(func.concat(User.first_name, " ", User.last_name).ilike(pattern), User.email.ilike(pattern)),
        )
        .group_by(User.id)
        .order_by(User.first_name, User.last_name)
        .limit(LIMIT)
    ).all()
    names = {project.id: project.name for project in mine}
    return [
        SearchGroup(kind=SearchKind.PROJECTS, items=[
            SearchItem(
                id=project.id, title=project.name,
                subtitle=f"{project.key} · {'Owner' if project.my_role.value == 'owner' else 'Member'} · {project.progress}% done",
                link=f"/app/projects/{project.id}", color=project.color,
            )
            for project in projects
        ]),
        SearchGroup(kind=SearchKind.TASKS, items=tasks),
        SearchGroup(kind=SearchKind.PEOPLE, items=[
            SearchItem(
                id=person.id, title=person.full_name, subtitle=f"{person.email} · {names[project_id]}",
                link=f"/app/projects/{project_id}?tab=members",
            )
            for person, project_id in shared
        ]),
    ]


def search(db: Session, user: User, query: str) -> SearchResults:
    term = query.strip()
    if len(term) < MIN_QUERY_LENGTH:
        return SearchResults(query=term, groups=[])
    pattern = f"%{term.replace('%', r'\%').replace('_', r'\_')}%"
    groups = _admin(db, term, pattern) if user.role == UserRole.ADMIN else _member(db, user, term, pattern)
    return SearchResults(query=term, groups=[group for group in groups if group.items])
