from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import permissions
from app.core.exceptions import AppError
from app.models.comment import Comment
from app.models.project import Project
from app.models.user import User
from app.schemas.task import CommentCreate, CommentOut
from app.schemas.user import UserBrief
from app.services import activity_service, notification_service, project_service
from app.services.task_service import get_task_for_member, task_key


def _serialize(db: Session, user: User, project: Project, comments: list[Comment]) -> list[CommentOut]:
    author_ids = {comment.author_id for comment in comments if comment.author_id}
    authors = {u.id: u for u in db.scalars(select(User).where(User.id.in_(author_ids)))} if author_ids else {}
    return [
        CommentOut(
            id=comment.id,
            author=UserBrief.model_validate(authors[comment.author_id]) if comment.author_id in authors else None,
            content=comment.content,
            created_at=comment.created_at,
            can_delete=permissions.can_delete_comment(user, comment.author_id, project),
        )
        for comment in comments
    ]


def list_comments(db: Session, user: User, task_id: int) -> list[CommentOut]:
    """Oldest first, like a conversation. 404 unless the user belongs to the task's project."""
    task, project = get_task_for_member(db, user, task_id)
    comments = db.scalars(
        select(Comment).where(Comment.task_id == task.id).order_by(Comment.created_at, Comment.id)
    ).all()
    return _serialize(db, user, project, list(comments))


def add_comment(db: Session, user: User, task_id: int, data: CommentCreate, ip: str | None) -> CommentOut:
    task, project = get_task_for_member(db, user, task_id)
    if not permissions.can_comment(user, project, project_service.member_ids(db, project.id)):
        raise AppError(403, "comment_forbidden", "Only project members can comment.")

    comment = Comment(task_id=task.id, author_id=user.id, content=data.content)
    db.add(comment)
    db.flush()
    activity_service.log(
        db, user.id, "task.commented", "task", task.id,
        {"label": task.title, "task_key": task_key(project, task), "project_id": project.id},
        ip,
    )
    # The people the task concerns hear about it (never the author).
    notification_service.notify(
        db, [task.assignee_id, task.creator_id], "task.commented", actor=user, project=project,
        data={"title": task.title, "task_id": task.id},
    )
    db.commit()
    db.refresh(comment)
    return _serialize(db, user, project, [comment])[0]


def delete_comment(db: Session, user: User, task_id: int, comment_id: int) -> None:
    task, project = get_task_for_member(db, user, task_id)
    comment = db.get(Comment, comment_id)
    if comment is None or comment.task_id != task.id:
        raise AppError(404, "comment_not_found", "Comment not found.")
    if not permissions.can_delete_comment(user, comment.author_id, project):
        raise AppError(
            403, "comment_delete_forbidden", "Only the author or the project owner can delete this comment."
        )
    db.delete(comment)
    db.commit()
