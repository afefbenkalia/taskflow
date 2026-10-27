"""Project access rules for members.

Pure functions: callers pass the project and the ids of its members, so the
rules can be reused by services, the permissions endpoint and tests without a
database. Global admins use the admin console and are not special-cased here.
"""

from collections.abc import Collection
from dataclasses import dataclass

from app.models.project import Project
from app.models.project_file import ProjectFile
from app.models.task import Task
from app.models.user import User, UserStatus


@dataclass(frozen=True)
class Permission:
    key: str
    label: str
    allowed: bool


def is_project_owner(user: User, project: Project) -> bool:
    return project.owner_id == user.id


def is_project_member(user: User, project: Project, member_ids: Collection[int]) -> bool:
    return is_project_owner(user, project) or user.id in member_ids


def can_view_project(user: User, project: Project, member_ids: Collection[int]) -> bool:
    return is_project_member(user, project, member_ids)


def can_create_task(user: User, project: Project, member_ids: Collection[int]) -> bool:
    return is_project_member(user, project, member_ids)


def can_change_task_status(user: User, task: Task, project: Project) -> bool:
    """Only the assignee or the project owner can change a task's status."""
    return task.assignee_id == user.id or is_project_owner(user, project)


def can_assign(project: Project, assignee_id: int, member_ids: Collection[int]) -> bool:
    return assignee_id == project.owner_id or assignee_id in member_ids


def can_manage_members(user: User, project: Project) -> bool:
    return is_project_owner(user, project)


def can_add_member(
    user: User, project: Project, candidate: User, member_ids: Collection[int]
) -> bool:
    """The owner adds active users who are not in the project yet."""
    return (
        can_manage_members(user, project)
        and candidate.status == UserStatus.ACTIVE
        and not is_project_member(candidate, project, member_ids)
    )


def can_remove_member(user: User, project: Project, member_id: int) -> bool:
    """The owner removes members; the owner's own membership cannot be removed."""
    return can_manage_members(user, project) and member_id != project.owner_id


def can_upload_file(user: User, project: Project, member_ids: Collection[int]) -> bool:
    return is_project_member(user, project, member_ids)


def can_comment(user: User, project: Project, member_ids: Collection[int]) -> bool:
    """Every project member can comment on any task of the project."""
    return is_project_member(user, project, member_ids)


def can_delete_comment(user: User, author_id: int | None, project: Project) -> bool:
    """The author deletes their own comments; the project owner can moderate any."""
    return author_id == user.id or is_project_owner(user, project)


def can_delete_file(user: User, file: ProjectFile, project: Project) -> bool:
    """Only the uploader or the project owner can delete a file."""
    return file.uploader_id == user.id or is_project_owner(user, project)


def project_permissions(
    user: User, project: Project, member_ids: Collection[int]
) -> list[Permission]:
    """The six rows shown in the workspace PermissionsPanel."""
    member = is_project_member(user, project, member_ids)
    owner = is_project_owner(user, project)
    return [
        Permission("create_tasks", "Create tasks", member),
        Permission("update_status", "Update status of your tasks", member),
        Permission("comment", "Comment on any task", member),
        Permission("edit_settings", "Edit project settings", owner),
        Permission("manage_members", "Manage members", owner),
        Permission("archive_delete", "Archive or delete the project", owner),
    ]
