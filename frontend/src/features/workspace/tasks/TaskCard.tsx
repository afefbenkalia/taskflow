import { Calendar, MoreHorizontal, SquareCheck } from 'lucide-react';

import { Avatar } from '../../../components/ui/Avatar';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { shortDate } from '../../../lib/format';
import type { Task, TaskStatus } from '../../../types/task';
import { PriorityBadge, StatusMenu } from './StatusMenu';
import { commentsLabel } from './TaskDetailsModal';

export interface TaskCardProps {
  task: Task;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  /** Opens the task details and its comments. */
  onOpen?: (task: Task) => void;
}

export function TaskCard({ task, onStatusChange, onOpen }: TaskCardProps) {
  const done = task.status === 'done';
  const color = task.project.color;

  return (
    <article className="space-y-3 rounded-[14px] border border-line-soft bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-[3px] text-[11px] font-bold"
          style={{ backgroundColor: `${color}14`, color }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          <span className="truncate">{task.project.name}</span>
        </span>
        <StatusMenu
          status={task.status}
          canChange={task.can_change_status}
          onChange={(status) => onStatusChange(task, status)}
          ariaLabel={`Change status of ${task.title}`}
          triggerClassName="rounded-md p-0.5 text-ink-muted transition hover:bg-app hover:text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          trigger={<MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
        />
      </div>

      <div>
        <h3 className={`text-[15px] font-bold leading-snug ${done ? 'text-ink-secondary' : 'text-ink'}`}>
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(task)}
              className="rounded text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {task.title}
            </button>
          ) : (
            task.title
          )}
        </h3>
        {task.description && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-ink-secondary">{task.description}</p>
        )}
      </div>

      {task.subtasks_total > 0 && (
        <div className="flex items-center gap-2">
          <SquareCheck className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
          <span className="text-xs font-semibold text-[#475467]">
            {task.subtasks_done}/{task.subtasks_total}
          </span>
          <ProgressBar
            value={task.subtasks_done}
            max={task.subtasks_total}
            width={110}
            height={4}
            color={done ? '#12B76A' : color}
            label={`${task.title} subtasks`}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-[#F2F4F7] pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <PriorityBadge priority={task.priority} />
          {task.due_date && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#475467]">
              <Calendar className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
              {shortDate(task.due_date)}
            </span>
          )}
          {onOpen && (
            <button
              type="button"
              onClick={() => onOpen(task)}
              aria-label={`${commentsLabel(task.comments_count)} on ${task.title}`}
              className="rounded text-xs font-semibold text-primary hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {commentsLabel(task.comments_count)}
            </button>
          )}
        </div>
        {task.assignee && <Avatar name={task.assignee.full_name} size={24} />}
      </div>
    </article>
  );
}

export default TaskCard;
