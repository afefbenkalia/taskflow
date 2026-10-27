from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.models.task import TaskPriority
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.schemas.project import ProjectScope
from app.schemas.task import AdminTaskPage, AdminTaskStatus, DueFilter, TaskSort
from app.services import task_service

# Read-only: admins monitor tasks here; creating or changing tasks happens in the
# member workspace. Only GET is exposed, so any other method answers 405.
router = APIRouter(prefix="/tasks", tags=["admin: tasks"])


@router.get("", response_model=AdminTaskPage)
def list_tasks(
    db: DbSession,
    scope: ProjectScope = ProjectScope.ACTIVE,
    search: str | None = None,
    project_id: int | None = None,
    assignee_id: int | None = None,
    unassigned: bool = False,
    status: AdminTaskStatus | None = None,
    priority: TaskPriority | None = None,
    due: DueFilter = DueFilter.ANY,
    sort: TaskSort = TaskSort.DUE,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> AdminTaskPage:
    return task_service.admin_tasks(
        db, scope=scope, search=search, project_id=project_id, assignee_id=assignee_id,
        unassigned=unassigned, status=status, priority=priority, due=due, sort=sort,
        page=page, page_size=page_size,
    )
