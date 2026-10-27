from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel

from app.schemas.common import Page
from app.schemas.user import UserBrief


class ActivityType(StrEnum):
    ROLE = "role"
    STATUS = "status"
    CREATE = "create"
    AUTH = "auth"
    DEACTIVATE = "deactivate"
    UPDATE = "update"
    DENIED = "denied"


class ActivityPeriod(StrEnum):
    LAST_24_HOURS = "24h"
    LAST_7_DAYS = "7d"
    LAST_30_DAYS = "30d"


class TargetKind(StrEnum):
    USER = "user"
    TASK = "task"
    PROJECT = "project"
    FILE = "file"
    SESSION = "session"
    SECURITY = "security"


class ActivityOut(BaseModel):
    id: int
    actor: UserBrief | None
    action: str
    type: ActivityType
    entity_type: str
    entity_id: int | None
    entity_label: str | None
    target_kind: TargetKind
    target_label: str
    details: dict[str, Any] | None
    ip: str | None
    created_at: datetime


class ActivityPage(Page[ActivityOut]):
    pass


class ProjectActivityOut(BaseModel):
    """Project feed entry for members: no IP address."""

    id: int
    actor: UserBrief | None
    action: str
    type: ActivityType
    entity_type: str
    entity_id: int | None
    entity_label: str | None
    details: dict[str, Any] | None
    created_at: datetime


class ProjectActivityPage(Page[ProjectActivityOut]):
    pass


class ActivityProject(BaseModel):
    id: int
    key: str
    name: str
    color: str


class WorkspaceActivityOut(ProjectActivityOut):
    """Entry of the member's Activity page, across all of their projects."""

    project: ActivityProject | None


class WorkspaceActivityPage(Page[WorkspaceActivityOut]):
    pass
