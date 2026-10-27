import { Check, Search, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { apiErrorMessage } from '../../../api/client';
import { addProjectMember, getMemberCandidates, removeProjectMember } from '../../../api/projects';
import { Alert } from '../../../components/ui/Alert';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ConfirmDialog, Modal } from '../../../components/ui/Modal';
import { Table, type Column } from '../../../components/ui/Table';
import { pluralize, shortDate } from '../../../lib/format';
import type { MemberCandidate, ProjectMember } from '../../../types/project';

interface AddMemberModalProps {
  open: boolean;
  projectId: number;
  projectName: string;
  onClose: () => void;
  onAdded: (name: string) => void;
}

function AddMemberModal({ open, projectId, projectName, onClose, onAdded }: AddMemberModalProps) {
  const [candidates, setCandidates] = useState<MemberCandidate[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setCandidates(null);
    setQuery('');
    setSelected(null);
    setError(null);
    getMemberCandidates(projectId)
      .then((rows) => !cancelled && setCandidates(rows))
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load users.')));
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (candidates ?? []).filter(
      (candidate) =>
        !needle ||
        candidate.full_name.toLowerCase().includes(needle) ||
        candidate.email.toLowerCase().includes(needle),
    );
  }, [candidates, query]);

  const submit = async () => {
    const candidate = candidates?.find((row) => row.id === selected);
    if (!candidate) return;
    setSaving(true);
    setError(null);
    try {
      await addProjectMember(projectId, candidate.id);
      onAdded(candidate.full_name);
    } catch (reason) {
      setError(apiErrorMessage(reason, 'The member couldn’t be added.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      width={480}
      title="Add member"
      description={`Give a teammate access to ${projectName}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={selected === null}>
            Add to project
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert variant="error">{error}</Alert>}
        <label className="relative block">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            className="block w-full rounded-field border border-line bg-white py-[10px] pl-10 pr-3.5 text-sm text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition placeholder:text-ink-muted focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </label>

        {candidates === null && !error ? (
          <Skeleton className="h-40 w-full" />
        ) : candidates && visible.length === 0 ? (
          <p className="rounded-[10px] bg-[#F9FAFB] px-3.5 py-6 text-center text-[13px] text-ink-secondary">
            {candidates.length === 0 ? 'Everyone is already a member of this project.' : 'No one matches your search.'}
          </p>
        ) : (
          <ul role="listbox" aria-label="People" className="max-h-72 space-y-1 overflow-y-auto">
            {visible.map((candidate) => {
              const active = candidate.id === selected;
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelected(candidate.id)}
                    className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                      active ? 'border-[#C7D2FE] bg-[#F5F6FF]' : 'border-transparent hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <Avatar name={candidate.full_name} size={32} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-semibold text-ink">{candidate.full_name}</span>
                      <span className="block truncate text-xs text-ink-secondary">
                        {candidate.job_title ? `${candidate.job_title} · ${candidate.email}` : candidate.email}
                      </span>
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export interface MembersTabProps {
  projectId: number;
  projectName: string;
  members: ProjectMember[] | null;
  canManage: boolean;
  /** Called after a member is added or removed, with a confirmation message. */
  onChanged: (message: string) => void;
}

export function MembersTab({ projectId, projectName, members, canManage, onChanged }: MembersTabProps) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmRemove = async () => {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await removeProjectMember(projectId, removing.user.id);
      onChanged(`${removing.user.full_name} was removed from the project.`);
      setRemoving(null);
    } catch (reason) {
      setError(apiErrorMessage(reason, 'The member couldn’t be removed.'));
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<ProjectMember>[] = [
    {
      key: 'member',
      header: 'Member',
      render: (member) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={member.user.full_name} size={36} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-ink">
              {member.user.full_name}
              {member.is_self && <span className="font-medium text-ink-secondary"> (you)</span>}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-secondary">
              {member.job_title ? `${member.job_title} · ${member.email}` : member.email}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: 90,
      render: (member) =>
        member.role_in_project === 'owner' ? <Badge tone="amber">Owner</Badge> : <Badge tone="gray">Member</Badge>,
    },
    {
      key: 'open',
      header: 'Open tasks',
      width: 80,
      align: 'right',
      render: (member) => <span className="text-[13px] font-semibold text-ink">{member.open_tasks}</span>,
    },
    {
      key: 'done',
      header: 'Completed',
      width: 80,
      align: 'right',
      render: (member) => <span className="text-[13px] font-semibold text-[#475467]">{member.done_tasks}</span>,
    },
    {
      key: 'joined',
      header: 'Joined',
      width: 70,
      render: (member) => <span className="text-[13px] text-[#475467]">{shortDate(member.joined_at)}</span>,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            width: 36,
            align: 'right' as const,
            render: (member: ProjectMember) =>
              member.can_remove ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setRemoving(member);
                  }}
                  aria-label={`Remove ${member.user.full_name}`}
                  title="Remove from project"
                  className="rounded-lg p-1.5 text-ink-muted transition hover:bg-[#FEF3F2] hover:text-[#D92D20] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D92D20]/30"
                >
                  <UserMinus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">Members</h2>
          <p className="mt-0.5 text-[13px] text-ink-secondary">
            {members ? `${pluralize(members.length, 'person', 'people')} can see and work on this project.` : ' '}
          </p>
        </div>
        {canManage && (
          <Button
            variant="secondary"
            onClick={() => setAdding(true)}
            leftIcon={<UserPlus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
          >
            Add member
          </Button>
        )}
      </div>

      <Table
        caption="Project members"
        columns={columns}
        rows={members ?? []}
        getRowKey={(member) => member.user.id}
        loading={members === null}
        skeletonRows={4}
        minWidth={680}
        empty={<EmptyState icon={Users} title="No members yet" description="Members you add will appear here." />}
      />

      <AddMemberModal
        open={adding}
        projectId={projectId}
        projectName={projectName}
        onClose={() => setAdding(false)}
        onAdded={(name) => {
          setAdding(false);
          onChanged(`${name} was added to the project.`);
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.user.full_name ?? ''}?`}
        message={`They’ll lose access to ${projectName}. Their open tasks will become unassigned.`}
        confirmLabel="Remove member"
        tone="danger"
        loading={busy}
        error={error && <Alert variant="error">{error}</Alert>}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

export default MembersTab;
