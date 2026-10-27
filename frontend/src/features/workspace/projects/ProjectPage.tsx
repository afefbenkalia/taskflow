import axios from 'axios';
import { ChevronRight, Folder, Plus, User as UserIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { apiErrorMessage } from '../../../api/client';
import {
  getProject,
  getProjectMembers,
  getProjectPermissions,
  getProjectTasks,
} from '../../../api/projects';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Card';
import { Toast } from '../../../components/ui/Alert';
import { Tabs } from '../../../components/ui/Tabs';
import { useAuth } from '../../../hooks/useAuth';
import { usePermission } from '../../../hooks/usePermission';
import { pluralize, toDate } from '../../../lib/format';
import { useWorkspace } from '../../../layouts/UserLayout';
import type { ProjectDetail, ProjectMember, ProjectPermission } from '../../../types/project';
import type { Task } from '../../../types/task';
import { HEALTH_STYLES } from '../../admin/projects/ProjectsTable';
import { NotFoundPage } from '../../errors/NotFoundPage';
import { useStatusUpdater } from '../tasks/StatusMenu';
import { TaskDetailsModal } from '../tasks/TaskDetailsModal';
import { ActivityTab } from './ActivityTab';
import { FilesTab } from './FilesTab';
import { MembersPanel } from './MembersPanel';
import { MembersTab } from './MembersTab';
import { ProjectOverview } from './ProjectOverview';
import { TaskTable } from './TaskTable';

const LONG_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const PROJECT_TABS = ['overview', 'tasks', 'members', 'activity', 'files'] as const;
type ProjectTab = (typeof PROJECT_TABS)[number];
const DEFAULT_TAB: ProjectTab = 'tasks';

function parseTab(value: string | null): ProjectTab {
  return PROJECT_TABS.find((tab) => tab === value) ?? DEFAULT_TAB;
}

function ProjectHeader({ project, onAddTask, canCreate }: { project: ProjectDetail; onAddTask: () => void; canCreate: boolean }) {
  const health = HEALTH_STYLES[project.health];
  const owner = project.my_role === 'owner';

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <span
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[15px]"
          style={{ backgroundColor: `${project.color}1A`, color: project.color }}
          aria-hidden="true"
        >
          <Folder className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink">{project.name}</h1>
            <Badge tone={health.tone}>{health.label}</Badge>
            <Badge tone="indigo" icon={<UserIcon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />}>
              {owner ? 'You’re the owner' : 'You’re a member'}
            </Badge>
          </div>
          <p className="mt-1 text-sm font-medium text-ink-secondary">
            Owned by {project.owner.full_name}
            {project.due_date && ` · Due ${LONG_DATE.format(toDate(project.due_date))}`} ·{' '}
            {pluralize(project.members_count, 'member')}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onAddTask}
          disabled={!canCreate}
          leftIcon={<Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
        >
          Add task
        </Button>
      </div>
    </div>
  );
}

export function ProjectPage() {
  const { projectId } = useParams();
  const id = Number(projectId);
  const { user } = useAuth();
  const { refreshKey, notifyChanged, openNewTask } = useWorkspace();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [permissions, setPermissions] = useState<ProjectPermission[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const can = usePermission(permissions);

  const openTab = useCallback(
    (next: ProjectTab) =>
      setSearchParams(
        (params) => {
          if (next === DEFAULT_TAB) params.delete('tab');
          else params.set('tab', next);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  const closeToast = useCallback(() => setToast(null), []);
  const setFilesCount = useCallback(
    (count: number) => setProject((current) => current && { ...current, files_count: count }),
    [],
  );

  useEffect(() => {
    if (!Number.isInteger(id)) {
      setNotFound(true);
      return undefined;
    }
    let cancelled = false;
    setNotFound(false);
    Promise.all([getProject(id), getProjectTasks(id), getProjectMembers(id), getProjectPermissions(id)])
      .then(([detail, projectTasks, projectMembers, projectPermissions]) => {
        if (cancelled) return;
        setProject(detail);
        setTasks(projectTasks);
        setMembers(projectMembers);
        setPermissions(projectPermissions);
        setError(null);
      })
      .catch((reason) => {
        if (cancelled) return;
        if (axios.isAxiosError(reason) && reason.response?.status === 404) setNotFound(true);
        else setError(apiErrorMessage(reason, 'Unable to load this project.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  // Reset when switching to another project.
  useEffect(() => {
    setProject(null);
    setTasks(null);
    setMembers(null);
    setPermissions(null);
  }, [id]);

  const updateTask = useCallback(
    (taskId: number, next: (task: Task) => Task) =>
      setTasks((current) => current && current.map((task) => (task.id === taskId ? next(task) : task))),
    [],
  );
  const status = useStatusUpdater(updateTask, notifyChanged);
  const addTask = () => openNewTask({ projectId: id, lockProject: true });
  const currentUserId = user?.id ?? 0;

  if (notFound) return <NotFoundPage embedded />;

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] font-semibold">
        <Link to="/app/projects" className="rounded text-ink-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
          My projects
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
        <span className="text-ink" aria-current="page">
          {project?.name ?? '…'}
        </span>
      </nav>

      {project ? (
        <ProjectHeader project={project} onAddTask={addTask} canCreate={can('create_tasks')} />
      ) : (
        <Skeleton className="h-[52px] w-2/3" />
      )}

      <Tabs
        ariaLabel="Project sections"
        value={tab}
        onChange={openTab}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'tasks', label: 'Tasks', count: project?.tasks_count },
          { value: 'members', label: 'Members', count: project?.members_count },
          { value: 'activity', label: 'Activity' },
          { value: 'files', label: 'Files', count: project?.files_count },
        ]}
      />

      {(error || status.error) && <Alert variant="error">{error ?? status.error}</Alert>}

      {/* The Members tab already lists the members: no side column there. */}
      <div className={`grid grid-cols-1 gap-5 ${tab === 'members' ? '' : 'xl:grid-cols-[minmax(0,1fr)_340px]'}`}>
        <div role="tabpanel" aria-label={tab.charAt(0).toUpperCase() + tab.slice(1)} className="min-w-0">
          {tab === 'overview' && (
            <ProjectOverview
              project={project}
              tasks={tasks}
              currentUserId={currentUserId}
              refreshKey={refreshKey}
              onViewTasks={() => openTab('tasks')}
              onViewActivity={() => openTab('activity')}
            />
          )}
          {tab === 'tasks' && (
            <TaskTable
              tasks={tasks}
              currentUserId={currentUserId}
              onStatusChange={status.change}
              onAdd={addTask}
              onOpen={(task) => setOpenTaskId(task.id)}
            />
          )}
          {tab === 'members' && (
            <MembersTab
              projectId={id}
              projectName={project?.name ?? ''}
              members={members}
              canManage={can('manage_members')}
              onChanged={(message) => {
                setToast(message);
                notifyChanged();
              }}
            />
          )}
          {tab === 'activity' && <ActivityTab projectId={id} refreshKey={refreshKey} />}
          {tab === 'files' && (
            <FilesTab
              projectId={id}
              currentUserId={currentUserId}
              canUpload={permissions !== null}
              onCountChange={setFilesCount}
            />
          )}
        </div>
        {tab !== 'members' && (
          <div className="space-y-5">
            <MembersPanel members={members} />
          </div>
        )}
      </div>
      <TaskDetailsModal
        task={tasks?.find((task) => task.id === openTaskId) ?? null}
        onClose={() => setOpenTaskId(null)}
        onCommentsChange={(task, count) => updateTask(task.id, (current) => ({ ...current, comments_count: count }))}
      />
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}

export default ProjectPage;
