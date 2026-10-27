from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import Client, CurrentUser, DbSession
from app.api.v1.auth import set_refresh_cookie
from app.models.task import TaskPriority
from app.schemas.activity import WorkspaceActivityPage
from app.schemas.auth import MessageResponse
from app.schemas.project import MyProjectOut
from app.schemas.stats import Dashboard
from app.schemas.task import DueFilter, TaskOut
from app.schemas.user import MeCounts, MeOut, MeUpdate, PasswordChange
from app.services import auth_service, project_service, task_service, user_service

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=MeOut)
def read_me(db: DbSession, user: CurrentUser) -> MeOut:
    return user_service.me_out(db, user)


@router.patch("", response_model=MeOut)
def update_me(data: MeUpdate, db: DbSession, user: CurrentUser, client: Client) -> MeOut:
    return user_service.me_out(db, user_service.update_me(db, user, data, client.ip))


@router.put("/password", response_model=MessageResponse)
def change_password(
    data: PasswordChange, response: Response, db: DbSession, user: CurrentUser, client: Client
) -> MessageResponse:
    # Other sessions are revoked; this device gets a new refresh cookie.
    set_refresh_cookie(response, auth_service.change_password(db, user, data, client))
    return MessageResponse(message="Password updated.")


@router.get("/counts", response_model=MeCounts)
def counts(db: DbSession, user: CurrentUser) -> MeCounts:
    return task_service.my_counts(db, user)


@router.get("/dashboard", response_model=Dashboard)
def dashboard(db: DbSession, user: CurrentUser) -> Dashboard:
    return task_service.dashboard(db, user)


@router.get("/tasks", response_model=list[TaskOut])
def my_tasks(
    db: DbSession,
    user: CurrentUser,
    search: str | None = None,
    project_id: int | None = None,
    priority: TaskPriority | None = None,
    due: DueFilter = DueFilter.ANY,
    due_from: date | None = None,
    due_to: date | None = None,
) -> list[TaskOut]:
    return task_service.my_tasks(
        db, user, search=search, project_id=project_id, priority=priority, due=due,
        due_from=due_from, due_to=due_to,
    )


@router.get("/activity", response_model=WorkspaceActivityPage)
def my_activity(
    db: DbSession,
    user: CurrentUser,
    project_id: int | None = None,
    mine: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> WorkspaceActivityPage:
    return project_service.workspace_activity(
        db, user, project_id=project_id, mine=mine, page=page, page_size=page_size
    )


@router.get("/projects", response_model=list[MyProjectOut])
def my_projects(db: DbSession, user: CurrentUser) -> list[MyProjectOut]:
    return project_service.my_projects(db, user)
