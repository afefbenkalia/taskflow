import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Variant = 'error' | 'info' | 'warning' | 'success';

const STYLES: Record<Variant, { box: string; icon: LucideIcon; iconColor: string }> = {
  error: { box: 'border-danger-border bg-danger-bg text-danger', icon: AlertCircle, iconColor: 'text-danger' },
  info: { box: 'border-info-border bg-info-bg text-info', icon: Info, iconColor: 'text-primary' },
  warning: {
    box: 'border-warning-border bg-warning-bg text-warning',
    icon: AlertTriangle,
    iconColor: 'text-[#DC6803]',
  },
  success: {
    box: 'border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]',
    icon: CheckCircle2,
    iconColor: 'text-success',
  },
};

export interface AlertProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export function Alert({ variant = 'info', children, className = '' }: AlertProps) {
  const { box, icon: Icon, iconColor } = STYLES[variant];
  const urgent = variant === 'error' || variant === 'warning';

  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-5 ${box} ${className}`}
    >
      <Icon className={`mt-px h-[18px] w-[18px] shrink-0 ${iconColor}`} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export interface ToastProps {
  message: string | null;
  onClose: () => void;
  variant?: 'success' | 'error';
  duration?: number;
}

/** Floating confirmation shown after an action; closes itself. */
export function Toast({ message, onClose, variant = 'success', duration = 3500 }: ToastProps) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [message, onClose, duration]);

  if (!message) return null;

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[60] w-[min(380px,calc(100vw-32px))] shadow-card">
      <Alert variant={variant} className="bg-white pr-10">
        {message}
      </Alert>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="absolute right-2.5 top-2.5 rounded-md p-0.5 text-ink-muted hover:text-ink-secondary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
