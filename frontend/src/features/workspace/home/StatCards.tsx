import { Calendar, Check, SquareCheck, type LucideIcon } from 'lucide-react';

import { Card, Skeleton } from '../../../components/ui/Card';
import type { Dashboard } from '../../../types/task';

interface StatCard {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  value: number;
  note: string;
  noteColor: string;
}

function cardsFor(stats: Dashboard['stats']): StatCard[] {
  const delta = stats.completed_this_month - stats.completed_prev_month;
  return [
    {
      label: 'Assigned to me',
      icon: SquareCheck,
      color: '#4F46E5',
      bg: '#EEF2FF',
      value: stats.assigned_open,
      note: `${stats.high_priority} high priority`,
      noteColor: '#B54708',
    },
    {
      label: 'Due this week',
      icon: Calendar,
      color: '#D97706',
      bg: '#FFFAEB',
      value: stats.due_this_week,
      note: `${stats.overdue} overdue`,
      noteColor: '#B42318',
    },
    {
      label: 'Completed this month',
      icon: Check,
      color: '#16A34A',
      bg: '#ECFDF3',
      value: stats.completed_this_month,
      note: `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} vs ${stats.prev_month_label}`,
      noteColor: delta >= 0 ? '#067647' : '#B42318',
    },
  ];
}

export function StatCards({ stats }: { stats: Dashboard['stats'] | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} padding="p-5">
            <Skeleton className="h-12 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {cardsFor(stats).map(({ label, icon: Icon, color, bg, value, note, noteColor }) => (
        <Card key={label} padding="p-5" className="flex items-center gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px]"
            style={{ backgroundColor: bg, color }}
            aria-hidden="true"
          >
            <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink-secondary">{label}</p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[26px] font-extrabold leading-tight text-ink">{value}</span>
              <span className="text-xs font-bold" style={{ color: noteColor }}>
                {note}
              </span>
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default StatCards;
