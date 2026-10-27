import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiErrorMessage } from '../../../api/client';
import { getMyTasks } from '../../../api/users';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, PageHeader, Skeleton } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useQueryState } from '../../../hooks/usePagination';
import { isoDate, pluralize, toDate } from '../../../lib/format';
import { useWorkspace } from '../../../layouts/UserLayout';
import type { Task } from '../../../types/task';
import { StatusSelect } from '../projects/StatusSelect';
import { PriorityBadge, useStatusUpdater } from '../tasks/StatusMenu';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CHIPS_PER_DAY = 2;
const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const MONTH_NAME = new Intl.DateTimeFormat('en-US', { month: 'long' });
const FULL_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const OVERDUE_RED = '#D92D20';

/** "2026-10" from the URL, or the current month. */
function parseMonth(value: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return new Date(Number(match[1]), month - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function monthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Monday-first weeks covering the whole month. */
function monthGrid(month: Date): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const end = addDays(last, (7 - last.getDay()) % 7);
  const weeks: Date[][] = [];
  for (let day = start; day <= end; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, offset) => addDays(day, offset)));
  }
  return weeks;
}

function isOverdue(task: Task, todayIso: string): boolean {
  return task.status !== 'done' && task.due_date !== null && task.due_date < todayIso;
}

function TaskChip({ task, todayIso }: { task: Task; todayIso: string }) {
  const done = task.status === 'done';
  const late = isOverdue(task, todayIso);
  return (
    <span
      className={`block truncate rounded-md border-l-[3px] bg-[#F9FAFB] px-1.5 py-0.5 text-left text-[11px] font-semibold ${
        done ? 'text-ink-muted line-through' : late ? 'text-[#B42318]' : 'text-ink-label'
      }`}
      style={{ borderLeftColor: late ? OVERDUE_RED : task.project.color }}
    >
      {task.title}
    </span>
  );
}

function DayPanel({
  day,
  tasks,
  todayIso,
  onStatusChange,
  onAddTask,
}: {
  day: Date;
  tasks: Task[] | null;
  todayIso: string;
  onStatusChange: (task: Task, status: Task['status']) => void;
  onAddTask: () => void;
}) {
  return (
    <Card padding="p-5" className="xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-ink">{FULL_DAY.format(day)}</h2>
          <p className="mt-0.5 text-xs font-medium text-ink-secondary">
            {tasks ? (tasks.length ? pluralize(tasks.length, 'task') + ' due' : 'Nothing due') : ' '}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={onAddTask}
          leftIcon={<Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
        >
          Add task
        </Button>
      </div>

      {tasks === null ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : tasks.length === 0 ? (
        <p className="mt-4 rounded-[10px] bg-[#F9FAFB] px-3.5 py-6 text-center text-[13px] text-ink-secondary">
          No tasks are due this day.
        </p>
      ) : (
        <ul className="mt-4 space-y-3" aria-label={`Tasks due ${FULL_DAY.format(day)}`}>
          {tasks.map((task) => (
            <li key={task.id} className="rounded-xl border border-line-soft p-3">
              <p className={`text-sm font-semibold ${task.status === 'done' ? 'text-ink-secondary line-through' : 'text-ink'}`}>
                {task.title}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
                <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: task.project.color }} aria-hidden="true" />
                <span className="truncate">{task.project.name}</span>
                <span className="text-ink-muted">· {task.key}</span>
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <StatusSelect task={task} onChange={onStatusChange} />
                <PriorityBadge priority={task.priority} />
                {isOverdue(task, todayIso) && (
                  <span className="text-xs font-semibold" style={{ color: OVERDUE_RED }}>
                    Overdue
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Month view of my tasks by due date. */
export function CalendarPage() {
  const { refreshKey, notifyChanged, openNewTask } = useWorkspace();
  const { get, update } = useQueryState();
  const month = parseMonth(get('month'));
  const monthKey = monthParam(month);
  const weeks = useMemo(() => monthGrid(parseMonth(monthKey)), [monthKey]);
  const gridStart = isoDate(weeks[0]![0]!);
  const gridEnd = isoDate(weeks[weeks.length - 1]![6]!);
  const todayIso = isoDate(new Date());

  // Selected day: from the URL when it is in this month, else today (this month) or the 1st.
  const dayParam = get('day');
  const selectedIso =
    dayParam.startsWith(`${monthKey}-`) && !Number.isNaN(toDate(dayParam).getTime())
      ? dayParam
      : todayIso.startsWith(`${monthKey}-`)
        ? todayIso
        : `${monthKey}-01`;

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTasks(null);
    setError(null);
    getMyTasks({ due_from: gridStart, due_to: gridEnd })
      .then((rows) => !cancelled && setTasks(rows))
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load your calendar.')));
    return () => {
      cancelled = true;
    };
  }, [gridStart, gridEnd, refreshKey]);

  const updateTask = useCallback(
    (taskId: number, next: (task: Task) => Task) =>
      setTasks((current) => current && current.map((task) => (task.id === taskId ? next(task) : task))),
    [],
  );
  const status = useStatusUpdater(updateTask, notifyChanged);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks ?? []) {
      if (!task.due_date) continue;
      map.set(task.due_date, [...(map.get(task.due_date) ?? []), task]);
    }
    return map;
  }, [tasks]);

  const inMonth = (tasks ?? []).filter((task) => task.due_date?.startsWith(`${monthKey}-`));
  const overdueInMonth = inMonth.filter((task) => isOverdue(task, todayIso)).length;

  const goTo = (target: Date, day?: string) => update({ month: monthParam(target), day: day ?? null });
  const shiftMonth = (delta: number) => goTo(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  const navButton =
    'inline-flex h-10 w-10 items-center justify-center rounded-field border border-line bg-white text-ink-label shadow-sm transition hover:bg-app focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        subtitle={
          tasks
            ? `${pluralize(inMonth.length, 'task')} due in ${MONTH_NAME.format(month)}${
                overdueInMonth ? ` · ${overdueInMonth} overdue` : ''
              }`
            : ' '
        }
        actions={
          <Button
            onClick={() => openNewTask({ dueDate: selectedIso })}
            leftIcon={<Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
          >
            New task
          </Button>
        }
      />

      {(error || status.error) && <Alert variant="error">{error ?? status.error}</Alert>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <Card padding="p-0" className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
            <h2 className="text-lg font-extrabold text-ink" aria-live="polite">
              {MONTH_LABEL.format(month)}
            </h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className={navButton}>
                <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              </button>
              <Button variant="secondary" onClick={() => goTo(new Date(), todayIso)}>
                Today
              </Button>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className={navButton}>
                <ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-line-soft bg-[#F9FAFB]" aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="py-2.5 text-center text-xs font-semibold text-ink-secondary">
                {weekday}
              </span>
            ))}
          </div>

          <div role="group" aria-label={`Days of ${MONTH_LABEL.format(month)}`}>
            {weeks.map((week) => (
              <div key={isoDate(week[0]!)} className="grid grid-cols-7 border-b border-line-soft last:border-b-0">
                {week.map((day) => {
                  const iso = isoDate(day);
                  const dayTasks = byDay.get(iso) ?? [];
                  const outside = day.getMonth() !== month.getMonth();
                  const selected = iso === selectedIso;
                  const today = iso === todayIso;
                  const hidden = dayTasks.length - CHIPS_PER_DAY;
                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${FULL_DAY.format(day)}${today ? ' (today)' : ''}, ${
                        dayTasks.length ? pluralize(dayTasks.length, 'task') : 'no tasks'
                      }`}
                      onClick={() => (outside ? goTo(day, iso) : update({ day: iso }))}
                      className={`relative flex min-h-[64px] min-w-0 flex-col gap-1 border-r border-line-soft p-1.5 text-left transition last:border-r-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 sm:min-h-[104px] sm:p-2 ${
                        selected ? 'bg-[#F5F6FF]' : outside ? 'bg-[#FCFCFD] hover:bg-[#F9FAFB]' : 'hover:bg-[#F9FAFB]'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          today ? 'bg-primary text-white' : outside ? 'text-ink-muted' : selected ? 'text-[#4338CA]' : 'text-ink-label'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {tasks === null ? null : (
                        <>
                          {/* Phones: one dot per task (up to 3). */}
                          {dayTasks.length > 0 && (
                            <span className="flex gap-1 md:hidden" aria-hidden="true">
                              {dayTasks.slice(0, 3).map((task) => (
                                <span
                                  key={task.id}
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ backgroundColor: isOverdue(task, todayIso) ? OVERDUE_RED : task.project.color }}
                                />
                              ))}
                            </span>
                          )}
                          <span className="hidden min-w-0 space-y-1 md:block" aria-hidden="true">
                            {dayTasks.slice(0, CHIPS_PER_DAY).map((task) => (
                              <TaskChip key={task.id} task={task} todayIso={todayIso} />
                            ))}
                            {hidden > 0 && (
                              <span className="block px-1.5 text-[11px] font-semibold text-ink-secondary">+{hidden} more</span>
                            )}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {tasks !== null && inMonth.length === 0 && (
            <div className="border-t border-line-soft">
              <EmptyState
                icon={CalendarDays}
                title="No due dates this month"
                description="Tasks with a due date in this month will appear on the calendar."
              />
            </div>
          )}
        </Card>

        <DayPanel
          day={toDate(selectedIso)}
          tasks={tasks === null ? null : byDay.get(selectedIso) ?? []}
          todayIso={todayIso}
          onStatusChange={status.change}
          onAddTask={() => openNewTask({ dueDate: selectedIso })}
        />
      </div>
    </div>
  );
}

export default CalendarPage;
