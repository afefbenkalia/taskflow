import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Tailwind padding classes; defaults to the 24px card padding. */
  padding?: string;
}

export function Card({ padding = 'p-6', className = '', children, ...props }: CardProps) {
  return (
    <section
      className={`rounded-card border border-line-soft bg-white shadow-card ${padding} ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

export interface CardHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-secondary">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}

/** Page title (28/800) with actions aligned to the bottom on the right. */
export function PageHeader({ title, subtitle, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-3">{eyebrow}</div>}
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-[#F2F4F7] ${className}`} aria-hidden="true" />;
}
