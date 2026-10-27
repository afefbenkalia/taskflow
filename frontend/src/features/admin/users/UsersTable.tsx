import { Folder, Loader2, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';

import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Table, type Column } from '../../../components/ui/Table';
import { pluralize, relativeTime } from '../../../lib/format';
import type { AdminUser, Role, UserStatus } from '../../../types/user';
import { RoleSelector } from './RoleSelector';
import { RowActionsMenu, type RowAction } from './RowActionsMenu';

const STATUS_STYLES: Record<UserStatus, { label: string; dot: string; text: string }> = {
  active: { label: 'Active', dot: '#12B76A', text: '#067647' },
  pending: { label: 'Pending', dot: '#F79009', text: '#B54708' },
  deactivated: { label: 'Deactivated', dot: '#98A2B3', text: '#667085' },
};

const CHECKBOX =
  'h-[18px] w-[18px] cursor-pointer rounded-[6px] border-line accent-[#4F46E5] align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export interface UsersTableProps {
  users: AdminUser[];
  loading: boolean;
  footer?: ReactNode;
  selected: Set<number>;
  /** `range`: Shift was held, select from the last clicked row to this one. */
  onToggleSelected: (id: number, range: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onRoleChange: (user: AdminUser, role: Role) => void;
  onAction: (user: AdminUser, action: RowAction) => void;
  onApprove: (user: AdminUser) => void;
  /** Users with a request in flight: their actions show a spinner and are disabled. */
  busy?: Set<number>;
  /** Freezes the checkboxes while a bulk action runs. */
  selectionLocked?: boolean;
}

export function UsersTable({
  users,
  loading,
  footer,
  selected,
  onToggleSelected,
  onToggleAll,
  onRoleChange,
  onAction,
  onApprove,
  busy = new Set(),
  selectionLocked = false,
}: UsersTableProps) {
  const selectedOnPage = users.filter((user) => selected.has(user.id)).length;
  const allSelected = users.length > 0 && selectedOnPage === users.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  const columns: Column<AdminUser>[] = [
    {
      key: 'select',
      width: 24,
      header: (
        <input
          type="checkbox"
          className={CHECKBOX}
          aria-label="Select all users on this page"
          checked={allSelected}
          // "Some selected": the native mixed state (shown as a dash).
          ref={(input) => {
            if (input) input.indeterminate = someSelected;
          }}
          disabled={users.length === 0 || selectionLocked}
          onChange={() => onToggleAll(!allSelected)}
        />
      ),
      render: (user) => (
        <input
          type="checkbox"
          className={CHECKBOX}
          aria-label={`Select ${user.full_name}`}
          checked={selected.has(user.id)}
          disabled={selectionLocked}
          // onClick (not onChange) to read the Shift key; keyboard Space also fires click.
          onClick={(event) => onToggleSelected(user.id, event.shiftKey)}
          onChange={() => undefined}
        />
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (user) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={user.full_name} size={38} />
          <div className="min-w-0 leading-tight">
            <p className="flex items-center gap-2">
              <span
                className={`truncate text-sm font-bold ${
                  user.status === 'deactivated' ? 'text-ink-muted' : 'text-ink'
                }`}
              >
                {user.full_name}
              </span>
              {user.is_self && (
                <Badge tone="gray" dot={false}>
                  You
                </Badge>
              )}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-ink-secondary">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: 170,
      render: (user) => (
        <RoleSelector
          role={user.role}
          userName={user.full_name}
          locked={user.is_self}
          onChange={(role) => onRoleChange(user, role)}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 150,
      render: (user) => {
        const style = STATUS_STYLES[user.status];
        return (
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: style.text }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.dot }} aria-hidden="true" />
            {style.label}
          </span>
        );
      },
    },
    {
      key: 'projects',
      header: 'Projects',
      width: 120,
      render: (user) => (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-[#475467]">
          <Folder className="h-4 w-4 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
          {pluralize(user.projects_count, 'project')}
        </span>
      ),
    },
    {
      key: 'last_active',
      header: 'Last active',
      width: 140,
      render: (user) => (
        <span className="text-[13px] text-ink-secondary">
          {user.last_active_at ? relativeTime(user.last_active_at) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: 90,
      align: 'right',
      render: (user) => {
        const working = busy.has(user.id);
        return (
          <div className="flex items-center justify-end gap-1">
            {user.status === 'pending' ? (
              <Button size="sm" loading={working} onClick={() => onApprove(user)}>
                Approve
              </Button>
            ) : (
              <button
                type="button"
                aria-label={`Edit details of ${user.full_name}`}
                onClick={() => onAction(user, 'edit')}
                disabled={working}
                className="rounded-lg p-1.5 text-ink-secondary transition hover:bg-app hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
            {working && user.status !== 'pending' ? (
              <span className="p-1.5" role="status" aria-label={`Updating ${user.full_name}`}>
                <Loader2 className="h-[18px] w-[18px] animate-spin text-primary" aria-hidden="true" />
              </span>
            ) : (
              <RowActionsMenu user={user} disabled={working} onAction={(action) => onAction(user, action)} />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Table
      caption="Users"
      columns={columns}
      rows={users}
      getRowKey={(user) => user.id}
      rowClassName={(user) =>
        selected.has(user.id)
          ? 'bg-[#F5F6FF] shadow-[inset_3px_0_0_#4F46E5]'
          : user.status === 'pending'
            ? 'bg-[#FFFCF5]'
            : ''
      }
      loading={loading}
      minWidth={1000}
      footer={footer}
    />
  );
}

export default UsersTable;
