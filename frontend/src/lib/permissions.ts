// Mirrors backend/app/core/permissions.py. The API stays the source of truth
// (Task.can_change_status, GET /projects/{id}/permissions); these helpers keep the UI consistent.
import type { ProjectPermission, PermissionKey } from '../types/project';
import type { Task } from '../types/task';

export function isProjectOwner(userId: number, ownerId: number): boolean {
  return userId === ownerId;
}

/** Only the assignee or the project owner can change a task's status. */
export function canChangeTaskStatus(userId: number, task: Pick<Task, 'assignee'>, ownerId: number): boolean {
  return task.assignee?.id === userId || isProjectOwner(userId, ownerId);
}

export function isAllowed(permissions: ProjectPermission[], key: PermissionKey): boolean {
  return permissions.some((permission) => permission.key === key && permission.allowed);
}
