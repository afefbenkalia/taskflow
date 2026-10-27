from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import Page
from app.schemas.user import UserBrief


class NotificationProject(BaseModel):
    id: int
    name: str
    color: str


class NotificationOut(BaseModel):
    id: int
    kind: str
    actor: UserBrief | None
    # Sentence without the actor's name ("assigned you Homepage mockup in Website redesign");
    # the UI prefixes it with the actor.
    message: str
    # Where clicking the notification leads, for the recipient's role; None when nowhere.
    link: str | None
    project: NotificationProject | None
    read: bool
    created_at: datetime


class NotificationPage(Page[NotificationOut]):
    unread_count: int


class UnreadCount(BaseModel):
    count: int


class MarkAllReadResult(BaseModel):
    updated: int
