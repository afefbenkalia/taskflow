import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Card, Skeleton } from '../../../components/ui/Card';
import type { ProjectMember } from '../../../types/project';

export function MembersPanel({ members }: { members: ProjectMember[] | null }) {
  return (
    <Card padding="p-5">
      <h2 className="flex items-baseline gap-2">
        <span className="text-[15px] font-extrabold text-ink">Members</span>
        {members && <span className="text-[13px] font-bold text-ink-secondary">{members.length}</span>}
      </h2>

      {members ? (
        <ul className="mt-3.5 space-y-3">
          {members.map((member) => (
            <li key={member.user.id} className="flex items-center gap-2.5">
              <Avatar name={member.user.full_name} size={32} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                {member.user.full_name}
                {member.is_self && ' (you)'}
              </span>
              {member.role_in_project === 'owner' ? (
                <Badge tone="amber">Owner</Badge>
              ) : (
                <Badge tone="gray">Member</Badge>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Skeleton className="mt-3.5 h-24 w-full" />
      )}
    </Card>
  );
}

export default MembersPanel;
