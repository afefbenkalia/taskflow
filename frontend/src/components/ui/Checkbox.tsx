import { Check } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id, className = '', ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <span className="relative inline-flex h-[18px] w-[18px] shrink-0">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={[
              'peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[6px] border bg-white transition',
              'checked:border-primary checked:bg-primary',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
              error ? 'border-danger-border' : 'border-line',
            ].join(' ')}
            {...props}
          />
          <Check
            className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-white opacity-0 peer-checked:opacity-100"
            strokeWidth={3.5}
            aria-hidden="true"
          />
        </span>
        <label htmlFor={inputId} className="cursor-pointer select-none text-[13px] font-medium text-ink-label">
          {label}
        </label>
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
