import { CalendarDays, Folder } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiErrorMessage } from '../../../api/client';
import { getMyProjects } from '../../../api/users';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Card, PageHeader, Skeleton } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { Tabs } from '../../../components/ui/Tabs';
import { useQueryState } from '../../../hooks/usePagination';
import { pluralize, shortDate } from '../../../lib/format';
import { useWorkspace } from '../../../layouts/UserLayout';
import type { MyProject, ProjectRole } from '../../../types/project';
import { HEALTH_STYLES } from '../../admin/projects/ProjectsTable';

type ProjectsTab = 'all' | 'owned' | 'member';

const TAB_ROLE: Record<ProjectsTab, ProjectRole | null> = { all: null, owned: 'owner', member: 'member' };

const ROLE_TAGS: Record<ProjectRole, { label: string; className: string }> = {
  owner: { label: 'Owner', className: 'bg-[#FFFAEB] text-[#B54708]' },
  member: { label: 'Member', className: 'bg-[#F2F4F7] text-[#475467]' },
};

const EMPTY_TEXT: Record<ProjectsTab, { title: string; description: string }> = {
  all: { title: 'No projects yet', description: 'Projects you join will appear here.' },
  owned: { title: 'You don’t own a project', description: 'Projects you own will appear here.' },
  member: { title: 'No shared projects', description: 'Projects you’re a member of will appear here.' },
};

function ProjectCard({ project }: { project: MyProject }) {
  const tag = ROLE_TAGS[project.my_role];
  const health = HEALTH_STYLES[project.health];
  return (
    <Link
      to={`/app/projects/${project.id}`}
      className="group block h-full rounded-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
    >
      <Card padding="p-5" className="h-full transition group-hover:border-[#C7D2FE]">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]"
            style={{ backgroundColor: `${project.color}1A`, color: project.color }}
            aria-hidden="true"
          >
            <Folder className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <span className="truncate text-[15px] font-bold text-ink">{project.name}</span>
              <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold ${tag.className}`}>{tag.label}</span>
            </p>
            <p className="mt-0.5 font-mono text-xs text-ink-muted">{project.key}</p>
          </div>
          <Badge tone={health.tone}>{health.label}</Badge>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <ProgressBar
            value={project.progress}
            height={6}
            color={project.progress >= 100 ? '#12B76A' : project.color}
            className="flex-1"
            label={`${project.name} progress`}
          />
          <span className="text-sm font-extrabold text-ink-label">{project.progress}%</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-ink-secondary">
          <span>
            {project.done}/{project.total} tasks done
          </span>
          <span className={`inline-flex items-center gap-1.5 ${project.health === 'overdue' ? 'font-semibold text-[#D92D20]' : ''}`}>
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            {project.due_date ? `Due ${shortDate(project.due_date)}` : 'No due date'}
          </span>
        </div>
      </Card>
    </Link>
  );
}

/** /app/projects: every active project of the member, filtered by tabs. */
export function MyProjectsPage() {
  const { refreshKey } = useWorkspace();
  const { get, update } = useQueryState();
  const tabParam = get('tab');
  const tab: ProjectsTab = tabParam === 'owned' || tabParam === 'member' ? tabParam : 'all';
  const [projects, setProjects] = useState<MyProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyProjects()
      .then((rows) => {
        if (cancelled) return;
        setProjects(rows);
        setError(null);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load your projects.')));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const counts = useMemo(() => {
    const rows = projects ?? [];
    return {
      all: rows.length,
      owned: rows.filter((project) => project.my_role === 'owner').length,
      member: rows.filter((project) => project.my_role === 'member').length,
    };
  }, [projects]);

  const visible = (projects ?? []).filter((project) => !TAB_ROLE[tab] || project.my_role === TAB_ROLE[tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My projects"
        subtitle={projects ? `You’re part of ${pluralize(projects.length, 'active project')}.` : ' '}
      />

      <Tabs
        ariaLabel="Projects"
        value={tab}
        onChange={(value) => update({ tab: value === 'all' ? null : value })}
        className="overflow-y-hidden"
        items={[
          { value: 'all', label: 'All', count: projects ? counts.all : undefined },
          { value: 'owned', label: 'Owned by me', count: projects ? counts.owned : undefined },
          { value: 'member', label: 'Member', count: projects ? counts.member : undefined },
        ]}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div role="tabpanel" aria-label="Projects">
        {projects === null && !error ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-[168px] w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState icon={Folder} {...EMPTY_TEXT[tab]} />
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {visible.map((project) => (
              <li key={project.id}>
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default MyProjectsPage;
