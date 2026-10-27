import { History } from 'lucide-react';
import { useCallback } from 'react';

import { getProjectActivity } from '../../../api/projects';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ActivityTimeline, useActivityFeed } from '../activity/ActivityTimeline';

const PAGE_SIZE = 20;

export function ActivityTab({ projectId, refreshKey }: { projectId: number; refreshKey: number }) {
  const fetchPage = useCallback(
    (page: number) => getProjectActivity(projectId, { page, page_size: PAGE_SIZE }),
    [projectId],
  );
  // refreshKey: reload after task changes made elsewhere in the workspace.
  const feed = useActivityFeed(fetchPage, refreshKey);

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h2 className="text-base font-bold text-ink">Activity</h2>
        <p className="mt-0.5 text-[13px] text-ink-secondary">Task, member and file changes in this project.</p>
      </div>

      {feed.error && <Alert variant="error">{feed.error}</Alert>}

      <ActivityTimeline
        entries={feed.entries}
        total={feed.total}
        loadingMore={feed.loadingMore}
        onLoadMore={feed.loadMore}
        empty={<EmptyState icon={History} title="No activity yet" description="Task, member and file changes will appear here." />}
      />
    </div>
  );
}

export default ActivityTab;
