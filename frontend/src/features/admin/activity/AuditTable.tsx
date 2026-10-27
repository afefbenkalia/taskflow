import {
  Ban,
  Check,
  Lock,
  LogIn,
  Pencil,
  Plus,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Avatar } from '../../../components/ui/Avatar';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Table, type Column } from '../../../components/ui/Table';
import { ROLE_LABELS, dayLabel, timeOfDay } from '../../../lib/format';
import type { ActivityEntry, ActivityType, ProjectActivityEntry, TargetKind } from '../../../types/activity';
import type { Role } from '../../../types/user';

const TASK_STATUS_LABELS: Record<string, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

const TYPE_STYLES: Record<ActivityType, { icon: LucideIcon; bg: string; fg: string }> = {
  role: { icon: ShieldCheck, bg: '#FFFAEB', fg: '#B54708' },
  status: { icon: Check, bg: '#ECFDF3', fg: '#067647' },
  create: { icon: Plus, bg: '#EEF2FF', fg: '#4338CA' },
  auth: { icon: LogIn, bg: '#F2F4F7', fg: '#475467' },
  deactivate: { icon: Ban, bg: '#FEF3F2', fg: '#B42318' },
  update: { icon: Pencil, bg: '#EFF8FF', fg: '#175CD3' },
  denied: { icon: Lock, bg: '#FEF3F2', fg: '#B42318' },
};

const TARGET_TONES: Record<TargetKind, BadgeTone> = {
  user: 'violet',
  task: 'blue',
  project: 'green',
  file: 'indigo',
  session: 'gray',
  security: 'red',
};

export function ActivityIcon({ type, size = 28 }: { type: ActivityType; size?: number }) {
  const { icon: Icon, bg, fg } = TYPE_STYLES[type];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg"
      style={{ width: size, height: size, backgroundColor: bg, color: fg }}
      aria-hidden="true"
    >
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={1.8} />
    </span>
  );
}

function strong(text: ReactNode, className = 'text-ink') {
  return <strong className={`font-semibold ${className}`}>{text}</strong>;
}

function roleLabel(value: unknown): string {
  return ROLE_LABELS[value as Role] ?? String(value ?? '');
}

function taskStatusLabel(value: unknown): string {
  return TASK_STATUS_LABELS[String(value)] ?? String(value ?? '');
}

function sentenceParts(entry: ProjectActivityEntry): [string, ReactNode] {
  const details = entry.details ?? {};
  const label = entry.entity_label ?? '—';

  switch (entry.action) {
    case 'user.role_changed':
      return [
        'Changed role of',
        <>
          {strong(label)} from {roleLabel(details.from)} to {strong(roleLabel(details.to))}
        </>,
      ];
    case 'user.created':
      return ['Created user', strong(label)];
    case 'user.updated':
      return ['Updated details of', strong(label)];
    case 'user.approved':
      return ['Approved', strong(label)];
    case 'user.deactivated':
      return ['Deactivated', strong(label)];
    case 'user.activated':
      return ['Activated', strong(label)];
    case 'user.password_reset':
      return ['Reset password of', strong(label)];
    case 'user.deleted':
      return ['Deleted user', strong(label)];
    case 'project.created':
      return ['Created project', strong(label)];
    case 'project.archived':
      return ['Archived project', strong(label)];
    case 'project.unarchived':
      return ['Unarchived project', strong(label)];
    case 'project.deleted':
      return ['Deleted project', strong(label)];
    case 'project.member_added':
      return ['Added', <>{strong(String(details.member ?? '—'))} to {strong(label)}</>];
    case 'project.member_removed':
      return ['Removed', <>{strong(String(details.member ?? '—'))} from {strong(label)}</>];
    case 'task.created':
      return ['Created task', strong(label)];
    case 'task.status_changed':
      return [
        'Changed status of',
        <>
          {strong(label)} from {taskStatusLabel(details.from)} to {strong(taskStatusLabel(details.to))}
        </>,
      ];
    case 'task.commented':
      return ['Commented on', strong(label)];
    case 'file.uploaded':
      return ['Uploaded', strong(label)];
    case 'file.deleted':
      return ['Deleted file', strong(label)];
    case 'auth.password_changed':
      return ['Changed their password', null];
    case 'auth.password_reset_requested':
      return ['Requested a password reset link', null];
    case 'auth.password_reset_completed':
      return ['Reset their password with an emailed link', null];
    case 'auth.login':
      return ['Signed in from', strong(String(details.client ?? 'Unknown device'))];
    case 'auth.logout':
      return ['Signed out', null];
    case 'auth.register':
      return ['Created an account', null];
    case 'auth.denied':
      return ['Blocked request to', <>{strong(label, 'text-[#B42318]')} — 403 Forbidden</>];
    default:
      return [entry.action, null];
  }
}

/**
 * Sentence for an event; object names are bold (mirrors activity_service.describe).
 * With `withActor`, it starts with the actor's name: "Afef Ben Kalia deactivated …".
 */
export function ActivitySentence({ entry, withActor = false }: { entry: ProjectActivityEntry; withActor?: boolean }) {
  const [verb, rest] = sentenceParts(entry);
  const actor = withActor && entry.actor ? entry.actor.full_name : null;
  return (
    <>
      {actor && <>{strong(actor)} </>}
      {actor ? verb.charAt(0).toLowerCase() + verb.slice(1) : verb}
      {rest && <> {rest}</>}
    </>
  );
}

function ActorCell({ entry }: { entry: ActivityEntry }) {
  if (!entry.actor) {
    return <span className="text-[13px] font-semibold text-ink-secondary">System</span>;
  }
  const isAdmin = entry.actor.role === 'admin';
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={entry.actor.full_name} size={30} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-semibold text-ink">{entry.actor.full_name}</p>
        <p className={`text-xs ${isAdmin ? 'text-[#B54708]' : 'text-ink-muted'}`}>
          {ROLE_LABELS[entry.actor.role]}
        </p>
      </div>
    </div>
  );
}

const COLUMNS: Column<ActivityEntry>[] = [
  {
    key: 'time',
    header: 'Time',
    width: 110,
    render: (entry) => (
      <div className="leading-tight">
        <p className="text-[13px] font-bold text-[#344054]">{dayLabel(entry.created_at)}</p>
        <p className="mt-0.5 font-mono text-xs text-ink-muted">{timeOfDay(entry.created_at)}</p>
      </div>
    ),
  },
  { key: 'user', header: 'User', width: 210, render: (entry) => <ActorCell entry={entry} /> },
  {
    key: 'action',
    header: 'Action',
    render: (entry) => (
      <div className="flex items-center gap-3">
        <ActivityIcon type={entry.type} />
        <p className="min-w-0 text-[13px] text-[#475467]">
          <ActivitySentence entry={entry} />
        </p>
      </div>
    ),
  },
  {
    key: 'target',
    header: 'Target',
    width: 180,
    render: (entry) => <Badge tone={TARGET_TONES[entry.target_kind]}>{entry.target_label}</Badge>,
  },
  {
    key: 'ip',
    header: 'IP address',
    width: 120,
    render: (entry) => <span className="font-mono text-xs text-ink-secondary">{entry.ip ?? '—'}</span>,
  },
];

export interface AuditTableProps {
  entries: ActivityEntry[];
  loading: boolean;
  footer?: ReactNode;
}

export function AuditTable({ entries, loading, footer }: AuditTableProps) {
  return (
    <Table
      caption="Activity log"
      columns={COLUMNS}
      rows={entries}
      getRowKey={(entry) => entry.id}
      rowClassName={(entry) => (entry.type === 'denied' ? 'bg-[#FFFBFA]' : '')}
      loading={loading}
      minWidth={980}
      footer={footer}
    />
  );
}

export default AuditTable;
