import { Search, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}

export function EmptyState({
  title = 'No results',
  description = 'Try adjusting your search or filters.',
  icon: Icon = Search,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F2F4F7]">
        <Icon className="h-5 w-5 text-ink-secondary" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <p className="mt-4 text-[15px] font-bold text-ink">{title}</p>
      <p className="mt-1 text-[13px] text-ink-secondary">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
