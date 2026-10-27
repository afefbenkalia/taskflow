import { Bell, CheckCheck } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiErrorMessage } from '../../api/client';
import { getNotifications, markAllNotificationsRead } from '../../api/notifications';
import { useNotifications } from '../../context/NotificationsContext';
import type { AppNotification } from '../../types/notification';
import { Skeleton } from '../ui/Card';
import { NotificationItem, useOpenNotification } from './NotificationItem';

const PANEL_SIZE = 6;

export function unreadBadge(count: number): string {
  return count > 9 ? '9+' : String(count);
}

/** Top bar bell: unread badge and a panel with the latest notifications. */
export function NotificationBell() {
  const { unread, setUnread, refresh, pagePath } = useNotifications();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const replace = useCallback(
    (next: AppNotification) => setItems((current) => current && current.map((item) => (item.id === next.id ? next : item))),
    [],
  );
  const { open: openNotification } = useOpenNotification(replace);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setItems(null);
    setError(null);
    getNotifications({ page_size: PANEL_SIZE })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        // The panel is fresher than the poll: align the badge.
        setUnread(() => page.unread_count);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load notifications.')));

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setUnread]);

  const markAll = async () => {
    setError(null);
    try {
      await markAllNotificationsRead();
      setItems((current) => current && current.map((item) => ({ ...item, read: true })));
      setUnread(() => 0);
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Unable to mark notifications as read.'));
      refresh();
    }
  };

  const count = unread ?? 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="relative rounded-lg p-1 text-ink-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Bell className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" />
        {count > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-white bg-[#F04438] px-1 text-[10px] font-bold leading-none text-white"
            aria-hidden="true"
          >
            {unreadBadge(count)}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-4 top-[76px] z-50 overflow-hidden rounded-card border border-line-soft bg-white shadow-[0_12px_32px_-4px_rgba(16,24,40,0.16)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[380px]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
            <p className="text-[15px] font-bold text-ink">
              Notifications
              {count > 0 && <span className="ml-2 text-[13px] font-semibold text-ink-secondary">{count} unread</span>}
            </p>
            <button
              type="button"
              onClick={markAll}
              disabled={count === 0}
              className="inline-flex items-center gap-1.5 rounded-md text-[13px] font-bold text-primary hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-default disabled:text-ink-muted"
            >
              <CheckCheck className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              Mark all as read
            </button>
          </div>

          <div className="max-h-[min(420px,calc(100vh-200px))] overflow-y-auto">
            {error ? (
              <p className="px-4 py-6 text-center text-[13px] text-[#B42318]">{error}</p>
            ) : items === null ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm font-bold text-ink">You’re all caught up</p>
                <p className="mt-1 text-[13px] text-ink-secondary">New notifications will show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line-soft">
                {items.map((item) => (
                  <li key={item.id}>
                    <NotificationItem
                      notification={item}
                      compact
                      onOpen={(notification) => {
                        setOpen(false);
                        openNotification(notification);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line-soft px-4 py-3 text-center">
            <Link
              to={pagePath}
              onClick={() => setOpen(false)}
              className="rounded-md text-[13px] font-bold text-primary hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
