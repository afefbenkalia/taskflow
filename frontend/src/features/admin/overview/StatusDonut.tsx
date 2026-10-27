import { TrendingDown, TrendingUp } from 'lucide-react';

import { DonutChart, type DonutSegment } from '../../../components/charts/DonutChart';
import { Card, CardHeader, Skeleton } from '../../../components/ui/Card';
import { pluralize } from '../../../lib/format';
import type { StatusBreakdown } from '../../../types';

export interface StatusDonutProps {
  status: StatusBreakdown | null;
  completionRate: number;
  completionDelta: number;
  /** "this month", "this week"… */
  periodLabel: string;
}

export function StatusDonut({ status, completionRate, completionDelta, periodLabel }: StatusDonutProps) {
  const segments: DonutSegment[] = status
    ? [
        { key: 'done', label: 'Done', value: status.done, color: '#4F46E5' },
        { key: 'in_progress', label: 'In progress', value: status.in_progress, color: '#8B5CF6' },
        { key: 'todo', label: 'To do', value: status.todo, color: '#C7D2FE' },
        { key: 'overdue', label: 'Overdue', value: status.overdue, color: '#F04438' },
      ]
    : [];
  const Trend = completionDelta < 0 ? TrendingDown : TrendingUp;

  return (
    <Card className="flex w-full flex-col xl:w-[360px]">
      <CardHeader
        title="Tasks by status"
        subtitle={
          status
            ? `${status.total} tasks across ${pluralize(status.projects, 'project')}`
            : ' '
        }
      />
      {status ? (
        <>
          <div className="mt-5 flex items-center gap-6">
            <DonutChart segments={segments} ariaLabel="Tasks by status">
              <span className="text-2xl font-extrabold leading-none text-ink">{status.total}</span>
              <span className="mt-1 text-xs font-medium text-ink-secondary">tasks</span>
            </DonutChart>
            <ul className="min-w-0 flex-1 space-y-2.5">
              {segments.map((segment) => (
                <li key={segment.key} className="flex items-center gap-2 text-[13px]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: segment.color }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-[#475467]">{segment.label}</span>
                  <span className="font-bold text-ink">{segment.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-auto pt-5">
            <p className="flex items-center gap-2 rounded-xl bg-[#F9FAFB] px-3 py-2.5 text-[13px] text-[#475467]">
              <Trend
                className={`h-4 w-4 shrink-0 ${completionDelta < 0 ? 'text-[#D92D20]' : 'text-[#12B76A]'}`}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span>
                Completion rate <strong className="font-bold text-ink">{completionRate}%</strong> —{' '}
                {completionDelta < 0 ? 'down' : 'up'} {Math.abs(completionDelta)} pts {periodLabel}
              </span>
            </p>
          </div>
        </>
      ) : (
        <Skeleton className="mt-5 h-[180px] w-full" />
      )}
    </Card>
  );
}

export default StatusDonut;
