import { useId, useState, type ReactNode } from 'react';

/** Dark bubble; positioned by the caller (charts) or by <Tooltip>. */
export function TooltipBubble({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none whitespace-nowrap rounded-lg bg-[#0B1020] px-3 py-2 text-xs font-semibold text-white shadow-lg ${className}`}
    >
      {children}
    </span>
  );
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

/** Shows `content` above `children` on hover and keyboard focus. */
export function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span id={id} className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2">
          <TooltipBubble>{content}</TooltipBubble>
        </span>
      )}
    </span>
  );
}
