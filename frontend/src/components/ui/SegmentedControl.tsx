export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Shown as in the design, but without a screen yet: not clickable. */
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex max-w-full gap-1 overflow-x-auto rounded-field bg-[#F2F4F7] p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-disabled={option.disabled || undefined}
            tabIndex={option.disabled ? -1 : undefined}
            onClick={() => !option.disabled && onChange(option.value)}
            className={[
              'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              active
                ? 'bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.06),0_1px_3px_rgba(16,24,40,0.1)]'
                : option.disabled
                  ? 'cursor-default text-ink-secondary'
                  : 'text-ink-secondary hover:text-ink',
            ].join(' ')}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-px text-[11px] font-semibold ${
                  active ? 'bg-[#EEF2FF] text-[#4338CA]' : 'bg-[#E4E7EC] text-[#667085]'
                }`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
