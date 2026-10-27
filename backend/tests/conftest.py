from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.main import app
from app.models.project import Project
from app.models.project_member import ProjectMember, ProjectRole
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole, UserStatus

ADMIN_PASSWORD = "Admin@1234"
MEMBER_PASSWORD = "User@1234"


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    if not settings.TEST_DATABASE_URL:
        pytest.exit("TEST_DATABASE_URL is not set (see backend/.env.example).", returncode=2)
    if settings.TEST_DATABASE_URL == settings.DATABASE_URL:
        pytest.exit("TEST_DATABASE_URL must differ from DATABASE_URL: tests drop all tables.", returncode=2)

    test_engine = create_engine(settings.TEST_DATABASE_URL)
    Base.metadata.drop_all(test_engine)
    Base.metadata.create_all(test_engine)
    yield test_engine
    Base.metadata.drop_all(test_engine)
    test_engine.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    """Each test runs inside a transaction that is rolled back afterwards.

    Commits made by the application only release a SAVEPOINT.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def make_user(
    db: Session,
    *,
    first_name: str,
    last_name: str,
    email: str,
    password: str,
    role: UserRole = UserRole.USER,
    status: UserStatus = UserStatus.ACTIVE,
) -> User:
    user = User(
        first_name=first_name,
        last_name=last_name,
        email=email,
        password_hash=hash_password(password),
        role=role,
        status=status,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_user(db_session: Session) -> User:
    return make_user(
        db_session, first_name="Afef", last_name="Ben Kalia", email="afef@taskflow.io",
        password=ADMIN_PASSWORD, role=UserRole.ADMIN,
    )


@pytest.fixture
def member_user(db_session: Session) -> User:
    return make_user(
        db_session, first_name="Sarah", last_name="Mansour", email="sarah.m@taskflow.io",
        password=MEMBER_PASSWORD,
    )


@pytest.fixture
def pending_user(db_session: Session) -> User:
    return make_user(
        db_session, first_name="Nour", last_name="Kefi", email="nour.k@company.com",
        password=MEMBER_PASSWORD, status=UserStatus.PENDING,
    )


@pytest.fixture
def deactivated_user(db_session: Session) -> User:
    return make_user(
        db_session, first_name="Youssef", last_name="Trabelsi", email="youssef.t@taskflow.io",
        password=MEMBER_PASSWORD, status=UserStatus.DEACTIVATED,
    )


def _bearer(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


def make_project(
    db: Session,
    owner: User,
    *,
    key: str = "WEB",
    name: str = "Website redesign",
    due_date: date | None = None,
    archived: bool = False,
    members: tuple[User, ...] = (),
) -> Project:
    project = Project(
        key=key, name=name, color="#4F46E5", owner_id=owner.id,
        due_date=due_date, archived=archived,
    )
    db.add(project)
    db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=owner.id, role_in_project=ProjectRole.OWNER))
    for member in members:
        db.add(ProjectMember(project_id=project.id, user_id=member.id))
    db.commit()
    db.refresh(project)
    return project


def make_task(
    db: Session,
    project: Project,
    *,
    status: TaskStatus = TaskStatus.TODO,
    due_date: date | None = None,
    assignee: User | None = None,
    created_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> Task:
    if status == TaskStatus.DONE and completed_at is None:
        completed_at = datetime.now(UTC)
    task = Task(
        project_id=project.id,
        title="Task",
        status=status,
        due_date=due_date,
        assignee_id=assignee.id if assignee else None,
        creator_id=project.owner_id,
        completed_at=completed_at,
    )
    if created_at is not None:
        task.created_at = created_at
    db.add(task)
    db.commit()
    return task


@pytest.fixture
def second_admin(db_session: Session) -> User:
    return make_user(
        db_session, first_name="Amira", last_name="Mejri", email="amira.m@taskflow.io",
        password=ADMIN_PASSWORD, role=UserRole.ADMIN,
    )


@pytest.fixture
def admin_headers(admin_user: User) -> dict[str, str]:
    return _bearer(admin_user)


@pytest.fixture
def member_headers(member_user: User) -> dict[str, str]:
    return _bearer(member_user)
