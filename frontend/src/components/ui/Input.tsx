import { Eye, EyeOff, Search } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, type = 'text', className = '', ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const isPassword = type === 'password';
  const [visible, setVisible] = useState(false);

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-semibold text-ink-label">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={isPassword && visible ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={[
            'block w-full rounded-field border bg-white px-[14px] py-[11px] text-[15px] text-ink',
            'shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition placeholder:text-ink-muted',
            'focus:ring-4',
            error
              ? 'border-danger-border focus:border-danger-border focus:ring-danger/10'
              : 'border-line focus:border-primary focus:ring-primary/15',
            isPassword ? 'pr-11' : '',
          ].join(' ')}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-controls={inputId}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-field text-ink-muted hover:text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {visible ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Accessible name; the placeholder is not a label. */
  label: string;
  width?: number;
}

/** Search field used in filter bars (white, #D0D5DD border, Search icon). */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { label, width, className = '', style, ...props },
  ref,
) {
  return (
    <div className={`relative w-full ${className}`} style={{ maxWidth: width, ...style }}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-muted"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        className="block w-full rounded-field border border-line bg-white py-[9px] pl-10 pr-3 text-sm text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition placeholder:text-ink-muted focus:border-primary focus:ring-4 focus:ring-primary/15"
        {...props}
      />
    </div>
  );
});
