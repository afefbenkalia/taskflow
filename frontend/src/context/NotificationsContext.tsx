import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { getUnreadCount } from '../api/notifications';

/** How often the unread counter is refreshed while the app is open. */
export const NOTIFICATIONS_POLL_MS = 60_000;

export interface NotificationsContextValue {
  /** Unread notifications of the signed-in user; null until the first load. */
  unread: number | null;
  /** Re-reads the counter from the API. */
  refresh: () => void;
  /** Applies a local change right away (e.g. after "mark as read"). */
  setUnread: (update: (current: number) => number) => void;
  /** Path of the Notifications page for the current role. */
  pagePath: string;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Shared by the bell, the sidebar badge and the Notifications page of one layout. */
export function NotificationsProvider({ pagePath, children }: { pagePath: string; children: ReactNode }) {
  const [unread, setUnreadState] = useState<number | null>(null);
  const { pathname } = useLocation();

  const refresh = useCallback(() => {
    getUnreadCount()
      .then(setUnreadState)
      .catch(() => undefined);
  }, []);

  // On every navigation, then on a timer and when the tab regains focus.
  useEffect(refresh, [refresh, pathname]);
  useEffect(() => {
    const timer = window.setInterval(refresh, NOTIFICATIONS_POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const setUnread = useCallback(
    (update: (current: number) => number) => setUnreadState((current) => Math.max(0, update(current ?? 0))),
    [],
  );

  const value = useMemo(() => ({ unread, refresh, setUnread, pagePath }), [unread, refresh, setUnread, pagePath]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

const FALLBACK: NotificationsContextValue = {
  unread: null,
  refresh: () => undefined,
  setUnread: () => undefined,
  pagePath: '/',
};

/** Notification state of the current layout (inert outside a provider, e.g. in isolated tests). */
export function useNotifications(): NotificationsContextValue {
  return useContext(NotificationsContext) ?? FALLBACK;
}
