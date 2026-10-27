import { useCallback, useEffect, useState } from 'react';

import { apiErrorMessage } from '../../../api/client';
import { getDashboard } from '../../../api/users';
import { Alert } from '../../../components/ui/Alert';
import { useAuth } from '../../../hooks/useAuth';
import { useWorkspace } from '../../../layouts/UserLayout';
import type { Dashboard, Task } from '../../../types/task';
import { useStatusUpdater } from '../tasks/StatusMenu';
import { HeroCard } from './HeroCard';
import { MyProjectsCard } from './MyProjectsCard';
import { StatCards } from './StatCards';
import { TodayFocus } from './TodayFocus';
import { WeekStrip } from './WeekStrip';

export function HomePage() {
  const { user } = useAuth();
  const { refreshKey, notifyChanged, openNewTask } = useWorkspace();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load your workspace.')));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // The same task can appear in several focus lists: update it everywhere.
  const updateTask = useCallback((taskId: number, next: (task: Task) => Task) => {
    const apply = (tasks: Task[]) => tasks.map((task) => (task.id === taskId ? next(task) : task));
    setData((current) =>
      current && {
        ...current,
        focus: {
          ...current.focus,
          today: apply(current.focus.today),
          upcoming: apply(current.focus.upcoming),
          overdue: apply(current.focus.overdue),
        },
      },
    );
  }, []);
  const status = useStatusUpdater(updateTask, notifyChanged);

  return (
    <div className="space-y-6">
      <HeroCard firstName={user?.first_name ?? ''} hero={data?.hero ?? null} onAddTask={() => openNewTask()} />
      {(error || status.error) && <Alert variant="error">{error ?? status.error}</Alert>}
      <StatCards stats={data?.stats ?? null} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <TodayFocus focus={data?.focus ?? null} onToggle={status.change} />
        <div className="space-y-6">
          <MyProjectsCard projects={data?.my_projects ?? null} />
          <WeekStrip week={data?.week ?? null} nextDeadline={data?.next_deadline ?? null} />
        </div>
      </div>
    </div>
  );
}

export default HomePage;
