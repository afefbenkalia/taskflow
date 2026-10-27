import { ChevronDown, Lock, ShieldCheck, User as UserIcon } from 'lucide-react';

import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { ROLE_LABELS } from '../../../lib/format';
import type { Role } from '../../../types/user';

const PILL =
  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-[5px] text-[13px] font-semibold';

const ROLE_STYLES: Record<Role, string> = {
  admin: 'border-[#C7D2FE] bg-[#EEF2FF] text-[#3730A3]',
  user: 'border-line bg-white text-ink-label',
};

function RoleIcon({ role }: { role: Role }) {
  const Icon = role === 'admin' ? ShieldCheck : UserIcon;
  return <Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />;
}

export interface RoleSelectorProps {
  role: Role;
  userName: string;
  /** The signed-in admin's own row: the role is shown but cannot be changed. */
  locked: boolean;
  onChange: (role: Role) => void;
}

export function RoleSelector({ role, userName, locked, onChange }: RoleSelectorProps) {
  if (locked) {
    return (
      <span
        className={`${PILL} ${ROLE_STYLES[role]} cursor-not-allowed`}
        title="You can’t change your own role"
        aria-label={`${ROLE_LABELS[role]} — you can’t change your own role`}
        data-testid="role-locked"
      >
        <RoleIcon role={role} />
        {ROLE_LABELS[role]}
        <Lock className="h-3.5 w-3.5 opacity-70" strokeWidth={1.8} aria-hidden="true" />
      </span>
    );
  }

  return (
    <DropdownMenu
      ariaLabel={`Role of ${userName}: ${ROLE_LABELS[role]}`}
      width={180}
      align="start"
      triggerClassName={`${PILL} ${ROLE_STYLES[role]} transition hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15`}
      trigger={
        <>
          <RoleIcon role={role} />
          {ROLE_LABELS[role]}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" strokeWidth={1.8} aria-hidden="true" />
        </>
      }
      items={(['admin', 'user'] as Role[]).map((option) => ({
        key: option,
        label: ROLE_LABELS[option],
        icon: option === 'admin' ? ShieldCheck : UserIcon,
        checked: option === role,
        onSelect: () => option !== role && onChange(option),
      }))}
    />
  );
}

export default RoleSelector;
