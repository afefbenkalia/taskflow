from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, field_validator
from pydantic_core import PydanticCustomError

from app.models.task import TaskPriority, TaskStatus
from app.schemas.common import Page
from app.schemas.user import UserBrief

# Messages are mirrored in frontend/src/lib/validators.ts.
TITLE_MAX_LENGTH = 200
DESCRIPTION_MAX_LENGTH = 500


class DueFilter(StrEnum):
    ANY = "any"
    TODAY = "today"
    WEEK = "week"
    OVERDUE = "overdue"


class TaskProject(BaseModel):
    id: int
    key: str
    name: str
    color: str


class TaskOut(BaseModel):
    id: int
    key: str
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    due_date: date | None
    completed_at: datetime | None
    created_at: datetime
    project: TaskProject
    assignee: UserBrief | None
    creator_id: int | None
    subtasks_done: int
    subtasks_total: int
    comments_count: int
    can_change_status: bool


class TaskCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str
    description: str | None = None
    project_id: int
    # Defaults to the current user.
    assignee_id: int | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: date | None = None
    status: TaskStatus = TaskStatus.TODO

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        if not value:
            raise PydanticCustomError("title_required", "Title is required.")
        if len(value) > TITLE_MAX_LENGTH:
            raise PydanticCustomError(
                "title_too_long", f"Title must be at most {TITLE_MAX_LENGTH} characters."
            )
        return value

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        if value and len(value) > DESCRIPTION_MAX_LENGTH:
            raise PydanticCustomError(
                "description_too_long",
                f"Description must be at most {DESCRIPTION_MAX_LENGTH} characters.",
            )
        return value or None


class StatusUpdate(BaseModel):
    status: TaskStatus


COMMENT_MAX_LENGTH = 1000


class CommentOut(BaseModel):
    id: int
    author: UserBrief | None
    content: str
    created_at: datetime
    can_delete: bool


class CommentCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    content: str

    @field_validator("content")
    @classmethod
    def _content(cls, value: str) -> str:
        if not value:
            raise PydanticCustomError("comment_required", "Write a comment first.")
        if len(value) > COMMENT_MAX_LENGTH:
            raise PydanticCustomError(
                "comment_too_long", f"Comments must be at most {COMMENT_MAX_LENGTH} characters."
            )
        return value


# --- admin console (read-only) -------------------------------------------------------


class AdminTaskStatus(StrEnum):
    """Status filter: the three stored statuses, plus "overdue" (open and past due)."""

    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    OVERDUE = "overdue"


class TaskSort(StrEnum):
    DUE = "due"            # earliest due date first, tasks without a date last
    RECENT = "recent"      # newest first
    PRIORITY = "priority"  # high first, then by due date


class AdminTaskProject(BaseModel):
    id: int
    key: str
    name: str
    color: str
    archived: bool


class AdminTaskOut(BaseModel):
    id: int
    key: str
    title: str
    status: TaskStatus
    priority: TaskPriority
    due_date: date | None
    completed_at: datetime | None
    created_at: datetime
    overdue: bool
    project: AdminTaskProject
    assignee: UserBrief | None
    creator: UserBrief | None
    subtasks_done: int
    subtasks_total: int
    comments_count: int


class TaskSummary(BaseModel):
    """Counts over the selected scope (active, archived or all projects), before other filters."""

    total: int
    todo: int
    in_progress: int
    done: int
    overdue: int
    unassigned: int


class AdminTaskPage(Page[AdminTaskOut]):
    summary: TaskSummary
