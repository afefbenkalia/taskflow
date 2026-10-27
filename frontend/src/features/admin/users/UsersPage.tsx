import { Lock, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiErrorMessage } from '../../../api/client';
import {
  changeRole,
  deleteUser,
  listUsers,
  resetPassword,
  setUserStatus,
  type AdminUserPage,
} from '../../../api/users';
import { Alert, Toast } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/Card';
import { SearchInput } from '../../../components/ui/Input';
import { ConfirmDialog, Modal } from '../../../components/ui/Modal';
import { Pagination } from '../../../components/ui/Pagination';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { FilterSelect } from '../../../components/ui/Select';
import { useDebounce } from '../../../hooks/useDebounce';
import { useQueryState } from '../../../hooks/usePagination';
import { ROLE_LABELS, pluralize } from '../../../lib/format';
import type { AdminUser, Role, UserStatus } from '../../../types/user';
import { BULK_ACTIONS, eligibleUsers, namesSummary, runFor, type BulkAction } from './bulkActions';
import { InviteUserModal, TemporaryPassword } from './InviteUserModal';
import type { RowAction } from './RowActionsMenu';
import { SelectionBar, type BulkProgress } from './SelectionBar';
import { UsersTable } from './UsersTable';

/** Confirmation sentence for bulk actions that need one. */
function bulkMessage(action: BulkAction, names: string) {
  switch (action) {
    case 'make_admin':
      return <>Give admin rights to <strong className="text-ink">{names}</strong>? They’ll get full access to users, roles and every project.</>;
    case 'make_member':
      return <>Change <strong className="text-ink">{names}</strong> to Member? They’ll lose access to the admin console.</>;
    case 'deactivate':
      return <><strong className="text-ink">{names}</strong> will be signed out immediately and won’t be able to sign in until reactivated.</>;
    default:
      return <>Permanently delete <strong className="text-ink">{names}</strong>? Their assigned tasks become unassigned. This can’t be undone.</>;
  }
}

const PAGE_SIZE = 10;

type Segment = 'all' | 'admins' | 'members' | 'pending' | 'deactivated';

const SEGMENT_FILTERS: Record<Segment, { role: Role | null; status: UserStatus | null }> = {
  all: { role: null, status: null },
  admins: { role: 'admin', status: null },
  members: { role: 'user', status: null },
  pending: { role: null, status: 'pending' },
  deactivated: { role: null, status: 'deactivated' },
};

function segmentOf(role: string, status: string): Segment {
  if (status === 'pending') return 'pending';
  if (status === 'deactivated') return 'deactivated';
  if (role === 'admin') return 'admins';
  if (role === 'user') return 'members';
  return 'all';
}

type Confirmation =
  | { kind: 'role'; user: AdminUser; role: Role }
  | { kind: 'deactivate' | 'delete' | 'reset'; user: AdminUser };

export function UsersPage() {
  const { get, page, update, setPage } = useQueryState();
  const [searchText, setSearchText] = useState(get('search'));
  const search = useDebounce(searchText.trim(), 300);
  const role = get('role') as Role | '';
  const status = get('status') as UserStatus | '';
  const inviteOpen = get('invite') === '1';

  const [data, setData] = useState<AdminUserPage | null>(null);
  const [loading, setLoading] = useState(true);
  // Loading errors and action errors are separate: reloading the list after an
  // action must not erase the action's report.
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Last row clicked, the start of a Shift+click range.
  const anchorRef = useRef<number | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<BulkAction | null>(null);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<{ user: AdminUser; password: string } | null>(null);

  useEffect(() => {
    if (search !== get('search')) update({ search });
  }, [search, get, update]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listUsers({ search: search || undefined, role: role || undefined, status: status || undefined, page, page_size: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load users.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [search, role, status, page, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const closeToast = useCallback(() => setToast(null), []);

  // --- selection ---------------------------------------------------------------------
  // The selection belongs to the visible page: it is cleared when the page or the
  // filters change, and rows that disappear after a reload drop out of it.
  useEffect(() => {
    setSelected(new Set());
    setActionError(null);
    anchorRef.current = null;
  }, [search, role, status, page]);

  useEffect(() => {
    if (!data) return;
    const visible = new Set(data.items.map((user) => user.id));
    setSelected((current) => {
      const kept = [...current].filter((id) => visible.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [data]);

  const toggleSelected = (id: number, range: boolean) => {
    const users = data?.items ?? [];
    // Read before updating the ref: React may run the updater below later.
    const anchor = anchorRef.current;
    setSelected((current) => {
      const next = new Set(current);
      const select = !current.has(id);
      const from = users.findIndex((user) => user.id === anchor);
      const to = users.findIndex((user) => user.id === id);
      if (range && from !== -1 && to !== -1) {
        // Shift+click: every row between the last clicked one and this one follows it.
        const [start, end] = from < to ? [from, to] : [to, from];
        users.slice(start, end + 1).forEach((user) => (select ? next.add(user.id) : next.delete(user.id)));
      } else if (select) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
    anchorRef.current = id;
  };

  // --- single-user actions -------------------------------------------------------------

  const markBusy = (id: number, value: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });

  /** Actions without a confirmation step (approve, activate): the row shows a spinner. */
  const runAction = async (user: AdminUser, action: () => Promise<unknown>, message: string) => {
    if (busy.has(user.id)) return;
    setActionError(null);
    markBusy(user.id, true);
    try {
      await action();
      setToast(message);
      reload();
    } catch (reason) {
      setActionError(apiErrorMessage(reason, 'The action could not be completed.'));
    } finally {
      markBusy(user.id, false);
    }
  };

  const handleRowAction = (user: AdminUser, action: RowAction) => {
    setConfirmError(null);
    switch (action) {
      case 'edit':
        setEditing(user);
        break;
      case 'role':
        setConfirmation({ kind: 'role', user, role: user.role === 'admin' ? 'user' : 'admin' });
        break;
      case 'activate':
        void runAction(user, () => setUserStatus(user.id, 'activate'), `${user.full_name} was activated.`);
        break;
      default:
        setConfirmation({ kind: action, user });
    }
  };

  // --- bulk actions ----------------------------------------------------------------------

  const selectedUsers = (data?.items ?? []).filter((user) => selected.has(user.id));

  const executeBulk = async (action: BulkAction) => {
    const targets = eligibleUsers(action, selectedUsers);
    if (targets.length === 0) return;
    setBulkConfirm(null);
    setActionError(null);
    const failures: { user: AdminUser; message: string }[] = [];
    // One at a time: the API checks rules such as "keep at least one admin" per request.
    for (const [index, user] of targets.entries()) {
      setProgress({ action, done: index, total: targets.length });
      markBusy(user.id, true);
      try {
        await runFor(action, user);
      } catch (reason) {
        failures.push({ user, message: apiErrorMessage(reason, 'The action could not be completed.') });
      } finally {
        markBusy(user.id, false);
      }
    }
    setProgress(null);

    const succeeded = targets.length - failures.length;
    if (succeeded > 0) setToast(`${pluralize(succeeded, 'user')} ${BULK_ACTIONS[action].done}.`);
    if (failures.length > 0) {
      setActionError(failures.map(({ user, message }) => `${user.full_name}: ${message}`).join(' '));
    }
    // Keep the failed rows selected so they can be retried; the others are done.
    setSelected(new Set(failures.map(({ user }) => user.id)));
    reload();
  };

  const requestBulk = (action: BulkAction) => {
    if (BULK_ACTIONS[action].confirm) setBulkConfirm(action);
    else void executeBulk(action);
  };

  const confirm = async () => {
    if (!confirmation) return;
    const { user } = confirmation;
    setConfirming(true);
    setConfirmError(null);
    try {
      if (confirmation.kind === 'role') {
        await changeRole(user.id, confirmation.role);
        setToast(`${user.full_name} is now ${confirmation.role === 'admin' ? 'an Admin' : 'a Member'}.`);
      } else if (confirmation.kind === 'deactivate') {
        await setUserStatus(user.id, 'deactivate');
        setToast(`${user.full_name} was deactivated and signed out.`);
      } else if (confirmation.kind === 'delete') {
        await deleteUser(user.id);
        setToast(`${user.full_name} was deleted.`);
      } else {
        const password = await resetPassword(user.id);
        setTemporaryPassword({ user, password });
      }
      setConfirmation(null);
      reload();
    } catch (reason) {
      setConfirmError(apiErrorMessage(reason, 'The action could not be completed.'));
    } finally {
      setConfirming(false);
    }
  };

  const counts = data?.counts;
  const segment = segmentOf(role, status);
  const segmentOptions = useMemo(
    () => [
      { value: 'all' as const, label: 'All', count: counts?.all },
      { value: 'admins' as const, label: 'Admins', count: counts?.admins },
      { value: 'members' as const, label: 'Members', count: counts?.members },
      { value: 'pending' as const, label: 'Pending', count: counts?.pending },
      { value: 'deactivated' as const, label: 'Deactivated', count: counts?.deactivated },
    ],
    [counts],
  );

  const users = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="User management"
        subtitle={
          counts
            ? `${counts.all} users · ${counts.admins} administrators · ${counts.pending} awaiting approval`
            : ' '
        }
        actions={
          <Button
            leftIcon={<Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
            onClick={() => update({ invite: 1, page: page > 1 ? page : null })}
          >
            Invite user
          </Button>
        }
      />

      {/* Tabs and filters share one row from xl; below, the filters get their own row.
          Search, Role and Status never wrap: the search field shrinks first. */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="shrink-0">
          <SegmentedControl
            ariaLabel="Filter users"
            options={segmentOptions}
            value={segment}
            onChange={(value) => update(SEGMENT_FILTERS[value])}
          />
        </div>
        <div className="flex w-full min-w-0 items-center gap-3 xl:w-auto xl:flex-1 xl:justify-end">
          <SearchInput
            label="Search users"
            placeholder="Search by name or email…"
            width={280}
            className="min-w-0 flex-1"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <FilterSelect
            label="Role"
            value={role}
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'user', label: 'Member' },
            ]}
            onChange={(value) => update({ role: value })}
          />
          <FilterSelect
            label="Status"
            value={status}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'pending', label: 'Pending' },
              { value: 'deactivated', label: 'Deactivated' },
            ]}
            onChange={(value) => update({ status: value })}
          />
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {actionError && <Alert variant="error">{actionError}</Alert>}

      {selectedUsers.length > 0 && (
        <SelectionBar
          selected={selectedUsers}
          progress={progress}
          onRun={requestBulk}
          onClear={() => {
            setSelected(new Set());
            anchorRef.current = null;
          }}
        />
      )}

      <UsersTable
        users={users}
        loading={loading && !data}
        selected={selected}
        busy={busy}
        selectionLocked={progress !== null}
        onToggleSelected={toggleSelected}
        onToggleAll={(checked) => {
          setSelected(checked ? new Set(users.map((user) => user.id)) : new Set());
          anchorRef.current = null;
        }}
        onRoleChange={(user, nextRole) => {
          setConfirmError(null);
          setConfirmation({ kind: 'role', user, role: nextRole });
        }}
        onAction={handleRowAction}
        onApprove={(user) =>
          void runAction(user, () => setUserStatus(user.id, 'approve'), `${user.full_name} was approved.`)
        }
        footer={
          data && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              itemLabel="users"
              onPageChange={setPage}
            />
          )
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-info-border bg-info-bg px-4 py-3">
        <Lock className="mt-px h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
        <p className="text-[13px] font-medium text-info">
          You can’t change your own role or deactivate yourself — another administrator must do it. Every
          role change is recorded in the activity log.
        </p>
      </div>

      <InviteUserModal
        open={inviteOpen || editing !== null}
        mode={editing ? 'edit' : 'invite'}
        user={editing}
        onClose={() => {
          setEditing(null);
          if (inviteOpen) update({ invite: null, page: page > 1 ? page : null });
        }}
        onSaved={(_, message) => {
          if (editing) setToast(message);
          reload();
        }}
      />

      <ConfirmDialog
        open={confirmation?.kind === 'role'}
        title="Change role"
        message={
          confirmation?.kind === 'role' && (
            <>
              Change the role of <strong className="text-ink">{confirmation.user.full_name}</strong> from{' '}
              {ROLE_LABELS[confirmation.user.role]} to{' '}
              <strong className="text-ink">{ROLE_LABELS[confirmation.role]}</strong>?
            </>
          )
        }
        confirmLabel="Confirm"
        loading={confirming}
        error={confirmError && <Alert variant="error">{confirmError}</Alert>}
        onConfirm={confirm}
        onCancel={() => setConfirmation(null)}
      />

      <ConfirmDialog
        open={confirmation?.kind === 'deactivate'}
        title="Deactivate user"
        message={
          confirmation && (
            <>
              <strong className="text-ink">{confirmation.user.full_name}</strong> will be signed out
              immediately and won’t be able to sign in until reactivated.
            </>
          )
        }
        confirmLabel="Deactivate user"
        tone="danger"
        loading={confirming}
        error={confirmError && <Alert variant="error">{confirmError}</Alert>}
        onConfirm={confirm}
        onCancel={() => setConfirmation(null)}
      />

      <ConfirmDialog
        open={confirmation?.kind === 'delete'}
        title="Delete user"
        message={
          confirmation && (
            <>
              Permanently delete <strong className="text-ink">{confirmation.user.full_name}</strong>? Their
              assigned tasks become unassigned. This can’t be undone.
            </>
          )
        }
        confirmLabel="Delete user"
        tone="danger"
        loading={confirming}
        error={confirmError && <Alert variant="error">{confirmError}</Alert>}
        onConfirm={confirm}
        onCancel={() => setConfirmation(null)}
      />

      <ConfirmDialog
        open={confirmation?.kind === 'reset'}
        title="Reset password"
        message={
          confirmation && (
            <>
              Generate a temporary password for{' '}
              <strong className="text-ink">{confirmation.user.full_name}</strong>? They will be signed out of
              every session.
            </>
          )
        }
        confirmLabel="Reset password"
        loading={confirming}
        error={confirmError && <Alert variant="error">{confirmError}</Alert>}
        onConfirm={confirm}
        onCancel={() => setConfirmation(null)}
      />

      {bulkConfirm && (
        <ConfirmDialog
          open
          title={`${BULK_ACTIONS[bulkConfirm].label} ${pluralize(eligibleUsers(bulkConfirm, selectedUsers).length, 'user')}`}
          message={
            <>
              <span className="block">{bulkMessage(bulkConfirm, namesSummary(eligibleUsers(bulkConfirm, selectedUsers)))}</span>
              {eligibleUsers(bulkConfirm, selectedUsers).length < selectedUsers.length && (
                <span className="mt-2 block text-[13px] text-ink-muted">
                  {pluralize(selectedUsers.length - eligibleUsers(bulkConfirm, selectedUsers).length, 'selected user')} will
                  be skipped (the action doesn’t apply to them).
                </span>
              )}
            </>
          }
          confirmLabel={BULK_ACTIONS[bulkConfirm].label}
          tone={BULK_ACTIONS[bulkConfirm].danger ? 'danger' : 'primary'}
          onConfirm={() => void executeBulk(bulkConfirm)}
          onCancel={() => setBulkConfirm(null)}
        />
      )}

      <Modal
        open={temporaryPassword !== null}
        onClose={() => setTemporaryPassword(null)}
        title="Temporary password"
        description={temporaryPassword && `Share this password with ${temporaryPassword.user.full_name}.`}
        footer={<Button onClick={() => setTemporaryPassword(null)}>Done</Button>}
      >
        {temporaryPassword && <TemporaryPassword password={temporaryPassword.password} />}
      </Modal>

      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}

export default UsersPage;
