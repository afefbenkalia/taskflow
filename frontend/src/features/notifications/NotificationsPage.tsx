import { BellOff, CheckCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { apiErrorMessage } from '../../api/client';
import { getNotifications, markAllNotificationsRead } from '../../api/notifications';
import { NotificationItem, useOpenNotification } from '../../components/notifications/NotificationItem';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card, PageHeader, Skeleton } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useNotifications } from '../../context/NotificationsContext';
import { useQueryState } from '../../hooks/usePagination';
import { dayLabel, toDate } from '../../lib/format';
import type { AppNotification } from '../../types/notification';

const PAGE_SIZE = 20;

type Filter = 'all' | 'unread';

function groupByDay(items: AppNotification[]) {
  const groups: { key: string; label: string; items: AppNotification[] }[] = [];
  for (const item of items) {
    const date = toDate(item.created_at);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(item.created_at), items: [item] });
  }
  return groups;
}

/** Notifications of the signed-in user, for members (/app) and admins (/admin). */
export function NotificationsPage() {
  const { unread, setUnread } = useNotifications();
  const { get, update } = useQueryState();
  const filter: Filter = get('filter') === 'unread' ? 'unread' : 'all';
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    getNotifications({ unread: filter === 'unread', page: 1, page_size: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setPage(1);
        setUnread(() => result.unread_count);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load notifications.')));
    return () => {
      cancelled = true;
    };
  }, [filter, setUnread]);

  const replace = useCallback(
    (next: AppNotification) => setItems((current) => current && current.map((item) => (item.id === next.id ? next : item))),
    [],
  );
  const { open, markRead } = useOpenNotification(replace);

  const loadMore = async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const result = await getNotifications({ unread: filter === 'unread', page: page + 1, page_size: PAGE_SIZE });
      setItems((current) => {
        const seen = new Set((current ?? []).map((item) => item.id));
        return [...(current ?? []), ...result.items.filter((item) => !seen.has(item.id))];
      });
      setTotal(result.total);
      setPage(result.page);
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Unable to load more notifications.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const markAll = async () => {
    setMarking(true);
    setError(null);
    try {
      await markAllNotificationsRead();
      setItems((current) => current && current.map((item) => ({ ...item, read: true })));
      setUnread(() => 0);
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Unable to mark notifications as read.'));
    } finally {
      setMarking(false);
    }
  };

  const count = unread ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={unread === null ? ' ' : count ? `You have ${count} unread notification${count === 1 ? '' : 's'}.` : 'You’re all caught up.'}
        actions={
          <Button
            variant="secondary"
            onClick={markAll}
            loading={marking}
            disabled={count === 0}
            leftIcon={<CheckCheck className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
          >
            Mark all as read
          </Button>
        }
      />

      <SegmentedControl
        ariaLabel="Show"
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread', count: unread ?? undefined },
        ]}
        value={filter}
        onChange={(value) => update({ filter: value === 'unread' ? value : null })}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <Card padding="p-0" className="overflow-hidden">
        {items === null ? (
          <div className="space-y-4 p-6">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            description={
              filter === 'unread'
                ? 'You’ve read everything. Switch to All to see older notifications.'
                : 'When something needs your attention, it will show up here.'
            }
          />
        ) : (
          <>
            {groupByDay(items).map((group) => (
              <section key={group.key} aria-label={group.label}>
                <h2 className="border-b border-line-soft bg-[#FCFCFD] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
                  {group.label}
                </h2>
                <ul className="divide-y divide-line-soft border-b border-line-soft last:border-b-0">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <NotificationItem notification={item} onOpen={open} onMarkRead={markRead} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {items.length < total && (
              <div className="border-t border-line-soft px-6 py-3 text-center">
                <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default NotificationsPage;
