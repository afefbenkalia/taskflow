import { ChevronDown, type LucideIcon } from 'lucide-react';
import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { DropdownMenu } from './DropdownMenu';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

/** Native select styled like <Input>, for forms. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, placeholder, id, className = '', ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className={className}>
      <label htmlFor={selectId} className="mb-1.5 block text-[13px] font-semibold text-ink-label">
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={[
            'block w-full appearance-none rounded-field border bg-white py-[11px] pl-[14px] pr-10 text-[15px] text-ink',
            'shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition focus:ring-4',
            error
              ? 'border-danger-border focus:border-danger-border focus:ring-danger/10'
              : 'border-line focus:border-primary focus:ring-primary/15',
          ].join(' ')}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

export interface FilterSelectProps<T extends string> {
  /** Text shown on the chip when no value is selected ("Role", "All users"…). */
  label: string;
  value: T | '';
  options: SelectOption<T>[];
  onChange: (value: T | '') => void;
  /** Label of the "no filter" option; omit to hide it. */
  allLabel?: string;
  icon?: LucideIcon;
  /** Show the selected option's label instead of `label`. */
  showValue?: boolean;
  width?: number;
}

/** Filter chip: white button with a ChevronDown that opens a checkable menu. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  allLabel = 'All',
  icon: Icon,
  showValue = true,
  width = 220,
}: FilterSelectProps<T>) {
  const selected = options.find((option) => option.value === value);
  const text: ReactNode = showValue && selected ? selected.label : label;

  const items = [
    ...(allLabel ? [{ value: '' as const, label: allLabel }] : []),
    ...options,
  ].map((option) => ({
    key: option.value || 'all',
    label: option.label,
    checked: option.value === value,
    onSelect: () => onChange(option.value as T | ''),
  }));

  return (
    <DropdownMenu
      ariaLabel={selected ? `${label}: ${selected.label}` : label}
      items={items}
      width={width}
      align="start"
      triggerClassName={`inline-flex items-center gap-2 whitespace-nowrap rounded-field border bg-white px-3 py-[9px] text-sm font-medium shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 ${
        selected ? 'border-[#C7D2FE] text-[#3730A3]' : 'border-line text-ink-label'
      }`}
      trigger={
        <>
          {Icon && <Icon className="h-4 w-4 text-ink-secondary" strokeWidth={1.8} aria-hidden="true" />}
          {text}
          <ChevronDown className="h-4 w-4 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
        </>
      }
    />
  );
}
