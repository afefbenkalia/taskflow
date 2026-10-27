"""Seed demo data. Idempotent: run with `python -m app.db.seed`.

Dates are relative to "now", so the dashboard always shows recent activity.
"""

import random
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.models.notification import Notification
from app.models.project import Project
from app.models.project_member import ProjectMember, ProjectRole
from app.models.subtask import Subtask
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User, UserRole, UserStatus
from app.services import notification_service

ADMIN, USER = UserRole.ADMIN, UserRole.USER
ACTIVE, PENDING, DEACTIVATED = UserStatus.ACTIVE, UserStatus.PENDING, UserStatus.DEACTIVATED


@dataclass(frozen=True)
class SeedUser:
    first_name: str
    last_name: str
    email: str
    role: UserRole
    status: UserStatus
    password: str
    job_title: str | None = None
    joined_days_ago: int = 120
    # None = never signed in.
    last_active: timedelta | None = None


def _u(first, last, email, role=USER, status=ACTIVE, job=None, joined=120, active=None):
    password = "Admin@1234" if role == ADMIN else "User@1234"
    return SeedUser(first, last, email, role, status, password, job, joined, active)


H, D, M = timedelta(hours=1), timedelta(days=1), timedelta(minutes=1)

SEED_USERS: list[SeedUser] = [
    # Accounts from part 1.
    _u("Afef", "Ben Kalia", "afef@taskflow.io", ADMIN, job="Head of Operations", joined=210, active=M * 0),
    _u("Amira", "Mejri", "amira.m@taskflow.io", ADMIN, job="Engineering Manager", joined=200, active=M * 12),
    _u("Sarah", "Mansour", "sarah.m@taskflow.io", job="Product Designer", joined=160, active=H),
    _u("Karim", "Bouzid", "karim.b@taskflow.io", job="Mobile Lead", joined=150, active=D + 2 * H),
    _u("Nour", "Kefi", "nour.k@company.com", status=PENDING, joined=2),
    _u("Youssef", "Trabelsi", "youssef.t@taskflow.io", status=DEACTIVATED, job="QA Engineer",
       joined=180, active=D * 21),
    # Part 2.
    _u("Leila", "Hamdi", "leila.h@taskflow.io", job="Marketing Lead", joined=20, active=3 * H),
    _u("Mehdi", "Gharbi", "mehdi.g@taskflow.io", ADMIN, job="IT Administrator", joined=5, active=8 * H),
    _u("Rania", "Feki", "rania.f@taskflow.io", status=DEACTIVATED, job="Data Analyst",
       joined=140, active=D * 45),
    _u("Omar", "Jaziri", "omar.j@taskflow.io", job="Data Engineer", joined=130, active=2 * H),
    _u("Ines", "Chaabane", "ines.c@taskflow.io", job="Frontend Developer", joined=110, active=30 * M),
    _u("Hedi", "Ayari", "hedi.a@taskflow.io", job="Backend Developer", joined=100, active=5 * H),
    _u("Salma", "Ben Ali", "salma.b@taskflow.io", job="QA Engineer", joined=95, active=D),
    _u("Walid", "Masmoudi", "walid.m@taskflow.io", job="DevOps Engineer", joined=90, active=2 * D),
    _u("Yasmine", "Dridi", "yasmine.d@taskflow.io", job="Account Manager", joined=85, active=45 * M),
    _u("Fares", "Zouari", "fares.z@taskflow.io", job="Backend Developer", joined=70, active=6 * H),
    _u("Mariem", "Ghanmi", "mariem.g@taskflow.io", job="Content Strategist", joined=60, active=D * 3),
    _u("Anis", "Sassi", "anis.s@taskflow.io", job="Growth Marketer", joined=55, active=4 * H),
    _u("Emna", "Khelifi", "emna.k@taskflow.io", job="Copywriter", joined=40, active=D * 5),
    _u("Bilel", "Hammami", "bilel.h@taskflow.io", job="Cloud Engineer", joined=35, active=90 * M),
    _u("Dorra", "Saidi", "dorra.s@taskflow.io", job="Site Reliability Engineer", joined=28, active=D * 2),
    _u("Skander", "Bouaziz", "skander.b@taskflow.io", job="HR Business Partner", joined=25, active=D * 8),
    _u("Nadia", "Tlili", "nadia.t@taskflow.io", job="People Analyst", joined=14, active=7 * H),
    _u("Amine", "Rekik", "amine.r@taskflow.io", job="Mobile Developer", joined=9, active=20 * M),
]


@dataclass(frozen=True)
class SeedProject:
    key: str
    name: str
    color: str
    owner: str
    due_in_days: int
    progress: float
    tasks: int
    members: list[str] = field(default_factory=list)
    age_days: int = 70
    archived: bool = False
    description: str | None = None


SEED_PROJECTS: list[SeedProject] = [
    SeedProject("WEB", "Website redesign", "#4F46E5", "afef@taskflow.io", 24, 0.68, 28,
                ["sarah.m@taskflow.io", "karim.b@taskflow.io", "amira.m@taskflow.io",
                 "leila.h@taskflow.io", "ines.c@taskflow.io", "hedi.a@taskflow.io"], 75,
                description="New marketing site and design system."),
    SeedProject("MOB", "Mobile app", "#0D9488", "karim.b@taskflow.io", 10, 0.45, 24,
                ["sarah.m@taskflow.io", "amine.r@taskflow.io", "salma.b@taskflow.io",
                 "walid.m@taskflow.io"], 80,
                description="iOS and Android app for field teams."),
    SeedProject("CLP", "Client portal", "#D97706", "amira.m@taskflow.io", -5, 0.80, 20,
                ["sarah.m@taskflow.io", "leila.h@taskflow.io", "yasmine.d@taskflow.io",
                 "fares.z@taskflow.io"], 90,
                description="Self-service portal for client reporting."),
    SeedProject("MKT", "Q4 marketing campaign", "#DB2777", "leila.h@taskflow.io", 40, 0.30, 18,
                ["mariem.g@taskflow.io", "anis.s@taskflow.io", "emna.k@taskflow.io"], 45),
    SeedProject("OPS", "Cloud migration", "#2563EB", "mehdi.g@taskflow.io", 8, 0.55, 16,
                ["bilel.h@taskflow.io", "dorra.s@taskflow.io", "walid.m@taskflow.io"], 60),
    SeedProject("HRD", "HR dashboard", "#16A34A", "sarah.m@taskflow.io", -12, 1.0, 12,
                ["skander.b@taskflow.io", "nadia.t@taskflow.io"], 56),
    SeedProject("DWH", "Data warehouse", "#7C3AED", "omar.j@taskflow.io", 60, 0.25, 16,
                ["ines.c@taskflow.io", "walid.m@taskflow.io", "fares.z@taskflow.io",
                 "hedi.a@taskflow.io"], 6),
    SeedProject("LCR", "Legacy CRM", "#64748B", "amira.m@taskflow.io", -90, 1.0, 4,
                ["karim.b@taskflow.io"], 200, archived=True),
    SeedProject("OFM", "Office move", "#0EA5E9", "mehdi.g@taskflow.io", -60, 1.0, 4,
                ["dorra.s@taskflow.io"], 160, archived=True),
    SeedProject("BRD", "Brand refresh 2025", "#E11D48", "leila.h@taskflow.io", -120, 1.0, 4,
                ["mariem.g@taskflow.io"], 240, archived=True),
]

TASK_VERBS = ["Design", "Implement", "Review", "Test", "Document", "Refine", "Audit", "Ship"]
TASK_OBJECTS = [
    "onboarding flow", "settings page", "API endpoints", "release checklist", "analytics events",
    "access permissions", "error states", "search experience", "data export", "notifications",
    "performance budget", "QA scenarios",
]
GENERATED_TITLES = {f"{verb} {obj}" for verb in TASK_VERBS for obj in TASK_OBJECTS}

# Sarah's workspace (part 3) uses hand-written tasks only, as in the design.
SARAH = "sarah.m@taskflow.io"
KARIM, AMIRA, NADIA = "karim.b@taskflow.io", "amira.m@taskflow.io", "nadia.t@taskflow.io"
# Memberships removed from earlier versions of this seed.
LEFT_PROJECTS = [("MKT", SARAH)]


@dataclass(frozen=True)
class SeedTask:
    project: str
    title: str
    status: TaskStatus
    priority: TaskPriority
    due_in_days: int
    assignee: str = SARAH
    completed_days_ago: float | None = None
    subtasks: tuple[int, int] = (0, 0)  # (total, done)
    comments: int = 0
    description: str | None = None


TODO, DOING, DONE = TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE
LOW, MEDIUM, HIGH = TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH

WORKSPACE_TASKS: list[SeedTask] = [
    SeedTask("WEB", "Homepage mockup", DOING, HIGH, 0, subtasks=(5, 3), comments=4,
             description="Hero, featured categories and footer for desktop and mobile."),
    SeedTask("WEB", "Search filters for catalog", TODO, MEDIUM, 2, subtasks=(4, 1), comments=2,
             description="Facets for price, brand and availability on the catalog page."),
    SeedTask("WEB", "Write product descriptions", TODO, LOW, 5, comments=1,
             description="Short, scannable copy for the 24 launch products."),
    SeedTask("WEB", "Optimize product images", DOING, MEDIUM, -2, subtasks=(3, 2), comments=3,
             description="Convert to WebP and add responsive sizes for every product photo."),
    SeedTask("WEB", "Brand color palette", DONE, LOW, -1, completed_days_ago=0.1, subtasks=(4, 4),
             comments=5, description="Primary, neutral and feedback colors with contrast checks."),
    SeedTask("WEB", "Usability test recap", DONE, MEDIUM, -8, completed_days_ago=10, comments=2),
    SeedTask("WEB", "Checkout flow QA", DOING, HIGH, 3, assignee=KARIM, subtasks=(6, 2), comments=2,
             description="Regression pass on cart, shipping and payment steps."),
    SeedTask("WEB", "API rate limiting", TODO, MEDIUM, 6, assignee=AMIRA, comments=1),
    SeedTask("CLP", "Integrate Stripe payments", DOING, HIGH, 3, subtasks=(6, 2), comments=6,
             description="Card payments and invoices for client subscriptions."),
    SeedTask("MOB", "Prepare sprint demo", TODO, MEDIUM, 1, subtasks=(3, 0),
             description="Slides and a recorded walkthrough of the new onboarding."),
    SeedTask("MOB", "Onboarding screens polish", DONE, MEDIUM, -2, completed_days_ago=2,
             subtasks=(5, 5), comments=3),
    SeedTask("MOB", "Push notification settings", TODO, HIGH, 4, assignee=KARIM, comments=1),
    SeedTask("MOB", "Icon set refresh", DONE, LOW, -30, completed_days_ago=35),
    SeedTask("HRD", "Interview notes — HR flow", DONE, MEDIUM, -3, completed_days_ago=3,
             subtasks=(3, 3), comments=2),
    SeedTask("HRD", "Review HR KPIs dashboard", TODO, HIGH, 6, subtasks=(4, 0), comments=1,
             description="Check headcount, attrition and time-to-hire widgets with HR."),
    SeedTask("HRD", "Export payroll report", DOING, MEDIUM, 9, assignee=NADIA),
]

COMMENT_LINES = [
    "Looks good to me, a couple of small notes inline.",
    "I pushed an update — can you take another look?",
    "Blocked on the final copy, following up today.",
    "Shared this with the team in the weekly sync.",
    "Added screenshots of the edge cases.",
    "Let's ship this once QA signs off.",
]

# (actor, action, target email or project key, extra details, age, ip)
SEED_EVENTS: list[tuple[str, str, str | None, dict, timedelta, str]] = [
    ("afef@taskflow.io", "auth.login", None, {"client": "Chrome · Windows"}, 10 * M, "196.203.12.44"),
    ("amira.m@taskflow.io", "auth.login", None, {"client": "Edge · Windows"}, 20 * M, "196.203.12.51"),
    ("sarah.m@taskflow.io", "auth.login", None, {"client": "Safari · macOS"}, H, "41.226.18.7"),
    ("afef@taskflow.io", "user.role_changed", "amira.m@taskflow.io",
     {"from": "user", "to": "admin"}, 2 * H, "196.203.12.44"),
    ("sarah.m@taskflow.io", "auth.denied", None,
     {"method": "GET", "path": "/api/v1/admin/users"}, 3 * H, "41.226.18.7"),
    ("leila.h@taskflow.io", "auth.login", None, {"client": "Chrome · Android"}, 4 * H, "197.0.45.12"),
    ("karim.b@taskflow.io", "auth.login", None, {"client": "Firefox · Linux"}, 5 * H, "102.157.3.90"),
    ("karim.b@taskflow.io", "auth.denied", None,
     {"method": "GET", "path": "/api/v1/admin/projects"}, 6 * H, "102.157.3.90"),
    ("mehdi.g@taskflow.io", "auth.login", None, {"client": "Chrome · macOS"}, 8 * H, "196.203.12.60"),
    ("afef@taskflow.io", "user.deactivated", "youssef.t@taskflow.io", {}, D, "196.203.12.44"),
    ("afef@taskflow.io", "auth.logout", None, {}, D + 3 * H, "196.203.12.44"),
    ("mehdi.g@taskflow.io", "user.password_reset", "karim.b@taskflow.io", {}, D + 2 * H, "196.203.12.60"),
    ("afef@taskflow.io", "user.updated", "sarah.m@taskflow.io", {"fields": ["job_title"]},
     D + 6 * H, "196.203.12.44"),
    ("amira.m@taskflow.io", "user.approved", "leila.h@taskflow.io", {}, 2 * D, "196.203.12.51"),
    ("nour.k@company.com", "auth.register", "nour.k@company.com", {}, 2 * D + 4 * H, "41.230.77.2"),
    ("mehdi.g@taskflow.io", "user.deactivated", "rania.f@taskflow.io", {}, 3 * D, "196.203.12.60"),
    ("amira.m@taskflow.io", "project.archived", "LCR", {}, 4 * D, "196.203.12.51"),
    ("afef@taskflow.io", "user.activated", "ines.c@taskflow.io", {}, 4 * D + 5 * H, "196.203.12.44"),
    ("afef@taskflow.io", "user.created", "mehdi.g@taskflow.io", {"role": "admin"}, 5 * D, "196.203.12.44"),
    ("amira.m@taskflow.io", "user.role_changed", "omar.j@taskflow.io",
     {"from": "admin", "to": "user"}, 5 * D + 2 * H, "196.203.12.51"),
    ("afef@taskflow.io", "project.created", "DWH", {}, 6 * D, "196.203.12.44"),
]


def _seed_users(db: Session, now: datetime) -> dict[str, User]:
    users: dict[str, User] = {}
    created = 0
    for data in SEED_USERS:
        user = db.scalar(select(User).where(User.email == data.email))
        if user is None:
            user = User(
                first_name=data.first_name,
                last_name=data.last_name,
                email=data.email,
                password_hash=hash_password(data.password),
                role=data.role,
                status=data.status,
                created_at=now - timedelta(days=data.joined_days_ago),
            )
            db.add(user)
            created += 1
        # Complete profile fields without overriding values edited in the app.
        joined_at = now - timedelta(days=data.joined_days_ago)
        if user.created_at is not None and user.created_at > joined_at:
            user.created_at = joined_at
        if user.job_title is None and data.job_title:
            user.job_title = data.job_title
        if user.last_active_at is None and data.last_active is not None:
            user.last_active_at = now - data.last_active
        users[data.email] = user
    db.flush()
    print(f"Users: {created} created, {len(SEED_USERS) - created} already present.")
    return users


def _task_dates(rng: random.Random, now: datetime, age_days: int) -> datetime:
    days_ago = rng.randint(1, max(1, min(84, age_days - 1)))
    return now - timedelta(days=days_ago, hours=rng.randint(0, 20))


def _seed_tasks(
    db: Session, rng: random.Random, project: Project, spec: SeedProject,
    assignees: list[User], now: datetime, today: date,
) -> None:
    done_count = round(spec.tasks * spec.progress)
    overdue_budget = 2 if spec.key in ("MOB", "CLP", "OPS") else (1 if spec.key == "WEB" else 0)
    for index in range(spec.tasks):
        created_at = (
            now - timedelta(days=spec.age_days - rng.randint(1, 20))
            if spec.archived
            else _task_dates(rng, now, spec.age_days)
        )
        assignee = rng.choice(assignees)
        task = Task(
            project_id=project.id,
            title=f"{rng.choice(TASK_VERBS)} {TASK_OBJECTS[index % len(TASK_OBJECTS)]}",
            priority=rng.choice(list(TaskPriority)),
            assignee_id=assignee.id,
            creator_id=assignee.id,
            created_at=created_at,
        )
        if index < done_count:
            # Tasks take 1-14 days, so completions follow the creation curve.
            max_hours = max(2, min(14 * 24, int((now - created_at).total_seconds() // 3600) - 1))
            task.status = TaskStatus.DONE
            task.completed_at = created_at + timedelta(hours=rng.randint(1, max_hours))
            task.due_date = created_at.date() + timedelta(days=rng.randint(7, 21))
        else:
            task.status = rng.choice([TaskStatus.IN_PROGRESS, TaskStatus.TODO])
            if overdue_budget > 0:
                overdue_budget -= 1
                task.due_date = max(created_at.date() + timedelta(days=1),
                                    today - timedelta(days=rng.randint(1, 6)))
            else:
                task.due_date = today + timedelta(days=rng.randint(2, 30))
        db.add(task)


def _seed_projects(db: Session, users: dict[str, User], now: datetime) -> bool:
    today = now.date()
    created_any = False
    for spec in SEED_PROJECTS:
        if db.scalar(select(Project.id).where(Project.key == spec.key)) is not None:
            continue
        created_any = True
        owner = users[spec.owner]
        created_at = now - timedelta(days=spec.age_days)
        project = Project(
            key=spec.key,
            name=spec.name,
            description=spec.description,
            color=spec.color,
            owner_id=owner.id,
            due_date=today + timedelta(days=spec.due_in_days),
            archived=spec.archived,
            created_at=created_at,
        )
        db.add(project)
        db.flush()

        members = [owner, *(users[email] for email in spec.members)]
        for member in members:
            db.add(ProjectMember(
                project_id=project.id,
                user_id=member.id,
                role_in_project=ProjectRole.OWNER if member is owner else ProjectRole.MEMBER,
                joined_at=created_at,
            ))
        assignees = [
            member for member in members if member.status == ACTIVE and member.email != SARAH
        ] or [owner]
        _seed_tasks(db, random.Random(spec.key), project, spec, assignees, now, today)
    print(f"Projects: {'created' if created_any else 'already present'}.")
    return created_any


def _seed_events(db: Session, users: dict[str, User], now: datetime) -> None:
    projects = {project.key: project for project in db.scalars(select(Project))}
    for actor_email, action, target, extra, age, ip in SEED_EVENTS:
        actor = users[actor_email]
        details = dict(extra)
        entity_type, entity_id = "user", actor.id
        if action.startswith("project."):
            project = projects[target]
            entity_type, entity_id = "project", project.id
            details.update(label=project.name, key=project.key)
        elif target is not None and action.startswith("user."):
            entity_id = users[target].id
            details["label"] = users[target].full_name
        db.add(ActivityLog(
            actor_id=actor.id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details or None,
            ip_address=ip,
            created_at=now - age,
        ))
    print(f"Activity: {len(SEED_EVENTS)} events created.")


def _sync_memberships(db: Session, users: dict[str, User], projects: dict[str, Project]) -> None:
    """Adds members introduced by later versions of the seed; removes the ones it dropped."""
    for spec in SEED_PROJECTS:
        project = projects.get(spec.key)
        if project is None:
            continue
        current = set(db.scalars(
            select(ProjectMember.user_id).where(ProjectMember.project_id == project.id)
        ))
        for email in spec.members:
            if users[email].id not in current:
                db.add(ProjectMember(project_id=project.id, user_id=users[email].id))
    for key, email in LEFT_PROJECTS:
        project = projects.get(key)
        if project is None:
            continue
        membership = db.get(ProjectMember, (project.id, users[email].id))
        if membership is not None and project.owner_id != users[email].id:
            db.delete(membership)
    db.flush()


def _hand_over_generated_tasks(db: Session, sarah: User) -> None:
    """Generated filler tasks never belong to Sarah, whose workspace mirrors the design."""
    tasks = db.scalars(
        select(Task).where(
            Task.title.in_(GENERATED_TITLES),
            (Task.assignee_id == sarah.id) | (Task.creator_id == sarah.id),
        )
    ).all()
    for task in tasks:
        others = db.scalars(
            select(User.id)
            .join(ProjectMember, ProjectMember.user_id == User.id)
            .where(ProjectMember.project_id == task.project_id, User.id != sarah.id,
                   User.status == ACTIVE)
            .order_by(User.id)
        ).all()
        replacement = others[0] if others else None
        if task.assignee_id == sarah.id:
            task.assignee_id = replacement
        if task.creator_id == sarah.id:
            task.creator_id = task.assignee_id
    db.flush()


def _seed_workspace_tasks(
    db: Session, users: dict[str, User], projects: dict[str, Project], now: datetime
) -> int:
    today = now.date()
    created = 0
    for index, spec in enumerate(WORKSPACE_TASKS):
        project = projects.get(spec.project)
        if project is None or db.scalar(
            select(Task.id).where(Task.project_id == project.id, Task.title == spec.title)
        ) is not None:
            continue
        completed_at = (
            now - timedelta(days=spec.completed_days_ago) if spec.completed_days_ago is not None else None
        )
        created_at = (completed_at or now) - timedelta(days=6 + index % 5)
        task = Task(
            project_id=project.id,
            title=spec.title,
            description=spec.description,
            status=spec.status,
            priority=spec.priority,
            assignee_id=users[spec.assignee].id,
            creator_id=project.owner_id,
            due_date=today + timedelta(days=spec.due_in_days),
            completed_at=completed_at,
            created_at=created_at,
        )
        db.add(task)
        db.flush()

        total, done = spec.subtasks
        for position in range(total):
            db.add(Subtask(task_id=task.id, title=f"Step {position + 1}", is_done=position < done,
                           position=position))
        authors = [users[spec.assignee].id, project.owner_id]
        for number in range(spec.comments):
            db.add(Comment(
                task_id=task.id,
                author_id=authors[number % len(authors)],
                content=COMMENT_LINES[(index + number) % len(COMMENT_LINES)],
                created_at=created_at + timedelta(hours=6 * (number + 1)),
            ))
        created += 1
    return created


def _seed_member_workspace(db: Session, users: dict[str, User], now: datetime) -> None:
    projects = {project.key: project for project in db.scalars(select(Project))}
    sarah = users[SARAH]
    _sync_memberships(db, users, projects)
    _hand_over_generated_tasks(db, sarah)
    created = _seed_workspace_tasks(db, users, projects, now)
    if sarah.password_changed_at is None:
        sarah.password_changed_at = now - timedelta(days=92)
    print(f"Workspace: {created} task(s) created for the member workspace.")


def _seed_notifications(db: Session, users: dict[str, User], now: datetime) -> None:
    """A few notifications for the demo accounts; skipped once Sarah has any."""
    sarah, afef, amira = users[SARAH], users["afef@taskflow.io"], users[AMIRA]
    if db.scalar(select(Notification.id).where(Notification.user_id == sarah.id).limit(1)) is not None:
        print("Notifications: already present.")
        return
    projects = {project.key: project for project in db.scalars(select(Project))}

    def add(recipients, kind, actor, age, *, project=None, data=None, read=False):
        for notification in notification_service.notify(
            db, [user.id for user in recipients], kind, actor=actor, project=project, data=data
        ):
            notification.created_at = now - age
            notification.read_at = now - age + M if read else None

    web_task = db.scalars(
        select(Task).where(Task.project_id == projects["WEB"].id, Task.assignee_id == sarah.id,
                           Task.status != TaskStatus.DONE)
        .order_by(Task.due_date)
    ).first() if "WEB" in projects else None
    if web_task is not None:
        add([sarah], "task.assigned", afef, 25 * M, project=projects["WEB"],
            data={"title": web_task.title, "task_id": web_task.id})
    if "CLP" in projects:
        add([sarah], "project.member_added", amira, 2 * D, project=projects["CLP"], read=True)
    # Same moment as Nour's "auth.register" event.
    add([afef, amira], "user.registered", users["nour.k@company.com"], 2 * D + 4 * H,
        data={"email": "nour.k@company.com"})
    print("Notifications: demo notifications created.")


def seed(db: Session) -> None:
    now = datetime.now(UTC)
    users = _seed_users(db, now)
    # Events are tied to the first creation of the demo projects, so re-running is a no-op.
    if _seed_projects(db, users, now):
        db.flush()
        _seed_events(db, users, now)
    _seed_member_workspace(db, users, now)
    db.flush()
    _seed_notifications(db, users, now)
    db.commit()


def main() -> None:
    with SessionLocal() as db:
        seed(db)
    print("Seed complete.")


if __name__ == "__main__":
    main()
