import {
  Clock,
  Folder,
  SquareCheck,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Sparkline } from '../../../components/charts/Sparkline';
import { Card, Skeleton } from '../../../components/ui/Card';
import { formatNumber } from '../../../lib/format';
import type { Kpi, KpiKey } from '../../../types';

const KPI_STYLES: Record<KpiKey, { icon: LucideIcon; color: string; bg: string }> = {
  users: { icon: Users, color: '#4F46E5', bg: '#EEF2FF' },
  projects: { icon: Folder, color: '#0D9488', bg: '#F0FDF9' },
  completed: { icon: SquareCheck, color: '#16A34A', bg: '#ECFDF3' },
  overdue: { icon: Clock, color: '#DC2626', bg: '#FEF3F2' },
};

export interface KpiCardProps {
  kpi: Kpi;
  /** "vs last month", "vs last week"… */
  comparisonLabel: string;
}

export function KpiCard({ kpi, comparisonLabel }: KpiCardProps) {
  const { icon: Icon, color, bg } = KPI_STYLES[kpi.key];
  // Fewer overdue tasks is good news; for every other KPI growth is.
  const favorable = kpi.key === 'overdue' ? kpi.delta <= 0 : kpi.delta >= 0;
  const Trend = kpi.delta < 0 ? TrendingDown : TrendingUp;

  return (
    <Card padding="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-secondary">{kpi.label}</p>
          <p className="mt-1 text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            {formatNumber(kpi.value)}
          </p>
        </div>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]"
          style={{ backgroundColor: bg, color }}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
              favorable ? 'bg-[#ECFDF3] text-[#067647]' : 'bg-[#FEF3F2] text-[#B42318]'
            }`}
          >
            <Trend className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            {Math.abs(kpi.delta)}%
            <span className="sr-only">{kpi.delta < 0 ? 'decrease' : 'increase'}</span>
          </span>
          <span className="text-xs font-medium text-ink-muted">{comparisonLabel}</span>
        </div>
        <Sparkline values={kpi.sparkline} color={color} />
      </div>
    </Card>
  );
}

export function KpiCardSkeleton() {
  return (
    <Card padding="p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-16" />
      <Skeleton className="mt-5 h-5 w-full" />
    </Card>
  );
}

export default KpiCard;
