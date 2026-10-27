import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { getSidebarCounts } from '../api/stats';
import { SidebarAdmin } from '../components/navigation/SidebarAdmin';
import { Topbar } from '../components/navigation/Topbar';
import { NotificationsProvider } from '../context/NotificationsContext';
import { useAuth } from '../hooks/useAuth';
import type { SidebarCounts } from '../types';

const TOPBAR_AVATAR = { bg: '#E0E7FF', fg: '#4338CA' };

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Refresh the sidebar counters whenever the admin navigates or filters.
  useEffect(() => {
    let cancelled = false;
    getSidebarCounts()
      .then((data) => !cancelled && setCounts(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname, search]);

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

  const name = user?.full_name ?? '';

  const shell = (
    <div className="min-h-screen bg-app">
      <aside className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <SidebarAdmin counts={counts} userName={name} onLogout={handleLogout} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-[#0B1220]/50" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 shadow-2xl">
            <SidebarAdmin
              counts={counts}
              userName={name}
              onLogout={handleLogout}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-[264px]">
        <Topbar
          name={name}
          roleLabel="Administrator"
          avatarColors={TOPBAR_AVATAR}
          onLogout={handleLogout}
          profilePath="/admin/profile"
          onMenuClick={() => setDrawerOpen(true)}
        />
        <main className="flex-1 space-y-6 px-4 py-6 sm:px-6 xl:px-10 xl:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );

  return <NotificationsProvider pagePath="/admin/notifications">{shell}</NotificationsProvider>;
}

export default AdminLayout;
