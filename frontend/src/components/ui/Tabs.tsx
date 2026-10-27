export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Shown as in the design, but without a screen yet: not clickable. */
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange?: (value: T) => void;
  ariaLabel: string;
  /** Extra classes for the tab list. */
  className?: string;
}

/** Underlined tabs (gap 24, #EAECF0 bottom border). */
export function Tabs<T extends string>({ items, value, onChange, ariaLabel, className = '' }: TabsProps<T>) {
  return (
    // overflow-y-hidden: the tabs' 1px underline overlap would otherwise show a vertical
    // scrollbar (small up/down arrows on Windows).
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line-soft ${className}`}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={item.disabled || undefined}
            tabIndex={item.disabled ? -1 : 0}
            onClick={() => !item.disabled && onChange?.(item.value)}
            className={[
              '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 pb-3 pt-1 text-sm transition',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
              active ? 'border-primary font-bold text-[#4338CA]' : 'border-transparent font-semibold text-ink-secondary',
              item.disabled ? 'cursor-default' : active ? '' : 'hover:text-ink',
            ].join(' ')}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-px text-xs font-semibold ${
                  active ? 'bg-[#EEF2FF] text-[#4338CA]' : 'bg-[#F2F4F7] text-ink-secondary'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
