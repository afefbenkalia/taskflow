import type { Role } from '../types/user';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', user: 'Member' };

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** Parses ISO datetimes and date-only strings ("2026-11-15" as a local date). */
export function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

/** Local calendar date as "2026-10-24" (the API's date format). */
export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function calendarDaysBetween(earlier: Date, later: Date): number {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / (24 * HOUR));
}

/** "Just now", "12 min ago", "3 hours ago", "Yesterday", "21 days ago". */
export function relativeTime(value: string | Date, now: Date = new Date()): string {
  const date = toDate(value);
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  const days = calendarDaysBetween(date, now);
  if (days === 0) {
    const hours = Math.floor(diff / HOUR);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/** "Nov 15" */
export function shortDate(value: string | Date): string {
  return SHORT_DATE.format(toDate(value));
}

/** "Today", "Yesterday" or "Oct 18". */
export function dayLabel(value: string | Date, now: Date = new Date()): string {
  const days = calendarDaysBetween(toDate(value), now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return shortDate(value);
}

/** "10:42" (24-hour clock). */
export function timeOfDay(value: string | Date): string {
  const date = toDate(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function greeting(now: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const hour = now.getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** "512 B", "12.4 KB", "3.1 MB" */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
