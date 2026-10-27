import { Folder } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, Skeleton } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import type { MyProject, ProjectRole } from '../../../types/project';

const ROLE_TAGS: Record<ProjectRole, { label: string; className: string }> = {
  owner: { label: 'Owner', className: 'bg-[#FFFAEB] text-[#B54708]' },
  member: { label: 'Member', className: 'bg-[#F2F4F7] text-[#475467]' },
};

export function MyProjectsCard({ projects }: { projects: MyProject[] | null }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold text-ink">My projects</h2>
        <Link to="/app/projects" className="text-[13px] font-bold text-primary hover:text-primary-700">
          View all
        </Link>
      </div>

      {!projects ? (
        <div className="mt-4 space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={Folder} title="No projects yet" description="Projects you join will appear here." />
      ) : (
        <ul className="mt-4 space-y-3">
          {projects.map((project) => {
            const tag = ROLE_TAGS[project.my_role];
            return (
              <li key={project.id}>
                <Link
                  to={`/app/projects/${project.id}`}
                  className="block rounded-xl p-2 -mx-2 transition hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                      style={{ backgroundColor: `${project.color}1A`, color: project.color }}
                      aria-hidden="true"
                    >
                      <Folder className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-ink">{project.name}</span>
                        <span className={`rounded px-1.5 py-px text-[10px] font-bold ${tag.className}`}>{tag.label}</span>
                      </p>
                      <p className="text-xs font-medium text-ink-muted">
                        {project.done}/{project.total} tasks
                      </p>
                    </div>
                    <span className="text-sm font-extrabold text-ink-label">{project.progress}%</span>
                  </div>
                  <ProgressBar
                    value={project.progress}
                    height={6}
                    color={project.color}
                    className="mt-2.5"
                    label={`${project.name} progress`}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default MyProjectsCard;
