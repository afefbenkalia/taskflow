import { useCallback } from 'react';

import { isAllowed } from '../lib/permissions';
import type { PermissionKey, ProjectPermission } from '../types/project';
import type { Task } from '../types/task';

/** Whether the signed-in user may change this task's status (computed by the API). */
export function useCanChangeStatus(task: Pick<Task, 'can_change_status'>): boolean {
  return task.can_change_status;
}

/** Checks a project permission from GET /projects/{id}/permissions. */
export function usePermission(permissions: ProjectPermission[] | null) {
  return useCallback(
    (key: PermissionKey) => (permissions ? isAllowed(permissions, key) : false),
    [permissions],
  );
}
