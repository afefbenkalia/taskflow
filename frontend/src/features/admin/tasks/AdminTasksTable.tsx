import type { ReactNode } from 'react';

import { Avatar } from '../../../components/ui/Avatar';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { Table, type Column } from '../../../components/ui/Table';
import { shortDate } from '../../../lib/format';
import type { AdminTask } from '../../../types/task';
import { PriorityBadge, StatusDot, TASK_STATUS_META } from '../../workspace/tasks/StatusMenu';

const OVERDUE_RED = '#D92D20';

/** Read-only status: a label, never a menu. */
function StatusLabel({ task }: { task: AdminTask }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-[#F2F4F7] bg-[#F9FAFB] px-2.5 py-[5px] text-[13px] font-semibold text-ink-label">
      <StatusDot status={task.status} />
      {TASK_STATUS_META[task.status].label}
    </span>
  );
}

const COLUMNS: Column<AdminTask>[] = [
  {
    key: 'task',
    header: 'Task',
    render: (task) => (
      <div className="min-w-0 leading-tight">
        <p className={`truncate text-sm font-semibold ${task.status === 'done' ? 'text-ink-secondary' : 'text-ink'}`} title={task.title}>
          {task.title}
        </p>
        <p className="mt-0.5 font-mono text-xs text-ink-muted">{task.key}</p>
      </div>
    ),
  },
  {
    key: 'project',
    header: 'Project',
    width: 180,
    render: (task) => (
      <div className="min-w-0 leading-tight">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: task.project.color }} aria-hidden="true" />
          <span className="truncate text-[13px] font-medium text-ink-label">{task.project.name}</span>
        </span>
        {task.project.archived && <span className="mt-1 block text-xs text-ink-muted">Archived project</span>}
      </div>
    ),
  },
  {
    key: 'assignee',
    header: 'Assignee',
    width: 170,
    render: (task) =>
      task.assignee ? (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={task.assignee.full_name} size={26} />
          <span className="truncate text-[13px] font-medium text-[#475467]">{task.assignee.full_name}</span>
        </span>
      ) : (
        <span className="text-[13px] text-ink-muted">Unassigned</span>
      ),
  },
  {
    key: 'priority',
    header: 'Priority',
    width: 80,
    render: (task) => <PriorityBadge priority={task.priority} />,
  },
  {
    key: 'status',
    header: 'Status',
    width: 120,
    render: (task) => <StatusLabel task={task} />,
  },
  {
    key: 'due',
    header: 'Due',
    width: 100,
    render: (task) => (
      <div className="leading-tight">
        <p className="text-[13px] font-semibold" style={{ color: task.overdue ? OVERDUE_RED : '#475467' }}>
          {task.due_date ? shortDate(task.due_date) : '—'}
        </p>
        {task.overdue && (
          <p className="mt-0.5 text-xs font-semibold" style={{ color: OVERDUE_RED }}>
            Overdue
          </p>
        )}
        {task.status === 'done' && task.completed_at && (
          <p className="mt-0.5 text-xs text-[#067647]">Done {shortDate(task.completed_at)}</p>
        )}
      </div>
    ),
  },
  {
    key: 'subtasks',
    header: 'Subtasks',
    width: 100,
    render: (task) =>
      task.subtasks_total > 0 ? (
        <div className="flex items-center gap-2">
          <ProgressBar
            value={task.subtasks_done}
            max={task.subtasks_total}
            width={44}
            height={5}
            color={task.subtasks_done === task.subtasks_total ? '#12B76A' : '#6366F1'}
            label={`${task.title}: ${task.subtasks_done} of ${task.subtasks_total} subtasks done`}
          />
          <span className="text-xs font-semibold text-[#475467]">
            {task.subtasks_done}/{task.subtasks_total}
          </span>
        </div>
      ) : (
        <span className="text-[13px] text-ink-muted">—</span>
      ),
  },
];

export interface AdminTasksTableProps {
  tasks: AdminTask[];
  loading: boolean;
  filtered: boolean;
  footer?: ReactNode;
}

export function AdminTasksTable({ tasks, loading, filtered, footer }: AdminTasksTableProps) {
  return (
    <Table
      caption="All tasks (read-only)"
      columns={COLUMNS}
      rows={tasks}
      getRowKey={(task) => task.id}
      rowClassName={(task) => (task.overdue ? 'bg-[#FFFBFA]' : '')}
      loading={loading}
      minWidth={1080}
      footer={footer}
      empty={
        filtered ? (
          <EmptyState />
        ) : (
          <EmptyState title="No tasks yet" description="Tasks created by project members will appear here." />
        )
      }
    />
  );
}

export default AdminTasksTable;
