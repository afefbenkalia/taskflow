import { changeRole, deleteUser, setUserStatus } from '../../../api/users';
import type { AdminUser } from '../../../types/user';

export type BulkAction = 'approve' | 'activate' | 'make_admin' | 'make_member' | 'deactivate' | 'delete';

export interface BulkActionMeta {
  /** Button text in the selection bar. */
  label: string;
  /** "Deactivating 2 of 5…" */
  progress: string;
  /** "3 users deactivated." */
  done: string;
  danger?: boolean;
  /** Destructive or sensitive actions ask for confirmation first. */
  confirm: boolean;
}

export const BULK_ACTIONS: Record<BulkAction, BulkActionMeta> = {
  approve: { label: 'Approve', progress: 'Approving', done: 'approved', confirm: false },
  activate: { label: 'Activate', progress: 'Activating', done: 'activated', confirm: false },
  make_admin: { label: 'Make admin', progress: 'Updating roles of', done: 'made admins', confirm: true },
  make_member: { label: 'Make member', progress: 'Updating roles of', done: 'made members', confirm: true },
  deactivate: { label: 'Deactivate', progress: 'Deactivating', done: 'deactivated', danger: true, confirm: true },
  delete: { label: 'Delete', progress: 'Deleting', done: 'deleted', danger: true, confirm: true },
};

export const BULK_ORDER: BulkAction[] = ['approve', 'activate', 'make_admin', 'make_member', 'deactivate', 'delete'];

/**
 * Whether the action applies to this user. Mirrors the rules of the row menu and the
 * API: an admin never changes their own role, deactivates or deletes themselves.
 */
export function isEligible(action: BulkAction, user: AdminUser): boolean {
  switch (action) {
    case 'approve':
      return user.status === 'pending';
    case 'activate':
      return user.status === 'deactivated';
    case 'make_admin':
      return !user.is_self && user.role !== 'admin';
    case 'make_member':
      return !user.is_self && user.role !== 'user';
    case 'deactivate':
      return !user.is_self && user.status === 'active';
    case 'delete':
      return !user.is_self;
  }
}

export function eligibleUsers(action: BulkAction, users: AdminUser[]): AdminUser[] {
  return users.filter((user) => isEligible(action, user));
}

/** Calls the same endpoint as the single-user action. */
export function runFor(action: BulkAction, user: AdminUser): Promise<unknown> {
  switch (action) {
    case 'approve':
      return setUserStatus(user.id, 'approve');
    case 'activate':
      return setUserStatus(user.id, 'activate');
    case 'make_admin':
      return changeRole(user.id, 'admin');
    case 'make_member':
      return changeRole(user.id, 'user');
    case 'deactivate':
      return setUserStatus(user.id, 'deactivate');
    case 'delete':
      return deleteUser(user.id);
  }
}

/** "Sarah Mansour, Karim Bouzid and 3 others" */
export function namesSummary(users: AdminUser[], max = 3): string {
  const names = users.map((user) => user.full_name);
  if (names.length <= max) {
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
  }
  const rest = names.length - max;
  return `${names.slice(0, max).join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
}
