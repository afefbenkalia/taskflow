import { Link } from 'react-router-dom';

import { Card, CardHeader, Skeleton } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { relativeTime } from '../../../lib/format';
import type { ActivityEntry } from '../../../types/activity';
import { ActivityIcon, ActivitySentence } from '../activity/AuditTable';

export function AdminActivity({ entries }: { entries: ActivityEntry[] | null }) {
  return (
    <Card className="w-full xl:w-[360px]">
      <CardHeader
        title="Admin activity"
        action={
          <Link to="/admin/activity" className="text-[13px] font-bold text-primary hover:text-primary-700">
            View log
          </Link>
        }
      />
      {entries && entries.length === 0 ? (
        <EmptyState title="No activity yet" description="Administrative actions will appear here." />
      ) : (
        <ul className="mt-4 space-y-4">
          {entries
            ? entries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3">
                  <ActivityIcon type={entry.type} size={34} />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-5 text-[#475467]">
                      <ActivitySentence entry={entry} withActor />
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{relativeTime(entry.created_at)}</p>
                  </div>
                </li>
              ))
            : Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="flex items-center gap-3">
                  <Skeleton className="h-[34px] w-[34px]" />
                  <Skeleton className="h-4 flex-1" />
                </li>
              ))}
        </ul>
      )}
    </Card>
  );
}

export default AdminActivity;
