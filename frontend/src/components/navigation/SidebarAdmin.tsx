import {
  Activity,
  Bell,
  Check,
  Folder,
  LayoutDashboard,
  LogOut,
  SquareCheck,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useNotifications } from '../../context/NotificationsContext';
import type { SidebarCounts } from '../../types';
import { unreadBadge } from '../notifications/NotificationBell';
import { Avatar } from '../ui/Avatar';

interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Items without a screen in the design are rendered but not clickable. */
  to?: string;
  end?: boolean;
  count?: keyof SidebarCounts;
  /** Shows the unread notifications counter. */
  unreadBadge?: boolean;
}

const MAIN_ITEMS: NavItem[] = [
  { label: 'Overview', icon: LayoutDashboard, to: '/admin', end: true },
  { label: 'Users', icon: Users, to: '/admin/users', count: 'users' },
  { label: 'Projects', icon: Folder, to: '/admin/projects', count: 'projects' },
  { label: 'Tasks', icon: SquareCheck, to: '/admin/tasks', count: 'tasks' },
  { label: 'Activity log', icon: Activity, to: '/admin/activity' },
];

const ACCOUNT_ITEMS: NavItem[] = [
  { label: 'Notifications', icon: Bell, to: '/admin/notifications', unreadBadge: true },
  { label: 'Profile', icon: User, to: '/admin/profile' },
];

const ITEM_BASE =
  'group flex items-center gap-3 rounded-[10px] px-3 py-[9px] text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC]/60';

function ItemContent({ item, active, counts }: { item: NavItem; active: boolean; counts: SidebarCounts | null }) {
  const Icon = item.icon;
  const { unread } = useNotifications();
  const count = item.count && counts ? counts[item.count] : null;
  return (
    <>
      <Icon
        className={`h-5 w-5 shrink-0 ${active ? 'text-[#A5B4FC]' : 'text-[#8B93A7]'}`}
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{item.label}</span>
      {count !== null && (
        <span className="rounded-full bg-[#1C2337] px-2 py-px text-xs font-semibold text-[#A3ABBF]">
          {count}
        </span>
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
  counts: SidebarCounts | null;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#5D6680]">{title}</p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.label}>
            {item.to ? (
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `${ITEM_BASE} ${isActive ? 'bg-[#1E2640] text-white' : 'text-[#C5CAD8] hover:bg-[#151B2E]'}`
                }
              >
                {({ isActive }) => <ItemContent item={item} active={isActive} counts={counts} />}
              </NavLink>
            ) : (
              <span aria-disabled="true" className={`${ITEM_BASE} cursor-default text-[#C5CAD8]`}>
                <ItemContent item={item} active={false} counts={counts} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface SidebarAdminProps {
  counts: SidebarCounts | null;
  userName: string;
  onLogout: () => void;
  onNavigate?: () => void;
}

export function SidebarAdmin({ counts, userName, onLogout, onNavigate }: SidebarAdminProps) {
  return (
    <nav
      aria-label="Admin navigation"
      className="flex h-full w-[264px] flex-col bg-[#0B1020] px-4 pb-5 pt-6"
    >
      <div className="flex items-center gap-3 px-2">
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]">
          <Check className="h-[18px] w-[18px] text-white" strokeWidth={3} aria-hidden="true" />
        </span>
        <div className="leading-tight">
          <p className="text-[17px] font-extrabold text-white">TaskFlow</p>
          <p className="text-xs font-medium text-[#8B93A7]">Admin console</p>
        </div>
      </div>

      <div className="mt-8 flex-1 space-y-6 overflow-y-auto">
        <NavSection title="Main" items={MAIN_ITEMS} counts={counts} onNavigate={onNavigate} />
        <NavSection title="Account" items={ACCOUNT_ITEMS} counts={counts} onNavigate={onNavigate} />
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-3 px-1">
          <Avatar name={userName} size={36} colors={{ bg: '#312E81', fg: '#C7D2FE' }} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold text-white">{userName}</p>
            <p className="text-xs font-medium text-[#8B93A7]">Administrator</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            className="rounded-lg p-1.5 text-[#8B93A7] transition hover:bg-[#151B2E] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC]/60"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
}

export default SidebarAdmin;
