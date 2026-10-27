import { useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

export type PageItem = number | 'ellipsis';

export interface PaginationState {
  totalPages: number;
  /** 1-based index of the first row shown (0 when empty). */
  from: number;
  /** 1-based index of the last row shown. */
  to: number;
  pages: PageItem[];
}

/** Page buttons with ellipses, e.g. 1 … 4 5 6 … 12. */
export function pageItems(page: number, totalPages: number, siblings = 1): PageItem[] {
  if (totalPages <= 5 + siblings * 2) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const start = Math.max(2, page - siblings);
  const end = Math.min(totalPages - 1, page + siblings);
  const items: PageItem[] = [1];
  if (start > 2) items.push('ellipsis');
  for (let current = start; current <= end; current += 1) items.push(current);
  if (end < totalPages - 1) items.push('ellipsis');
  items.push(totalPages);
  return items;
}

/**
 * Filters and current page stored in the URL query string, so a filtered list
 * can be shared or restored with the back button.
 */
export function useQueryState() {
  const [params, setParams] = useSearchParams();
  // Kept across filter changes (e.g. the global search marker, see KeyedBySearch).
  const { state } = useLocation();

  const get = useCallback((key: string) => params.get(key) ?? '', [params]);
  const page = Math.max(1, Number(params.get('page')) || 1);

  /** Updates filters; any filter change resets the list to page 1. */
  const update = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true, state },
      );
    },
    [setParams, state],
  );

  const setPage = useCallback((value: number) => update({ page: value > 1 ? value : null }), [update]);

  return { get, page, update, setPage };
}

export function usePagination(page: number, pageSize: number, total: number): PaginationState {
  return useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      totalPages,
      from: total === 0 ? 0 : (page - 1) * pageSize + 1,
      to: Math.min(page * pageSize, total),
      pages: pageItems(page, totalPages),
    };
  }, [page, pageSize, total]);
}
