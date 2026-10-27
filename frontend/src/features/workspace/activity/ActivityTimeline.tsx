import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { apiErrorMessage } from '../../../api/client';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Card, Skeleton } from '../../../components/ui/Card';
import { dayLabel, timeOfDay, toDate } from '../../../lib/format';
import type { Page } from '../../../types';
import type { ProjectActivityEntry } from '../../../types/activity';
import { ActivityIcon, ActivitySentence } from '../../admin/activity/AuditTable';

function dayKey(value: string): string {
  const date = toDate(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Consecutive entries of the same local day, newest first. */
export function groupByDay<T extends ProjectActivityEntry>(entries: T[]) {
  const groups: { key: string; label: string; entries: T[] }[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.created_at);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else groups.push({ key, label: dayLabel(entry.created_at), entries: [entry] });
  }
  return groups;
}

/**
 * Loads page 1 whenever `fetchPage` (memoized with the filters as dependencies)
 * or `reloadKey` changes, then appends further pages with `loadMore`.
 */
export function useActivityFeed<T extends ProjectActivityEntry>(
  fetchPage: (page: number) => Promise<Page<T>>,
  reloadKey: unknown = null,
) {
  const [entries, setEntries] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchPage(1)
      .then((result) => {
        if (cancelled) return;
        setEntries(result.items);
        setTotal(result.total);
        setPage(1);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load the activity.')));
    return () => {
      cancelled = true;
    };
  }, [fetchPage, reloadKey]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchPage(page + 1);
      // Skip entries already shown if new events shifted the pages.
      setEntries((current) => {
        const seen = new Set((current ?? []).map((entry) => entry.id));
        return [...(current ?? []), ...result.items.filter((entry) => !seen.has(entry.id))];
      });
      setTotal(result.total);
      setPage(result.page);
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Unable to load more activity.'));
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, page]);

  return { entries, total, loadMore, loadingMore, error };
}

export interface ActivityTimelineProps<T extends ProjectActivityEntry> {
  entries: T[] | null;
  total: number;
  loadingMore: boolean;
  onLoadMore: () => void;
  empty: ReactNode;
  /** Extra line under the sentence (e.g. the project of the entry). */
  renderMeta?: (entry: T) => ReactNode;
}

/** Day-grouped feed: icon, "Actor did something", avatar and time. */
export function ActivityTimeline<T extends ProjectActivityEntry>({
  entries,
  total,
  loadingMore,
  onLoadMore,
  empty,
  renderMeta,
}: ActivityTimelineProps<T>) {
  return (
    <Card padding="p-0" className="overflow-hidden">
      {entries === null ? (
        <div className="space-y-4 p-6">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        empty
      ) : (
        <>
          {groupByDay(entries).map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="border-b border-line-soft bg-[#FCFCFD] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
                {group.label}
              </h3>
              <ol>
                {group.entries.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 border-b border-line-soft px-6 py-3.5 last:border-b-0">
                    <ActivityIcon type={entry.type} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-5 text-[#475467]">
                        <ActivitySentence entry={entry} withActor />
                        {!entry.actor && <span className="text-ink-muted"> · System</span>}
                      </p>
                      {renderMeta?.(entry)}
                    </div>
                    {entry.actor && <Avatar name={entry.actor.full_name} size={24} className="hidden sm:inline-flex" />}
                    <time dateTime={entry.created_at} className="w-11 shrink-0 text-right font-mono text-xs text-ink-muted">
                      {timeOfDay(entry.created_at)}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {entries.length < total && (
            <div className="border-t border-line-soft px-6 py-3 text-center">
              <Button variant="secondary" size="sm" onClick={onLoadMore} loading={loadingMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default ActivityTimeline;
