import { usePagination } from '../../hooks/usePagination';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Noun used in "Showing 1–10 of 24 users". */
  itemLabel: string;
  onPageChange: (page: number) => void;
}

const NAV_BUTTON =
  'rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-label shadow-sm transition hover:bg-app disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export function Pagination({ page, pageSize, total, itemLabel, onPageChange }: PaginationProps) {
  const { from, to, totalPages, pages } = usePagination(page, pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 px-6 py-[14px]"
    >
      <p className="text-[13px] font-medium text-ink-secondary">
        Showing {from}–{to} of {total} {itemLabel}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={NAV_BUTTON}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        {pages.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="w-[34px] text-center text-[13px] text-ink-muted">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
              className={`h-[34px] w-[34px] rounded-lg text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                item === page ? 'bg-[#EEF2FF] text-[#4338CA]' : 'text-ink-secondary hover:bg-app'
              }`}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          className={NAV_BUTTON}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
