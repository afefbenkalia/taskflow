import { Card, Skeleton } from '../../../components/ui/Card';
import { toDate } from '../../../lib/format';
import type { Dashboard } from '../../../types/task';

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const DEADLINE_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export interface WeekStripProps {
  week: Dashboard['week'] | null;
  nextDeadline: Dashboard['next_deadline'];
}

export function WeekStrip({ week, nextDeadline }: WeekStripProps) {
  const todayKey = new Date().toDateString();

  return (
    <Card>
      <h2 className="text-[17px] font-bold text-ink">This week</h2>

      {!week ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : (
        <ol className="mt-4 grid grid-cols-7 gap-1">
          {week.map((day) => {
            const date = toDate(day.date);
            const isToday = date.toDateString() === todayKey;
            return (
              <li
                key={day.date}
                aria-current={isToday ? 'date' : undefined}
                className={`flex flex-col items-center gap-1 rounded-[10px] py-2 ${isToday ? 'bg-primary' : ''}`}
              >
                <span className={`text-[11px] font-semibold ${isToday ? 'text-[#C7D2FE]' : 'text-ink-muted'}`}>
                  {WEEKDAY.format(date)}
                </span>
                <span className={`text-[15px] font-extrabold ${isToday ? 'text-white' : 'text-ink'}`}>
                  {date.getDate()}
                </span>
                <span
                  className={`h-[5px] w-[5px] rounded-full ${
                    day.has_due ? (isToday ? 'bg-white' : 'bg-[#F04438]') : 'bg-transparent'
                  }`}
                  aria-label={day.has_due ? 'Tasks due' : undefined}
                />
              </li>
            );
          })}
        </ol>
      )}

      {nextDeadline && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#F9FAFB] px-3.5 py-3">
          <span className="h-9 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{nextDeadline.title}</p>
            <p className="truncate text-xs font-medium text-ink-secondary">
              {nextDeadline.due_date && DEADLINE_DATE.format(toDate(nextDeadline.due_date))} ·{' '}
              {nextDeadline.project.name}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default WeekStrip;
