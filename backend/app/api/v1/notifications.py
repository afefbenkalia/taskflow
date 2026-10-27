from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.notification import MarkAllReadResult, NotificationOut, NotificationPage, UnreadCount
from app.services import notification_service

# Every signed-in user (member or admin) only ever sees their own notifications.
router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationPage)
def list_notifications(
    db: DbSession,
    user: CurrentUser,
    unread: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> NotificationPage:
    return notification_service.list_notifications(
        db, user, unread=unread, page=page, page_size=page_size
    )


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(db: DbSession, user: CurrentUser) -> UnreadCount:
    return notification_service.unread_count(db, user)


@router.post("/read-all", response_model=MarkAllReadResult)
def mark_all_read(db: DbSession, user: CurrentUser) -> MarkAllReadResult:
    return notification_service.mark_all_read(db, user)


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: int, db: DbSession, user: CurrentUser) -> NotificationOut:
    return notification_service.mark_read(db, user, notification_id)
