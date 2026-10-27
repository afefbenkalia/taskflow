import { Calendar, Check } from 'lucide-react';
import { useState } from 'react';

import { Card, Skeleton } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { shortDate, toDate } from '../../../lib/format';
import type { Dashboard, Task, TaskStatus } from '../../../types/task';
import { PriorityBadge, StatusDot, TASK_STATUS_META } from '../tasks/StatusMenu';

type FocusTab = 'today' | 'upcoming' | 'overdue';

function isToday(value: string): boolean {
  return toDate(value).toDateString() === new Date().toDateString();
}

function isOverdue(task: Task): boolean {
  if (task.status === 'done' || !task.due_date) return false;
  const due = toDate(task.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function DueLabel({ task }: { task: Task }) {
  if (!task.due_date) return <span className="w-[72px]" />;
  const overdue = isOverdue(task);
  return (
    <span
      className={`inline-flex w-[72px] shrink-0 items-center gap-1 text-[13px] font-semibold ${
        overdue ? 'text-[#D92D20]' : 'text-[#475467]'
      }`}
    >
      <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
      {isToday(task.due_date) ? 'Today' : shortDate(task.due_date)}
    </span>
  );
}

function FocusRow({ task, onToggle }: { task: Task; onToggle: (task: Task, status: TaskStatus) => void }) {
  const done = task.status === 'done';
  return (
    <li className="flex items-center gap-3.5 border-t border-[#F2F4F7] py-[13px]">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark “${task.title}” as to do` : `Mark “${task.title}” as done`}
        disabled={!task.can_change_status}
        onClick={() => onToggle(task, done ? 'todo' : 'done')}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 ${
          done ? 'border-[#12B76A] bg-[#12B76A]' : 'border-line bg-white hover:border-primary'
        }`}
      >
        {done && <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden="true" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>
          {task.title}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} aria-hidden="true" />
          {task.project.name}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        <PriorityBadge priority={task.priority} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-white px-2 py-0.5 text-xs font-semibold text-ink-label">
          <StatusDot status={task.status} size={6} />
          {TASK_STATUS_META[task.status].label}
        </span>
      </div>
      <DueLabel task={task} />
    </li>
  );
}

export interface TodayFocusProps {
  focus: Dashboard['focus'] | null;
  onToggle: (task: Task, status: TaskStatus) => void;
}

export function TodayFocus({ focus, onToggle }: TodayFocusProps) {
  const [tab, setTab] = useState<FocusTab>('today');
  const tasks = focus?.[tab] ?? [];

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-bold text-ink">Today’s focus</h2>
          <p className="mt-0.5 text-[13px] font-medium text-ink-secondary">Tasks assigned to you, sorted by due date</p>
        </div>
        <SegmentedControl
          ariaLabel="Focus"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: 'Today', count: focus?.counts.today },
            { value: 'upcoming', label: 'Upcoming', count: focus?.counts.upcoming },
            { value: 'overdue', label: 'Overdue', count: focus?.counts.overdue },
          ]}
        />
      </div>

      {!focus ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState title="No tasks here yet" description="You’re all caught up." />
      ) : (
        <ul className="mt-4">
          {tasks.map((task) => (
            <FocusRow key={task.id} task={task} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export default TodayFocus;
