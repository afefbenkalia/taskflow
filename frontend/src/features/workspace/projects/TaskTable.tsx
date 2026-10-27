import { Plus } from 'lucide-react';
import { Fragment } from 'react';

import { Avatar } from '../../../components/ui/Avatar';
import { Card, Skeleton } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { shortDate, toDate } from '../../../lib/format';
import type { Task, TaskStatus } from '../../../types/task';
import { PriorityBadge, StatusDot, TASK_STATUS_META } from '../tasks/StatusMenu';
import { commentsLabel } from '../tasks/TaskDetailsModal';
import { StatusSelect } from './StatusSelect';

const GROUP_ORDER: TaskStatus[] = ['in_progress', 'todo', 'done'];

const COLUMNS: { key: string; label: string; width?: number }[] = [
  { key: 'task', label: 'Task' },
  { key: 'assignee', label: 'Assignee', width: 150 },
  { key: 'priority', label: 'Priority', width: 90 },
  { key: 'due', label: 'Due', width: 70 },
  { key: 'status', label: 'Status', width: 150 },
];

// 20px at the row edges, 12px between columns.
function cellPadding(index: number): string {
  return `${index === 0 ? 'pl-5' : 'pl-1.5'} ${index === COLUMNS.length - 1 ? 'pr-5' : 'pr-1.5'}`;
}

function isOverdue(task: Task): boolean {
  if (task.status === 'done' || !task.due_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toDate(task.due_date) < today;
}

export interface TaskTableProps {
  tasks: Task[] | null;
  currentUserId: number;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onAdd: () => void;
  /** Opens the task details and its comments. */
  onOpen?: (task: Task) => void;
}

export function TaskTable({ tasks, currentUserId, onStatusChange, onAdd, onOpen }: TaskTableProps) {
  const groups = GROUP_ORDER.map((status) => ({
    status,
    tasks: (tasks ?? []).filter((task) => task.status === status),
  })).filter((group) => group.tasks.length > 0);

  return (
    <Card padding="p-0" className="min-w-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse">
          <caption className="sr-only">Project tasks</caption>
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
                    {group.tasks.map((task) => {
                      const assignee = task.assignee;
                      const mine = assignee?.id === currentUserId;
                      return (
                        <tr key={task.id} className="border-b border-line-soft">
                          <td className={`py-3 ${cellPadding(0)}`}>
                            {onOpen ? (
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
                                <span className="text-xs font-semibold text-primary">{commentsLabel(task.comments_count)}</span>
                              </button>
                            ) : (
                              <p className={`truncate text-sm font-semibold ${task.status === 'done' ? 'text-ink-secondary' : 'text-ink'}`}>
                                {task.title}
                              </p>
                            )}
                          </td>
                          <td className={`py-3 ${cellPadding(1)}`}>
                            {assignee ? (
                              <span className="flex min-w-0 items-center gap-2">
                                <Avatar name={assignee.full_name} size={26} />
                                <span className="truncate text-[13px] font-medium text-[#475467]">
                                  {mine ? `${assignee.first_name} (you)` : assignee.full_name}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[13px] text-ink-muted">Unassigned</span>
                            )}
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
                      );
                    })}
                  </Fragment>
                ))}
          </tbody>
        </table>
      </div>
      {tasks !== null && groups.length === 0 && (
        <EmptyState title="No tasks here yet" description="Add the first task of this project." />
      )}
      <div className="border-t border-line-soft px-5 py-3">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-md text-[13px] font-bold text-primary hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          Add task
        </button>
      </div>
    </Card>
  );
}

export default TaskTable;
