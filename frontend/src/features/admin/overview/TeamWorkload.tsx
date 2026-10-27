import { Link } from 'react-router-dom';

import { Avatar } from '../../../components/ui/Avatar';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Card, CardHeader, Skeleton } from '../../../components/ui/Card';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { ROLE_LABELS } from '../../../lib/format';
import type { WorkloadEntry } from '../../../types';

interface Level {
  label: string;
  tone: BadgeTone;
  color: string;
}

export function workloadLevel(openTasks: number, capacity: number): Level {
  if (openTasks >= capacity) return { label: 'At capacity', tone: 'red', color: '#F04438' };
  if (openTasks >= capacity - 2) return { label: 'High', tone: 'amber', color: '#F79009' };
  return { label: 'Balanced', tone: 'green', color: '#4F46E5' };
}

export function TeamWorkload({ entries }: { entries: WorkloadEntry[] | null }) {
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Team workload"
        subtitle="Open tasks per member (capacity 10)"
        action={
          <Link to="/admin/users" className="text-[13px] font-bold text-primary hover:text-primary-700">
            Manage users →
          </Link>
        }
      />
      <ul className="mt-3">
        {entries
          ? entries.map(({ user, open_tasks: openTasks, capacity }) => {
              const level = workloadLevel(openTasks, capacity);
              return (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#F2F4F7] py-3 last:border-b-0"
                >
                  <div className="flex w-[220px] min-w-0 items-center gap-3">
                    <Avatar name={user.full_name} size={34} />
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-sm font-semibold text-ink">{user.full_name}</p>
                      <p className={`text-xs ${user.role === 'admin' ? 'text-[#B54708]' : 'text-ink-muted'}`}>
                        {ROLE_LABELS[user.role]}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-1 items-center gap-3">
                    <ProgressBar
                      value={openTasks}
                      max={capacity}
                      width={240}
                      height={8}
                      color={level.color}
                      label={`${user.full_name} workload`}
                      className="max-w-full"
                    />
                    <span className="whitespace-nowrap text-[13px] font-bold text-ink">
                      {openTasks} / {capacity}
                    </span>
                  </div>
                  <Badge tone={level.tone}>{level.label}</Badge>
                </li>
              );
            })
          : Array.from({ length: 4 }, (_, index) => (
              <li key={index} className="flex items-center gap-4 border-b border-[#F2F4F7] py-3 last:border-b-0">
                <Skeleton className="h-[34px] w-[34px] rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </li>
            ))}
      </ul>
    </Card>
  );
}

export default TeamWorkload;
