import { Plus } from 'lucide-react';

import { Skeleton } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import type { Task, TaskStatus } from '../../../types/task';
import { StatusDot, TASK_STATUS_META } from './StatusMenu';
import { TaskCard } from './TaskCard';

export interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  loading: boolean;
  onAdd: (status: TaskStatus) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onOpen?: (task: Task) => void;
}

export function KanbanColumn({ status, tasks, loading, onAdd, onStatusChange, onOpen }: KanbanColumnProps) {
  const { label } = TASK_STATUS_META[status];

  return (
    <section
      aria-label={label}
      className="flex min-h-0 flex-col gap-3 rounded-card bg-[#EEF0F4] p-3"
    >
      <header className="flex items-center gap-2 px-1 pt-1">
        <StatusDot status={status} />
        <h2 className="text-sm font-bold text-ink">{label}</h2>
        <span className="rounded-full bg-white px-2 py-px text-xs font-bold text-[#475467]">{tasks.length}</span>
        <button
          type="button"
          onClick={() => onAdd(status)}
          aria-label={`Add a task to ${label}`}
          className="ml-auto rounded-md p-0.5 text-ink-secondary transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
        {loading ? (
          Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-[132px] rounded-[14px] bg-white" />)
        ) : tasks.length === 0 ? (
          <div className="rounded-[14px] bg-white/60">
            <EmptyState title="No tasks here yet" description="Tasks with this status will appear here." />
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onStatusChange={onStatusChange} onOpen={onOpen} />
          ))
        )}
      </div>
    </section>
  );
}

export default KanbanColumn;
