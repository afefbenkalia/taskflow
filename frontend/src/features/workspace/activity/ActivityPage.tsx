import { History } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getMyActivity, getMyProjects } from '../../../api/users';
import { Alert } from '../../../components/ui/Alert';
import { PageHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { FilterSelect, type SelectOption } from '../../../components/ui/Select';
import { useQueryState } from '../../../hooks/usePagination';
import { useWorkspace } from '../../../layouts/UserLayout';
import type { WorkspaceActivityEntry } from '../../../types/activity';
import { ActivityTimeline, useActivityFeed } from './ActivityTimeline';

const PAGE_SIZE = 20;

type Who = 'everyone' | 'mine';

const WHO_OPTIONS: { value: Who; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'mine', label: 'Only me' },
];

function ProjectTag({ entry }: { entry: WorkspaceActivityEntry }) {
  if (!entry.project) return null;
  return (
    <Link
      to={`/app/projects/${entry.project.id}?tab=activity`}
      className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md text-xs font-semibold text-ink-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: entry.project.color }} aria-hidden="true" />
      <span className="truncate">{entry.project.name}</span>
    </Link>
  );
}

/** Everything that happened across the member's projects. */
export function ActivityPage() {
  const { refreshKey } = useWorkspace();
  const { get, update } = useQueryState();
  const projectId = get('project_id');
  const who: Who = get('who') === 'mine' ? 'mine' : 'everyone';
  const [projectOptions, setProjectOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    getMyProjects()
      .then((projects) => setProjectOptions(projects.map((project) => ({ value: String(project.id), label: project.name }))))
      .catch(() => undefined);
  }, [refreshKey]);

  const fetchPage = useCallback(
    (page: number) =>
      getMyActivity({
        project_id: projectId ? Number(projectId) : undefined,
        mine: who === 'mine',
        page,
        page_size: PAGE_SIZE,
      }),
    [projectId, who],
  );
  const feed = useActivityFeed(fetchPage, refreshKey);
  const filtered = Boolean(projectId) || who === 'mine';
  const projectLabel = projectOptions.find((option) => option.value === projectId)?.label ?? 'All';

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" subtitle="What’s been happening across your projects." />

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label={`Project: ${projectLabel}`}
          showValue={false}
          value={projectId}
          options={projectOptions}
          allLabel="All projects"
          onChange={(value) => update({ project_id: value })}
          width={240}
        />
        <SegmentedControl
          ariaLabel="People"
          options={WHO_OPTIONS}
          value={who}
          onChange={(value) => update({ who: value === 'mine' ? value : null })}
        />
      </div>

      {feed.error && <Alert variant="error">{feed.error}</Alert>}

      <ActivityTimeline
        entries={feed.entries}
        total={feed.total}
        loadingMore={feed.loadingMore}
        onLoadMore={feed.loadMore}
        renderMeta={(entry) => <ProjectTag entry={entry} />}
        empty={
          <EmptyState
            icon={History}
            title={filtered ? 'No matching activity' : 'No activity yet'}
            description={
              filtered
                ? 'Try another project or show everyone’s activity.'
                : 'Task, member and file changes in your projects will appear here.'
            }
          />
        }
      />
    </div>
  );
}

export default ActivityPage;
