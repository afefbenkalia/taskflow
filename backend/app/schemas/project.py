import re
from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, field_validator
from pydantic_core import PydanticCustomError

from app.models.project_member import ProjectRole
from app.schemas.common import Page
from app.schemas.user import UserBrief

PROJECT_NAME_MAX_LENGTH = 120


class ProjectHealth(StrEnum):
    ON_TRACK = "on_track"
    AT_RISK = "at_risk"
    OVERDUE = "overdue"
    COMPLETED = "completed"


class ProjectScope(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    ALL = "all"


class ProjectOut(BaseModel):
    id: int
    key: str
    name: str
    description: str | None
    color: str
    owner: UserBrief
    members: list[UserBrief]
    members_count: int
    tasks_total: int
    tasks_done: int
    progress: int
    due_date: date | None
    health: ProjectHealth
    archived: bool
    created_at: datetime


class ProjectSummary(BaseModel):
    active: int
    on_track: int
    at_risk: int
    overdue: int
    archived: int
    all: int


class ProjectPage(Page[ProjectOut]):
    summary: ProjectSummary


# --- member workspace ------------------------------------------------------------


class MyProjectOut(BaseModel):
    id: int
    key: str
    name: str
    color: str
    my_role: ProjectRole
    progress: int
    done: int
    total: int
    due_date: date | None
    health: ProjectHealth


class ProjectDetail(BaseModel):
    id: int
    key: str
    name: str
    description: str | None
    color: str
    owner: UserBrief
    due_date: date | None
    health: ProjectHealth
    progress: int
    tasks_done: int
    tasks_count: int
    members_count: int
    files_count: int
    my_role: ProjectRole
    archived: bool
    created_at: datetime


class ProjectMemberOut(BaseModel):
    user: UserBrief
    email: str
    job_title: str | None
    role_in_project: ProjectRole
    is_self: bool
    joined_at: datetime
    open_tasks: int
    done_tasks: int
    can_remove: bool


class MemberCandidate(BaseModel):
    """An active user the owner can add to the project."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    job_title: str | None


class MemberAdd(BaseModel):
    user_id: int


class ProjectFileOut(BaseModel):
    id: int
    name: str
    content_type: str
    size_bytes: int
    uploaded_by: UserBrief | None
    created_at: datetime
    can_delete: bool


class PermissionOut(BaseModel):
    key: str
    label: str
    allowed: bool


class ProjectCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str
    key: str
    description: str | None = None
    owner_id: int
    due_date: date | None = None
    color: str = "#4F46E5"

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        if not value:
            raise PydanticCustomError("name_required", "Project name is required.")
        if len(value) > PROJECT_NAME_MAX_LENGTH:
            raise PydanticCustomError(
                "name_too_long",
                f"Project name must be at most {PROJECT_NAME_MAX_LENGTH} characters.",
            )
        return value

    @field_validator("key")
    @classmethod
    def _key(cls, value: str) -> str:
        value = value.upper()
        if not re.fullmatch(r"[A-Z]{3}", value):
            raise PydanticCustomError("key_format", "Key must be exactly 3 letters.")
        return value

    @field_validator("color")
    @classmethod
    def _color(cls, value: str) -> str:
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
            raise PydanticCustomError("color_format", "Color must be a hex value like #4F46E5.")
        return value.upper()

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return value or None
