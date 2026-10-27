import { ChevronDown, Lock } from 'lucide-react';

import type { Task, TaskStatus } from '../../../types/task';
import { StatusDot, StatusMenu, TASK_STATUS_META } from '../tasks/StatusMenu';

export interface StatusSelectProps {
  task: Task;
  onChange: (task: Task, status: TaskStatus) => void;
}

/** Editable for the assignee or the project owner; otherwise a locked pill. */
export function StatusSelect({ task, onChange }: StatusSelectProps) {
  const { label } = TASK_STATUS_META[task.status];

  if (!task.can_change_status) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] px-2.5 py-[5px] text-[13px] font-semibold text-ink-muted"
        title="Only the assignee or the project owner can change the status."
        aria-label={`${label} — locked`}
      >
        <StatusDot status={task.status} />
        {label}
        <Lock className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
      </span>
    );
  }

  return (
    <StatusMenu
      status={task.status}
      canChange
      onChange={(status) => onChange(task, status)}
      ariaLabel={`Status of ${task.title}: ${label}`}
      triggerClassName="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-[5px] text-[13px] font-semibold text-ink-label shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
      trigger={
        <>
          <StatusDot status={task.status} />
          {label}
          <ChevronDown className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
        </>
      }
    />
  );
}

export default StatusSelect;
