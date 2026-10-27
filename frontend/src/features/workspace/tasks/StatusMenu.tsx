import { Lock } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';

import { apiErrorMessage } from '../../../api/client';
import { changeTaskStatus } from '../../../api/tasks';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import type { Priority, Task, TaskStatus } from '../../../types/task';

export const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done'];

export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: 'To do', color: '#98A2B3' },
  in_progress: { label: 'In progress', color: '#6366F1' },
  done: { label: 'Done', color: '#12B76A' },
};

const PRIORITY_META: Record<Priority, { label: string; tone: BadgeTone }> = {
  high: { label: 'High', tone: 'red' },
  medium: { label: 'Medium', tone: 'amber' },
  low: { label: 'Low', tone: 'gray' },
};

export function StatusDot({ status, size = 8 }: { status: TaskStatus; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: TASK_STATUS_META[status].color }}
      aria-hidden="true"
    />
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export interface StatusMenuProps {
  status: TaskStatus;
  canChange: boolean;
  onChange: (status: TaskStatus) => void;
  trigger: ReactNode;
  triggerClassName: string;
  ariaLabel: string;
}

/** "CHANGE STATUS" menu; items are disabled when the user may not change the status. */
export function StatusMenu({ status, canChange, onChange, trigger, triggerClassName, ariaLabel }: StatusMenuProps) {
  return (
    <DropdownMenu
      ariaLabel={ariaLabel}
      width={250}
      itemRole="menuitemradio"
      triggerClassName={triggerClassName}
      trigger={trigger}
      header={
        <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
          Change status
        </p>
      }
      items={STATUS_ORDER.map((value) => ({
        key: value,
        label: TASK_STATUS_META[value].label,
        leading: <StatusDot status={value} />,
        selected: value === status,
        disabled: !canChange,
        onSelect: () => value !== status && onChange(value),
      }))}
      footer={
        <>
          <div className="my-1.5 h-px bg-line-soft" role="separator" />
          <p className="flex items-start gap-2 px-2.5 py-1.5 text-[11px] font-medium leading-4 text-ink-muted">
            <Lock className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            Only the assignee or the project owner can change the status.
          </p>
        </>
      }
    />
  );
}

/** Applies `next` to the task with this id in the caller's state. */
export type TaskUpdater = (taskId: number, next: (task: Task) => Task) => void;

/**
 * Optimistic status change: the UI updates immediately, then rolls back and
 * exposes the API message if the change is refused.
 */
export function useStatusUpdater(update: TaskUpdater, onSaved: () => void) {
  const [error, setError] = useState<string | null>(null);

  const change = useCallback(
    async (task: Task, status: TaskStatus) => {
      if (task.status === status || !task.can_change_status) return;
      setError(null);
      update(task.id, (current) => ({ ...current, status }));
      try {
        const saved = await changeTaskStatus(task.id, status);
        update(task.id, () => saved);
        onSaved();
      } catch (reason) {
        update(task.id, () => task);
        setError(apiErrorMessage(reason, 'The status couldn’t be updated.'));
      }
    },
    [update, onSaved],
  );

  return { change, error, clearError: () => setError(null) };
}

export default StatusMenu;
