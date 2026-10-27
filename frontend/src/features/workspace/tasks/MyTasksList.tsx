import { Fragment } from 'react';

import { Card, Skeleton } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { shortDate, toDate } from '../../../lib/format';
import type { Task, TaskStatus } from '../../../types/task';
import { StatusSelect } from '../projects/StatusSelect';
import { PriorityBadge, StatusDot, TASK_STATUS_META } from './StatusMenu';
import { commentsLabel } from './TaskDetailsModal';

const GROUP_ORDER: TaskStatus[] = ['in_progress', 'todo', 'done'];

const COLUMNS: { key: string; label: string; width?: number }[] = [
  { key: 'task', label: 'Task' },
  { key: 'project', label: 'Project', width: 180 },
  { key: 'priority', label: 'Priority', width: 90 },
  { key: 'due', label: 'Due', width: 80 },
  { key: 'status', label: 'Status', width: 150 },
];

// 20px at the row edges, 12px between columns (same as the project task table).
function cellPadding(index: number): string {
  return `${index === 0 ? 'pl-5' : 'pl-1.5'} ${index === COLUMNS.length - 1 ? 'pr-5' : 'pr-1.5'}`;
}

function isOverdue(task: Task): boolean {
  if (task.status === 'done' || !task.due_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toDate(task.due_date) < today;
}

export interface MyTasksListProps {
  tasks: Task[] | null;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onOpen: (task: Task) => void;
}

/** "List" view of My tasks: the same tasks as the board, as a table grouped by status. */
export function MyTasksList({ tasks, onStatusChange, onOpen }: MyTasksListProps) {
  const groups = GROUP_ORDER.map((status) => ({
    status,
    tasks: (tasks ?? []).filter((task) => task.status === status),
  })).filter((group) => group.tasks.length > 0);

  return (
    <Card padding="p-0" className="min-w-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse">
          <caption className="sr-only">My tasks</caption>
          <colgroup>
            {COLUMNS.map((column, index) => (
              <col
                key={column.key}
                style={column.width ? { width: column.width + (index === COLUMNS.length - 1 ? 26 : 12) } : undefined}
              />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-line-soft bg-[#F9FAFB]">
              {COLUMNS.map((column, index) => (
                <th key={column.key} scope="col" className={`py-3 text-left text-xs font-semibold text-ink-secondary ${cellPadding(index)}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks === null
              ? Array.from({ length: 5 }, (_, row) => (
                  <tr key={row} className="border-b border-line-soft">
                    {COLUMNS.map((column, index) => (
                      <td key={column.key} className={`py-4 ${cellPadding(index)}`}>
                        <Skeleton className="h-4 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : groups.map((group) => (
                  <Fragment key={group.status}>
                    <tr className="border-b border-line-soft bg-[#FCFCFD]">
                      <th colSpan={COLUMNS.length} scope="rowgroup" className="py-2.5 pl-5 text-left">
                        <span className="inline-flex items-center gap-2 text-[13px] font-bold text-ink-label">
                          <StatusDot status={group.status} />
                          {TASK_STATUS_META[group.status].label}
                          <span className="rounded-full bg-[#F2F4F7] px-1.5 py-px text-xs font-semibold text-ink-secondary">
                            {group.tasks.length}
                          </span>
                        </span>
                      </th>
                    </tr>
                    {group.tasks.map((task) => (
                      <tr key={task.id} className="border-b border-line-soft">
                        <td className={`py-3 ${cellPadding(0)}`}>
                          <button
                            type="button"
                            onClick={() => onOpen(task)}
                            className="block max-w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          >
                            <span
                              className={`block truncate text-sm font-semibold hover:text-primary ${task.status === 'done' ? 'text-ink-secondary' : 'text-ink'}`}
                            >
                              {task.title}
                            </span>
                            <span className="mt-0.5 flex items-center gap-2 text-xs">
                              <span className="font-mono text-ink-muted">{task.key}</span>
                              <span className="font-semibold text-primary">{commentsLabel(task.comments_count)}</span>
                            </span>
                          </button>
                        </td>
                        <td className={`py-3 ${cellPadding(1)}`}>
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-[3px]"
                              style={{ backgroundColor: task.project.color }}
                              aria-hidden="true"
                            />
                            <span className="truncate text-[13px] font-medium text-[#475467]">{task.project.name}</span>
                          </span>
                        </td>
                        <td className={`py-3 ${cellPadding(2)}`}>
                          <PriorityBadge priority={task.priority} />
                        </td>
                        <td className={`py-3 ${cellPadding(3)}`}>
                          <span className={`text-[13px] font-semibold ${isOverdue(task) ? 'text-[#D92D20]' : 'text-[#475467]'}`}>
                            {task.due_date ? shortDate(task.due_date) : '—'}
                          </span>
                        </td>
                        <td className={`py-3 ${cellPadding(4)}`}>
                          <StatusSelect task={task} onChange={onStatusChange} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
          </tbody>
        </table>
      </div>
      {tasks !== null && groups.length === 0 && (
        <EmptyState title="No tasks here yet" description="Tasks you own or are assigned to will appear here." />
      )}
    </Card>
  );
}

export default MyTasksList;
