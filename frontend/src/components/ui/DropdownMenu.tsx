import { Check, type LucideIcon } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  /** Draws a separator above the item. */
  separatorBefore?: boolean;
  checked?: boolean;
  /** Current value: highlighted row (#F5F6FF, bold indigo) with a check. */
  selected?: boolean;
  disabled?: boolean;
  /** Custom leading element (e.g. a status dot) instead of an icon. */
  leading?: ReactNode;
  onSelect: () => void;
}

export interface DropdownMenuProps {
  items: MenuItem[];
  trigger: ReactNode;
  ariaLabel: string;
  triggerClassName?: string;
  width?: number;
  align?: 'start' | 'end';
  disabled?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  /** Role of the items: "menuitemradio" for single-choice menus. */
  itemRole?: 'menuitem' | 'menuitemradio';
}

const GAP = 6;
const VIEWPORT_MARGIN = 8;
/** Smallest height a menu gets when little room is left around its trigger. */
const MIN_MENU_HEIGHT = 160;

/**
 * Menu rendered in a portal with fixed positioning, so it is never clipped by
 * scrolling table containers.
 */
export function DropdownMenu({
  items,
  trigger,
  ariaLabel,
  triggerClassName = '',
  width = 260,
  align = 'end',
  disabled = false,
  header,
  footer,
  itemRole,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  /**
   * Places the menu under the trigger (or above it when there is more room
   * there). Long menus get the available height and scroll inside.
   */
  const place = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // scrollHeight is the full content height even when the menu is clipped (+2 for the border).
    const menuHeight = menuRef.current.scrollHeight + 2;
    const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
    const above = rect.top - GAP - VIEWPORT_MARGIN;
    const openUp = menuHeight > below && above > below;
    const maxHeight = Math.max(MIN_MENU_HEIGHT, openUp ? above : below);
    const top = openUp ? rect.top - GAP - Math.min(menuHeight, maxHeight) : rect.bottom + GAP;
    const preferred = align === 'end' ? rect.right - width : rect.left;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, preferred),
      window.innerWidth - width - VIEWPORT_MARGIN,
    );
    setPosition({ top, left, maxHeight });
  }, [align, width]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    place();
    menuRef.current.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        close(false);
      }
    };
    // Scrolling inside the menu keeps it open; scrolling the page moves it with
    // its trigger, and only closes it once the trigger has left the screen.
    const onScroll = (event: Event) => {
      // The target is the window itself for some page scrolls: not a Node.
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) close(false);
      else place();
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close, place]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
    );
    const index = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      entries[(index + 1) % entries.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      entries[(index - 1 + entries.length) % entries.length]?.focus();
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const hasChecks = items.some((item) => item.checked !== undefined);
  const role = itemRole ?? (hasChecks ? 'menuitemradio' : 'menuitem');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
            onKeyDown={onMenuKeyDown}
            className="fixed z-[70] overflow-y-auto overscroll-contain rounded-xl border border-line-soft bg-white p-1.5 shadow-[0_12px_32px_-4px_rgba(16,24,40,0.12)]"
            style={{
              width,
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              maxHeight: position?.maxHeight,
            }}
          >
            {header}
            {items.map((item) => {
              const Icon = item.icon;
              const tone = item.selected
                ? 'bg-[#F5F6FF] font-bold text-[#3730A3]'
                : item.danger
                  ? 'font-medium text-[#B42318]'
                  : 'font-medium text-ink-label';
              return (
                <Fragment key={item.key}>
                  {item.separatorBefore && <div className="my-1.5 h-px bg-line-soft" role="separator" />}
                  <button
                    type="button"
                    role={role}
                    aria-checked={role === 'menuitemradio' ? Boolean(item.checked ?? item.selected) : undefined}
                    disabled={item.disabled}
                    aria-disabled={item.disabled || undefined}
                    onClick={() => {
                      close();
                      item.onSelect();
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-left text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50 ${tone} ${
                      item.disabled || item.selected ? '' : 'hover:bg-[#F9FAFB] focus:bg-[#F9FAFB]'
                    }`}
                  >
                    {item.leading}
                    {Icon && (
                      <Icon
                        className={`h-4 w-4 shrink-0 ${item.danger ? 'text-[#D92D20]' : 'text-ink-secondary'}`}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {(item.checked || item.selected) && (
                      <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden="true" />
                    )}
                  </button>
                </Fragment>
              );
            })}
            {footer}
          </div>,
          document.body,
        )}
    </>
  );
}
