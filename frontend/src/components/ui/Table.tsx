import type { ReactNode } from 'react';

import { Card, Skeleton } from './Card';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Fixed width in px; omit for the column that fills the remaining space. */
  width?: number;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
  rowClassName?: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  /** Below this width the table scrolls horizontally inside its card. */
  minWidth?: number;
  caption: string;
  footer?: ReactNode;
  empty?: ReactNode;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

// 24px at the row edges, 16px between columns.
function cellPadding(index: number, count: number): string {
  return `${index === 0 ? 'pl-6' : 'pl-2'} ${index === count - 1 ? 'pr-6' : 'pr-2'}`;
}

/** Column widths describe the content; add the cell padding around it. */
function columnWidth(width: number, index: number, count: number): number {
  return width + (index === 0 ? 24 : 8) + (index === count - 1 ? 24 : 8);
}

export function Table<T>({
  columns,
  rows,
  getRowKey,
  rowClassName,
  loading = false,
  skeletonRows = 6,
  minWidth = 960,
  caption,
  footer,
  empty,
}: TableProps<T>) {
  const showEmpty = !loading && rows.length === 0;

  return (
    <Card padding="p-0" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            {columns.map((column, index) => (
              <col
                key={column.key}
                style={column.width ? { width: columnWidth(column.width, index, columns.length) } : undefined}
              />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-line-soft bg-[#F9FAFB]">
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`py-3 text-xs font-semibold text-ink-secondary ${ALIGN[column.align ?? 'left']} ${cellPadding(index, columns.length)}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }, (_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className="border-b border-line-soft">
                    {columns.map((column, index) => (
                      <td key={column.key} className={`py-4 ${cellPadding(index, columns.length)}`}>
                        <Skeleton className={index === 0 ? 'h-4 w-4/5' : 'h-4 w-3/5'} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={getRowKey(row)}
                    className={`border-b border-line-soft last:border-b-0 ${rowClassName?.(row) ?? ''}`}
                  >
                    {columns.map((column, index) => (
                      <td
                        key={column.key}
                        className={`py-3 align-middle ${ALIGN[column.align ?? 'left']} ${cellPadding(index, columns.length)}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {showEmpty && (empty ?? <EmptyState />)}
      {footer && !showEmpty && <div className="border-t border-line-soft">{footer}</div>}
    </Card>
  );
}
