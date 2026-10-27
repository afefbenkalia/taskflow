import { Ban, Check, ChevronDown, Loader2, ShieldCheck, Trash2, UserCheck, User, X, type LucideIcon } from 'lucide-react';

import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import type { AdminUser } from '../../../types/user';
import { BULK_ACTIONS, eligibleUsers, type BulkAction } from './bulkActions';

export interface BulkProgress {
  action: BulkAction;
  done: number;
  total: number;
}

export interface SelectionBarProps {
  selected: AdminUser[];
  progress: BulkProgress | null;
  onRun: (action: BulkAction) => void;
  onClear: () => void;
}

const ICONS: Record<BulkAction, LucideIcon> = {
  approve: UserCheck,
  activate: Check,
  make_admin: ShieldCheck,
  make_member: User,
  deactivate: Ban,
  delete: Trash2,
};

const BUTTON =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

/** Appears above the users table while rows are selected. */
export function SelectionBar({ selected, progress, onRun, onClear }: SelectionBarProps) {
  const count = (action: BulkAction) => eligibleUsers(action, selected).length;

  const button = (action: BulkAction) => {
    const eligible = count(action);
    if (eligible === 0) return null;
    const { label, danger } = BULK_ACTIONS[action];
    const Icon = ICONS[action];
    return (
      <button
        key={action}
        type="button"
        onClick={() => onRun(action)}
        className={`${BUTTON} ${
          danger
            ? 'border-[#FECDCA] bg-white text-[#B42318] hover:bg-[#FEF3F2]'
            : 'border-line bg-white text-ink-label hover:bg-app'
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        {label}
        <span className="rounded-full bg-[#F2F4F7] px-1.5 text-[11px] font-bold text-ink-secondary">{eligible}</span>
      </button>
    );
  };

  const roleItems = (['make_admin', 'make_member'] as const)
    .filter((action) => count(action) > 0)
    .map((action) => ({
      key: action,
      label: `${BULK_ACTIONS[action].label} (${count(action)})`,
      icon: ICONS[action],
      onSelect: () => onRun(action),
    }));
  const anyAction = (['approve', 'activate', 'deactivate', 'delete'] as const).some((action) => count(action) > 0)
    || roleItems.length > 0;

  return (
    <div
      role="region"
      aria-label="Selected users"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#C7D2FE] bg-[#F5F6FF] px-4 py-2.5"
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-[#3730A3]" aria-live="polite">
          {selected.length} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={progress !== null}
          className="inline-flex items-center gap-1 rounded-md text-[13px] font-semibold text-primary hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Clear selection
        </button>
      </div>

      {progress ? (
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[#3730A3]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {BULK_ACTIONS[progress.action].progress} {Math.min(progress.done + 1, progress.total)} of {progress.total}…
        </p>
      ) : anyAction ? (
        <div className="flex flex-wrap items-center gap-2">
          {button('approve')}
          {button('activate')}
          {roleItems.length > 0 && (
            <DropdownMenu
              ariaLabel="Change role of selected users"
              width={220}
              align="end"
              items={roleItems}
              triggerClassName={`${BUTTON} border-line bg-white text-ink-label hover:bg-app`}
              trigger={
                <>
                  <ShieldCheck className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  Change role
                  <ChevronDown className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
                </>
              }
            />
          )}
          {button('deactivate')}
          {button('delete')}
        </div>
      ) : (
        <p className="text-[13px] font-medium text-ink-secondary">No bulk action applies to your own account.</p>
      )}
    </div>
  );
}

export default SelectionBar;
