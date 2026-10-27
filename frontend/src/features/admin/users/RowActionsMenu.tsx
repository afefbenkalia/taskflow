import { Ban, Check, KeyRound, MoreHorizontal, Pencil, ShieldCheck, Trash2 } from 'lucide-react';

import { DropdownMenu, type MenuItem } from '../../../components/ui/DropdownMenu';
import type { AdminUser } from '../../../types/user';

export type RowAction = 'edit' | 'role' | 'reset' | 'deactivate' | 'activate' | 'delete';

export interface RowActionsMenuProps {
  user: AdminUser;
  onAction: (action: RowAction) => void;
  disabled?: boolean;
}

export function RowActionsMenu({ user, onAction, disabled = false }: RowActionsMenuProps) {
  const deactivated = user.status === 'deactivated';
  const pending = user.status === 'pending';
  const items: MenuItem[] = [
    { key: 'edit', label: 'Edit details', icon: Pencil, onSelect: () => onAction('edit') },
  ];
  // An admin cannot change their own role, deactivate or delete themselves.
  if (!user.is_self) {
    items.push({ key: 'role', label: 'Change role', icon: ShieldCheck, onSelect: () => onAction('role') });
  }
  // A pending account has never signed in: no password to reset, nothing to deactivate.
  if (!pending) {
    items.push({ key: 'reset', label: 'Reset password', icon: KeyRound, onSelect: () => onAction('reset') });
  }
  if (!user.is_self && !pending) {
    items.push(
      deactivated
        ? { key: 'activate', label: 'Activate user', icon: Check, separatorBefore: true,
            onSelect: () => onAction('activate') }
        : { key: 'deactivate', label: 'Deactivate user', icon: Ban, danger: true, separatorBefore: true,
            onSelect: () => onAction('deactivate') },
    );
  }
  if (!user.is_self) {
    items.push({
      key: 'delete',
      label: pending ? 'Reject and delete' : 'Delete user',
      icon: Trash2,
      danger: true,
      separatorBefore: pending,
      onSelect: () => onAction('delete'),
    });
  }

  return (
    <DropdownMenu
      ariaLabel={`More actions for ${user.full_name}`}
      disabled={disabled}
      items={items}
      triggerClassName="rounded-lg p-1.5 text-ink-secondary transition hover:bg-app hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      trigger={<MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
    />
  );
}

export default RowActionsMenu;
