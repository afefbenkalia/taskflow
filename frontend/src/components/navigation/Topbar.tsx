import { ChevronDown, LogOut, Menu, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { NotificationBell } from '../notifications/NotificationBell';
import { GlobalSearch } from './GlobalSearch';
import { Avatar, type AvatarColors } from '../ui/Avatar';
import { DropdownMenu } from '../ui/DropdownMenu';

export interface TopbarProps {
  name: string;
  roleLabel: string;
  avatarColors: AvatarColors;
  onLogout: () => void;
  /** Profile page of the current role, linked from the account menu. */
  profilePath: string;
  /** Opens the navigation drawer below 1024px. */
  onMenuClick?: () => void;
}

/** Shared by the admin console and the user workspace. */
export function Topbar({ name, roleLabel, avatarColors, onLogout, profilePath, onMenuClick }: TopbarProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-[#E9EBF1] bg-white px-4 sm:px-6 xl:px-10">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-ink-secondary hover:bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:hidden"
          >
            <Menu className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <NotificationBell />
        <span className="h-7 w-px bg-[#E4E7EC]" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <Avatar name={name} size={36} colors={avatarColors} />
          <div className="hidden leading-tight md:block">
            <p className="text-sm font-semibold text-ink">{name}</p>
            <p className="text-xs font-medium text-ink-secondary">{roleLabel}</p>
          </div>
          <DropdownMenu
            ariaLabel="Account menu"
            width={180}
            triggerClassName="rounded-lg p-1 text-ink-secondary hover:bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            trigger={<ChevronDown className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
            items={[
              { key: 'profile', label: 'Profile', icon: User, onSelect: () => navigate(profilePath) },
              { key: 'logout', label: 'Log out', icon: LogOut, separatorBefore: true, onSelect: onLogout },
            ]}
          />
        </div>
      </div>
    </header>
  );
}

export default Topbar;
