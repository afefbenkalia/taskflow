import {
  Activity,
  Bell,
  Calendar,
  Check,
  Folder,
  Home,
  LogOut,
  Plus,
  SquareCheck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useNotifications } from '../../context/NotificationsContext';
import type { MeCounts } from '../../types/user';
import { unreadBadge } from '../notifications/NotificationBell';
import { Avatar } from '../ui/Avatar';

interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Items without a screen in the design are shown but not clickable. */
  to?: string;
  end?: boolean;
  count?: keyof MeCounts;
  /** Shows the unread notifications counter. */
  unreadBadge?: boolean;
}

const MENU_ITEMS: NavItem[] = [
  { label: 'Home', icon: Home, to: '/app', end: true },
  { label: 'My tasks', icon: SquareCheck, to: '/app/tasks', count: 'open_tasks' },
  { label: 'My projects', icon: Folder, to: '/app/projects', count: 'projects' },
  { label: 'Calendar', icon: Calendar, to: '/app/calendar' },
  { label: 'Activity', icon: Activity, to: '/app/activity' },
];

const ACCOUNT_ITEMS: NavItem[] = [
  { label: 'Profile', icon: User, to: '/app/profile' },
  { label: 'Notifications', icon: Bell, to: '/app/notifications', unreadBadge: true },
];

const ITEM_BASE =
  'flex items-center gap-3 rounded-[10px] px-3 py-[9px] text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

function ItemContent({ item, active, counts }: { item: NavItem; active: boolean; counts: MeCounts | null }) {
  const Icon = item.icon;
  const { unread } = useNotifications();
  const count = item.count && counts ? counts[item.count] : null;
  return (
    <>
      <Icon
        className={`h-5 w-5 shrink-0 ${active ? 'text-primary' : 'text-ink-secondary'}`}
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{item.label}</span>
      {count !== null && (
        <span className="rounded-full bg-[#F2F4F7] px-2 py-px text-xs font-semibold text-[#475467]">{count}</span>
      )}
      {item.unreadBadge && unread ? (
        <span className="rounded-full bg-[#F04438] px-2 py-px text-xs font-semibold text-white">
          {unreadBadge(unread)}
          <span className="sr-only"> unread</span>
        </span>
      ) : null}
    </>
  );
}

function NavSection({
  title,
  items,
  counts,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  counts: MeCounts | null;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">{title}</p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.label}>
            {item.to ? (
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `${ITEM_BASE} ${
                    isActive ? 'bg-[#EEF2FF] font-semibold text-[#4338CA]' : 'font-medium text-ink-label hover:bg-[#F9FAFB]'
                  }`
                }
              >
                {({ isActive }) => <ItemContent item={item} active={isActive} counts={counts} />}
              </NavLink>
            ) : (
              <span aria-disabled="true" className={`${ITEM_BASE} cursor-default font-medium text-ink-label`}>
                <ItemContent item={item} active={false} counts={counts} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface SidebarUserProps {
  counts: MeCounts | null;
  userName: string;
  onNewTask: () => void;
  onLogout: () => void;
  onNavigate?: () => void;
}

export function SidebarUser({ counts, userName, onNewTask, onLogout, onNavigate }: SidebarUserProps) {
  return (
    <nav
      aria-label="Workspace navigation"
      className="flex h-full w-[264px] flex-col border-r border-[#E9EBF1] bg-white px-4 pb-5 pt-6"
    >
      <div className="flex items-center gap-3 px-2">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]">
          <Check className="h-[18px] w-[18px] text-white" strokeWidth={3} aria-hidden="true" />
        </span>
        <div className="leading-tight">
          <p className="text-[17px] font-extrabold text-ink">TaskFlow</p>
          <p className="text-xs font-medium text-ink-muted">My workspace</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onNewTask}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(79,70,229,0.25)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        New task
      </button>

      <div className="mt-6 flex-1 space-y-6 overflow-y-auto">
        <NavSection title="Menu" items={MENU_ITEMS} counts={counts} onNavigate={onNavigate} />
        <NavSection title="Account" items={ACCOUNT_ITEMS} counts={counts} onNavigate={onNavigate} />
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-3 px-1">
          <Avatar name={userName} size={36} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold text-ink">{userName}</p>
            <p className="text-xs font-medium text-ink-muted">Member</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            className="rounded-lg p-1.5 text-ink-muted transition hover:bg-app hover:text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
}

export default SidebarUser;
