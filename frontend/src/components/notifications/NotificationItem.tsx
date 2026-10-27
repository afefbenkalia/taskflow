import { Bell } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { markNotificationRead } from '../../api/notifications';
import { useNotifications } from '../../context/NotificationsContext';
import type { GlobalSearchState } from '../navigation/GlobalSearch';
import { relativeTime } from '../../lib/format';
import type { AppNotification } from '../../types/notification';
import { Avatar } from '../ui/Avatar';

/** "Sarah Mansour assigned you …", or the bare sentence when the actor was deleted. */
export function notificationText(notification: AppNotification): string {
  if (notification.actor) return `${notification.actor.full_name} ${notification.message}`;
  return notification.message.charAt(0).toUpperCase() + notification.message.slice(1);
}

/**
 * Marks a notification as read (updating the counters) and follows its link.
 * `onRead` lets the caller update its own list.
 */
export function useOpenNotification(onRead: (read: AppNotification) => void) {
  const navigate = useNavigate();
  const { setUnread } = useNotifications();

  const markRead = useCallback(
    async (notification: AppNotification) => {
      if (notification.read) return;
      onRead({ ...notification, read: true });
      setUnread((count) => count - 1);
      try {
        await markNotificationRead(notification.id);
      } catch {
        // Roll back: it stays unread.
        onRead(notification);
        setUnread((count) => count + 1);
      }
    },
    [onRead, setUnread],
  );

  const open = useCallback(
    (notification: AppNotification) => {
      void markRead(notification);
      // Same marker as the top bar search: admin lists reload with the link's ?search=.
      const state: GlobalSearchState = { globalSearch: Date.now() };
      if (notification.link) navigate(notification.link, { state });
    },
    [markRead, navigate],
  );

  return { open, markRead };
}

export interface NotificationItemProps {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
  /** Shows a "Mark as read" button on unread rows. */
  onMarkRead?: (notification: AppNotification) => void;
  compact?: boolean;
}

export function NotificationItem({ notification, onOpen, onMarkRead, compact = false }: NotificationItemProps) {
  const { actor, project, read } = notification;
  const text = notificationText(notification);

  return (
    <div className={`group relative flex items-start gap-3 ${compact ? 'px-4 py-3' : 'px-6 py-4'} ${read ? '' : 'bg-[#F8F9FF]'}`}>
      {actor ? (
        <Avatar name={actor.full_name} size={compact ? 32 : 36} />
      ) : (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2F4F7] text-ink-secondary"
          aria-hidden="true"
        >
          <Bell className="h-4 w-4" strokeWidth={1.8} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(notification)}
          className="block w-full rounded text-left text-[13px] leading-5 text-[#475467] after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary/40"
        >
          {actor && <strong className="font-semibold text-ink">{actor.full_name}</strong>}
          {actor ? ` ${notification.message}` : text}
          <span className="sr-only">{read ? '' : ' (unread)'}</span>
        </button>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
          <time dateTime={notification.created_at}>{relativeTime(notification.created_at)}</time>
          {project && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: project.color }} aria-hidden="true" />
              <span className="truncate">{project.name}</span>
            </span>
          )}
        </p>
      </div>
      {!read &&
        (onMarkRead ? (
          <button
            type="button"
            onClick={() => onMarkRead(notification)}
            aria-label={`Mark as read: ${text}`}
            title="Mark as read"
            className="relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-[#EEF2FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
          </button>
        ) : (
          <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        ))}
    </div>
  );
}

export default NotificationItem;
