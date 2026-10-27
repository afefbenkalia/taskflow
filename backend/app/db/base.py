"""Import every model so that Base.metadata is complete (used by Alembic and tests)."""

from app.db.session import Base
from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.models.notification import Notification
from app.models.password_reset_token import PasswordResetToken
from app.models.project import Project
from app.models.project_file import ProjectFile
from app.models.project_member import ProjectMember
from app.models.refresh_token import RefreshToken
from app.models.subtask import Subtask
from app.models.task import Task
from app.models.user import User

__all__ = [
    "ActivityLog", "Base", "Comment", "Notification", "PasswordResetToken", "Project", "ProjectFile",
    "ProjectMember", "RefreshToken", "Subtask", "Task", "User",
]
