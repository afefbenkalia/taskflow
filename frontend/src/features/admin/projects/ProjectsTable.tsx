import { Archive, ArchiveRestore, Folder, MoreHorizontal, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Avatar } from '../../../components/ui/Avatar';
import { AvatarStack } from '../../../components/ui/AvatarStack';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { Table, type Column } from '../../../components/ui/Table';
import { shortDate } from '../../../lib/format';
import type { Project, ProjectHealth } from '../../../types/project';

export const HEALTH_STYLES: Record<ProjectHealth, { label: string; tone: BadgeTone }> = {
  on_track: { label: 'On track', tone: 'green' },
  at_risk: { label: 'At risk', tone: 'amber' },
  overdue: { label: 'Overdue', tone: 'red' },
  completed: { label: 'Completed', tone: 'blue' },
};

const COMPLETE_COLOR = '#12B76A';

export type ProjectAction = 'archive' | 'unarchive' | 'delete';

export interface ProjectsTableProps {
  projects: Project[];
  loading: boolean;
  footer?: ReactNode;
  onAction: (project: Project, action: ProjectAction) => void;
}

export function ProjectsTable({ projects, loading, footer, onAction }: ProjectsTableProps) {
  const columns: Column<Project>[] = [
    {
      key: 'project',
      header: 'Project',
      render: (project) => (
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px]"
            style={{ backgroundColor: `${project.color}1A` }}
            aria-hidden="true"
          >
            <Folder className="h-[18px] w-[18px]" style={{ color: project.color }} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold text-ink">{project.name}</p>
            <p className="mt-0.5 font-mono text-xs text-ink-muted">{project.key}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      width: 170,
      render: (project) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={project.owner.full_name} size={26} />
          <span className="truncate text-[13px] font-medium text-ink-label">{project.owner.full_name}</span>
        </div>
      ),
    },
    {
      key: 'members',
      header: 'Members',
      width: 100,
      render: (project) => (
        <AvatarStack names={project.members.map((member) => member.full_name)} size={26} />
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: 160,
      render: (project) => (
        <div className="flex items-center gap-2.5">
          <ProgressBar
            value={project.progress}
            width={100}
            height={6}
            color={project.progress >= 100 ? COMPLETE_COLOR : project.color}
            label={`${project.name} progress`}
          />
          <span className="text-[13px] font-bold text-ink">{project.progress}%</span>
        </div>
      ),
    },
    {
      key: 'tasks',
      header: 'Tasks',
      width: 80,
      render: (project) => (
        <span className="text-[13px] font-semibold text-[#475467]">
          {project.tasks_done} / {project.tasks_total}
        </span>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      width: 80,
      render: (project) => (
        <span
          className={`text-[13px] font-medium ${project.health === 'overdue' ? 'text-[#D92D20]' : 'text-ink-secondary'}`}
        >
          {project.due_date ? shortDate(project.due_date) : '—'}
        </span>
      ),
    },
    {
      key: 'health',
      header: 'Health',
      width: 110,
      render: (project) => {
        const style = HEALTH_STYLES[project.health];
        return <Badge tone={style.tone}>{style.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: 24,
      align: 'right',
      render: (project) => (
        <DropdownMenu
          ariaLabel={`More actions for ${project.name}`}
          triggerClassName="rounded-lg p-1 text-ink-secondary transition hover:bg-app hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          trigger={<MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
          items={[
            project.archived
              ? { key: 'unarchive', label: 'Unarchive project', icon: ArchiveRestore,
                  onSelect: () => onAction(project, 'unarchive') }
              : { key: 'archive', label: 'Archive project', icon: Archive,
                  onSelect: () => onAction(project, 'archive') },
            { key: 'delete', label: 'Delete project', icon: Trash2, danger: true, separatorBefore: true,
              onSelect: () => onAction(project, 'delete') },
          ]}
        />
      ),
    },
  ];

  return (
    <Table
      caption="Projects"
      columns={columns}
      rows={projects}
      getRowKey={(project) => project.id}
      loading={loading}
      minWidth={1060}
      footer={footer}
    />
  );
}

export default ProjectsTable;
