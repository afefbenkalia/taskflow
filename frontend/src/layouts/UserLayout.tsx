import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';

import { getMeCounts } from '../api/users';
import { SidebarUser } from '../components/navigation/SidebarUser';
import { Topbar } from '../components/navigation/Topbar';
import { Toast } from '../components/ui/Alert';
import { avatarColors } from '../components/ui/Avatar';
import { NotificationsProvider, useNotifications } from '../context/NotificationsContext';
import { TaskFormModal, type TaskFormDefaults } from '../features/workspace/tasks/TaskFormModal';
import { useAuth } from '../hooks/useAuth';
import type { MeCounts } from '../types/user';

export interface WorkspaceContext {
  /** Changes after any task creation or status change: pages refetch on it. */
  refreshKey: number;
  notifyChanged: () => void;
  openNewTask: (defaults?: TaskFormDefaults) => void;
}

const FALLBACK_CONTEXT: WorkspaceContext = {
  refreshKey: 0,
  notifyChanged: () => undefined,
  openNewTask: () => undefined,
};

/**
 * Something new happened for the member (a task was assigned to them, a comment
 * was posted…): reload the workspace so My tasks, Home and projects show it.
 */
function RefreshOnNewNotifications({ onNew }: { onNew: () => void }) {
  const { unread } = useNotifications();
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (unread !== null && previous.current !== null && unread > previous.current) onNew();
    previous.current = unread;
  }, [unread, onNew]);
  return null;
}

/** Workspace helpers for pages rendered inside <UserLayout>. */
export function useWorkspace(): WorkspaceContext {
  return useOutletContext<WorkspaceContext | undefined>() ?? FALLBACK_CONTEXT;
}

export function UserLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [counts, setCounts] = useState<MeCounts | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [taskForm, setTaskForm] = useState<TaskFormDefaults | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMeCounts()
      .then((data) => !cancelled && setCounts(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname, refreshKey]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const notifyChanged = useCallback(() => setRefreshKey((key) => key + 1), []);
  const openNewTask = useCallback((defaults: TaskFormDefaults = {}) => setTaskForm(defaults), []);
  const closeToast = useCallback(() => setToast(null), []);

  const context = useMemo<WorkspaceContext>(
    () => ({ refreshKey, notifyChanged, openNewTask }),
    [refreshKey, notifyChanged, openNewTask],
  );

  const name = user?.full_name ?? '';
  const sidebar = (onNavigate?: () => void) => (
    <SidebarUser
      counts={counts}
      userName={name}
      onNewTask={() => {
        onNavigate?.();
        openNewTask();
      }}
      onLogout={handleLogout}
      onNavigate={onNavigate}
    />
  );

  const shell = (
    <div className="min-h-screen bg-app">
      <aside className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar()}</aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-[#0B1220]/50" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 shadow-2xl">{sidebar(() => setDrawerOpen(false))}</div>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-[264px]">
        <Topbar
          name={name}
          roleLabel="Member"
          avatarColors={avatarColors(name)}
          onLogout={handleLogout}
          profilePath="/app/profile"
          onMenuClick={() => setDrawerOpen(true)}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 xl:px-10 xl:py-8">
          <Outlet context={context} />
        </main>
      </div>

      <TaskFormModal
        open={taskForm !== null}
        defaults={taskForm ?? {}}
        onClose={() => setTaskForm(null)}
        onCreated={(task) => {
          setToast(`“${task.title}” was created.`);
          notifyChanged();
        }}
      />
      <Toast message={toast} onClose={closeToast} />
      <RefreshOnNewNotifications onNew={notifyChanged} />
    </div>
  );

  return <NotificationsProvider pagePath="/app/notifications">{shell}</NotificationsProvider>;
}

export default UserLayout;
