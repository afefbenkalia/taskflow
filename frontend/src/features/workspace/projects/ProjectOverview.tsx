import { CalendarDays, Clock, Flag, User as UserIcon, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getProjectActivity } from '../../../api/projects';
import { ProgressRing } from '../../../components/charts/ProgressRing';
import { Avatar } from '../../../components/ui/Avatar';
import { Card, CardHeader, Skeleton } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { relativeTime, shortDate, toDate } from '../../../lib/format';
import type { ProjectActivityEntry } from '../../../types/activity';
import type { ProjectDetail } from '../../../types/project';
import type { Task } from '../../../types/task';
import { ActivityIcon, ActivitySentence } from '../../admin/activity/AuditTable';
import { StatusDot, TASK_STATUS_META } from '../tasks/StatusMenu';

const LONG_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const DEADLINES_SHOWN = 5;
const RECENT_ACTIVITY = 5;
const OVERDUE_COLOR = '#F04438';

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isOverdue(task: Task, today: Date): boolean {
  return task.status !== 'done' && task.due_date !== null && toDate(task.due_date) < today;
}

function ViewAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md text-[13px] font-bold text-primary hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      {label}
    </button>
  );
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F2F4F7]" aria-hidden="true">
        <Icon className="h-[18px] w-[18px] text-ink-secondary" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 leading-tight">
        <dt className="text-xs font-medium text-ink-secondary">{label}</dt>
        <dd className="mt-0.5 truncate text-sm font-semibold text-ink">{value}</dd>
      </div>
    </div>
  );
}

function AboutCard({ project }: { project: ProjectDetail }) {
  return (
    <Card>
      <CardHeader title="About this project" />
      <p className={`mt-2 text-sm leading-6 ${project.description ? 'text-[#475467]' : 'text-ink-muted'}`}>
        {project.description ?? 'No description yet.'}
      </p>
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Fact icon={UserIcon} label="Owner" value={project.owner.full_name} />
        <Fact
          icon={Flag}
          label="Due date"
          value={project.due_date ? LONG_DATE.format(toDate(project.due_date)) : 'No due date'}
        />
        <Fact icon={CalendarDays} label="Created" value={LONG_DATE.format(toDate(project.created_at))} />
      </dl>
    </Card>
  );
}

function ProgressCard({ project, tasks }: { project: ProjectDetail; tasks: Task[] }) {
  const today = startOfToday();
  const overdue = tasks.filter((task) => isOverdue(task, today)).length;
  const rows = [
    ...(['todo', 'in_progress', 'done'] as const).map((status) => ({
      key: status,
      label: TASK_STATUS_META[status].label,
      color: TASK_STATUS_META[status].color,
      value: tasks.filter((task) => task.status === status).length,
      dot: <StatusDot status={status} />,
    })),
    {
      key: 'overdue',
      label: 'Overdue',
      color: OVERDUE_COLOR,
      value: overdue,
      dot: <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: OVERDUE_COLOR }} aria-hidden="true" />,
    },
  ];

  return (
    <Card>
      <CardHeader title="Progress" subtitle={`${project.tasks_done} of ${project.tasks_count} tasks done`} />
      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
        <ProgressRing
          value={project.progress}
          max={100}
          size={128}
          thickness={12}
          color={project.color}
          trackColor="#F2F4F7"
          ariaLabel={`Project progress: ${project.progress}%`}
        >
          <span className="text-[26px] font-extrabold leading-none text-ink">{project.progress}%</span>
          <span className="mt-1 text-xs font-medium text-ink-secondary">complete</span>
        </ProgressRing>
        <ul className="w-full min-w-0 flex-1 space-y-3">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-label">
                  {row.dot}
                  {row.label}
                </span>
                <span className="text-[13px] font-bold text-ink">{row.value}</span>
              </div>
              <ProgressBar
                value={row.value}
                max={Math.max(tasks.length, 1)}
                color={row.color}
                height={6}
                label={`${row.label}: ${row.value} of ${tasks.length} tasks`}
              />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function DeadlinesCard({ tasks, currentUserId, onViewTasks }: { tasks: Task[]; currentUserId: number; onViewTasks: () => void }) {
  const today = startOfToday();
  const open = tasks
    .filter((task) => task.status !== 'done' && task.due_date !== null)
    .sort((a, b) => toDate(a.due_date!).getTime() - toDate(b.due_date!).getTime() || a.id - b.id)
    .slice(0, DEADLINES_SHOWN);

  return (
    <Card>
      <CardHeader title="Upcoming deadlines" action={<ViewAll label="View all tasks" onClick={onViewTasks} />} />
      {open.length === 0 ? (
        <EmptyState icon={Clock} title="Nothing due" description="Open tasks with a due date will appear here." />
      ) : (
        <ul className="mt-3 divide-y divide-line-soft">
          {open.map((task) => {
            const late = isOverdue(task, today);
            const assignee = task.assignee;
            return (
              <li key={task.id} className="flex items-center gap-3 py-3">
                <StatusDot status={task.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{task.title}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-secondary">
                    {assignee
                      ? assignee.id === currentUserId
                        ? `${assignee.first_name} (you)`
                        : assignee.full_name
                      : 'Unassigned'}
                  </p>
                </div>
                {assignee && <Avatar name={assignee.full_name} size={26} />}
                <span
                  className={`w-[72px] shrink-0 text-right text-[13px] font-semibold ${late ? 'text-[#D92D20]' : 'text-[#475467]'}`}
                >
                  {late ? 'Overdue' : shortDate(task.due_date!)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RecentActivityCard({ projectId, refreshKey, onViewActivity }: { projectId: number; refreshKey: number; onViewActivity: () => void }) {
  const [entries, setEntries] = useState<ProjectActivityEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProjectActivity(projectId, { page_size: RECENT_ACTIVITY })
      .then((page) => {
        if (cancelled) return;
        setEntries(page.items);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  return (
    <Card>
      <CardHeader title="Recent activity" action={<ViewAll label="View all" onClick={onViewActivity} />} />
      {failed ? (
        <p className="mt-3 text-[13px] text-ink-secondary">Unable to load the activity.</p>
      ) : entries && entries.length === 0 ? (
        <EmptyState icon={Clock} title="No activity yet" description="Task, member and file changes will appear here." />
      ) : (
        <ul className="mt-4 space-y-4">
          {entries
            ? entries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3">
                  <ActivityIcon type={entry.type} size={32} />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-5 text-[#475467]">
                      <ActivitySentence entry={entry} withActor />
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{relativeTime(entry.created_at)}</p>
                  </div>
                </li>
              ))
            : Array.from({ length: 3 }, (_, index) => (
                <li key={index} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-4 flex-1" />
                </li>
              ))}
        </ul>
      )}
    </Card>
  );
}

export interface ProjectOverviewProps {
  project: ProjectDetail | null;
  tasks: Task[] | null;
  currentUserId: number;
  refreshKey: number;
  onViewTasks: () => void;
  onViewActivity: () => void;
}

export function ProjectOverview({ project, tasks, currentUserId, refreshKey, onViewTasks, onViewActivity }: ProjectOverviewProps) {
  if (!project || !tasks) {
    return (
      <div className="min-w-0 space-y-5">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <AboutCard project={project} />
      <ProgressCard project={project} tasks={tasks} />
      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
        <DeadlinesCard tasks={tasks} currentUserId={currentUserId} onViewTasks={onViewTasks} />
        <RecentActivityCard projectId={project.id} refreshKey={refreshKey} onViewActivity={onViewActivity} />
      </div>
    </div>
  );
}

export default ProjectOverview;
