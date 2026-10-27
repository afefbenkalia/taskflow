from fastapi import APIRouter, Response, status

from app.api.deps import Client, CurrentUser, DbSession
from app.schemas.task import CommentCreate, CommentOut, StatusUpdate, TaskCreate, TaskOut
from app.services import comment_service, task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(data: TaskCreate, db: DbSession, user: CurrentUser, client: Client) -> TaskOut:
    return task_service.create_task(db, user, data, client.ip)


@router.patch("/{task_id}/status", response_model=TaskOut)
def change_status(
    task_id: int, data: StatusUpdate, db: DbSession, user: CurrentUser, client: Client
) -> TaskOut:
    return task_service.change_status(db, user, task_id, data.status, client.ip)


# Comments: any member of the task's project; 404 for everyone else.


@router.get("/{task_id}/comments", response_model=list[CommentOut])
def list_comments(task_id: int, db: DbSession, user: CurrentUser) -> list[CommentOut]:
    return comment_service.list_comments(db, user, task_id)


@router.post("/{task_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def add_comment(
    task_id: int, data: CommentCreate, db: DbSession, user: CurrentUser, client: Client
) -> CommentOut:
    return comment_service.add_comment(db, user, task_id, data, client.ip)


@router.delete("/{task_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(task_id: int, comment_id: int, db: DbSession, user: CurrentUser) -> Response:
    comment_service.delete_comment(db, user, task_id, comment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
