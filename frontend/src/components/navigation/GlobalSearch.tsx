import axios from 'axios';
import { Folder, Loader2, Search, SquareCheck, User, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { searchWorkspace, type SearchItem, type SearchKind, type SearchResults } from '../../api/search';
import { useDebounce } from '../../hooks/useDebounce';

export const MIN_SEARCH_LENGTH = 2;

const GROUPS: Record<SearchKind, { label: string; icon: LucideIcon }> = {
  projects: { label: 'Projects', icon: Folder },
  tasks: { label: 'Tasks', icon: SquareCheck },
  people: { label: 'People', icon: User },
};

/** Navigation state read by pages that must pick up a new ?search= (see KeyedBySearch). */
export interface GlobalSearchState {
  globalSearch: number;
}

/** Top bar search: results grouped by kind, keyboard navigation, Ctrl+K to focus. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [text, setText] = useState('');
  const query = useDebounce(text.trim(), 250);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Close when the page changes (e.g. after following a result).
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (query.length < MIN_SEARCH_LENGTH) {
      setResults(null);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    searchWorkspace(query, controller.signal)
      .then((data) => {
        setResults(data);
        setActive(0);
      })
      .catch((reason) => {
        if (!axios.isCancel(reason)) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  const items: SearchItem[] = results?.groups.flatMap((group) => group.items) ?? [];
  const tooShort = text.trim().length < MIN_SEARCH_LENGTH;
  const showPanel = open && !tooShort;

  const go = (item: SearchItem) => {
    setOpen(false);
    setText('');
    inputRef.current?.blur();
    const state: GlobalSearchState = { globalSearch: Date.now() };
    navigate(item.link, { state });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (open && text) setOpen(false);
      else {
        setText('');
        inputRef.current?.blur();
      }
      return;
    }
    if (!showPanel || items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[active];
      if (item) go(item);
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  let index = -1;

  return (
    <div ref={rootRef} className="relative hidden w-full max-w-[400px] sm:block">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-muted"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search projects, tasks, people"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && items.length > 0 ? optionId(active) : undefined}
        placeholder="Search projects, tasks, people…"
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="block w-full rounded-field border border-[#EEF0F4] bg-[#F5F6FA] py-[9px] pl-10 pr-16 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/15"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-[#E4E7EC] bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink-secondary">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : 'Ctrl K'}
      </kbd>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(440px,calc(100vh-120px))] overflow-y-auto rounded-card border border-line-soft bg-white p-1.5 shadow-[0_12px_32px_-4px_rgba(16,24,40,0.16)]"
        >
          {failed ? (
            <p className="px-3 py-6 text-center text-[13px] text-[#B42318]">Search is unavailable right now.</p>
          ) : !results || results.query !== text.trim() ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-secondary">Searching…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-secondary">
              No results for “{results.query}”.
            </p>
          ) : (
            results.groups.map((group) => {
              const { label, icon: Icon } = GROUPS[group.kind];
              return (
                <div key={group.kind} role="group" aria-label={label}>
                  <p className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">{label}</p>
                  {group.items.map((item) => {
                    index += 1;
                    const position = index;
                    const selected = position === active;
                    return (
                      <div
                        key={`${group.kind}-${item.id}`}
                        id={optionId(position)}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActive(position)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => go(item)}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${selected ? 'bg-[#F5F6FF]' : ''}`}
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F2F4F7] text-ink-secondary"
                          style={item.color ? { backgroundColor: `${item.color}1A`, color: item.color } : undefined}
                          aria-hidden="true"
                        >
                          <Icon className="h-4 w-4" strokeWidth={1.8} />
                        </span>
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className={`block truncate text-sm font-semibold ${selected ? 'text-[#3730A3]' : 'text-ink'}`}>
                            {item.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-secondary">{item.subtitle}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;
