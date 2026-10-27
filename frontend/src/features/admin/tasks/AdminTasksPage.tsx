import { ArrowDownUp, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';

import { apiErrorMessage } from '../../../api/client';
import { listProjects } from '../../../api/projects';
import { listAdminTasks, type AdminTaskPage } from '../../../api/tasks';
import { listUsers } from '../../../api/users';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Card, PageHeader, Skeleton } from '../../../components/ui/Card';
import { SearchInput } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { FilterSelect, type SelectOption } from '../../../components/ui/Select';
import { useDebounce } from '../../../hooks/useDebounce';
import { useQueryState } from '../../../hooks/usePagination';
import type { ProjectScope } from '../../../types/project';
import type { AdminTaskStatus, DueFilter, Priority, TaskSort, TaskSummary } from '../../../types/task';
import { AdminTasksTable } from './AdminTasksTable';

const PAGE_SIZE = 10;
const UNASSIGNED = 'none';

const SUMMARY_CARDS: { key: keyof TaskSummary; label: string; color: string }[] = [
  { key: 'total', label: 'Total', color: '#4F46E5' },
  { key: 'todo', label: 'To do', color: '#98A2B3' },
  { key: 'in_progress', label: 'In progress', color: '#6366F1' },
  { key: 'done', label: 'Done', color: '#12B76A' },
  { key: 'overdue', label: 'Overdue', color: '#F04438' },
  { key: 'unassigned', label: 'Unassigned', color: '#F79009' },
];

const SCOPE_OPTIONS: { value: ProjectScope; label: string }[] = [
  { value: 'active', label: 'Active projects' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

const STATUS_OPTIONS: SelectOption<AdminTaskStatus>[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'overdue', label: 'Overdue' },
];

const PRIORITY_OPTIONS: SelectOption<Priority>[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const DUE_OPTIONS: SelectOption<Exclude<DueFilter, 'any'>>[] = [
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Due this week' },
  { value: 'overdue', label: 'Overdue' },
];

const SORT_OPTIONS: SelectOption<TaskSort>[] = [
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'recent', label: 'Newest' },
];

/** Admin console › Tasks: monitor every task. Read-only — tasks are changed in the member workspace. */
export function AdminTasksPage() {
  const { get, update, page, setPage } = useQueryState();
  const [searchText, setSearchText] = useState(get('search'));
  const search = useDebounce(searchText.trim(), 300);
  const scope = (get('scope') as ProjectScope) || 'active';
  const projectId = get('project_id');
  const assignee = get('assignee');
  const status = get('status') as AdminTaskStatus | '';
  const priority = get('priority') as Priority | '';
  const due = get('due') as Exclude<DueFilter, 'any'> | '';
  const sort = (get('sort') as TaskSort) || 'due';

  const [data, setData] = useState<AdminTaskPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<SelectOption[]>([]);
  const [people, setPeople] = useState<SelectOption[]>([]);

  useEffect(() => {
    if (search !== get('search')) update({ search });
  }, [search, get, update]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAdminTasks({
      scope,
      search: search || undefined,
      project_id: projectId ? Number(projectId) : undefined,
      assignee_id: assignee && assignee !== UNASSIGNED ? Number(assignee) : undefined,
      unassigned: assignee === UNASSIGNED,
      status: status || undefined,
      priority: priority || undefined,
      due: due || undefined,
      sort,
      page,
      page_size: PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load tasks.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scope, search, projectId, assignee, status, priority, due, sort, page]);

  useEffect(() => {
    listProjects({ scope: 'all', page_size: 100 })
      .then((result) => setProjects(result.items.map((project) => ({ value: String(project.id), label: project.name }))))
      .catch(() => undefined);
    listUsers({ page_size: 100 })
      .then((result) => setPeople(result.items.map((user) => ({ value: String(user.id), label: user.full_name }))))
      .catch(() => undefined);
  }, []);

  const summary = data?.summary;
  const filtered = Boolean(search || projectId || assignee || status || priority || due);
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? 'Due date';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Badge tone="gray" icon={<Eye className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />}>
            Read-only
          </Badge>
        }
        title="All tasks"
        subtitle="Monitor progress, status, priority, deadlines and assignees across the workspace."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {SUMMARY_CARDS.map((card) => (
          <Card key={card.key} padding="px-[18px] py-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-secondary">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: card.color }} aria-hidden="true" />
              {card.label}
            </p>
            {summary ? (
              <p className="mt-1.5 text-2xl font-extrabold text-ink">{summary[card.key]}</p>
            ) : (
              <Skeleton className="mt-2.5 h-6 w-10" />
            )}
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          ariaLabel="Projects"
          options={SCOPE_OPTIONS}
          value={scope}
          onChange={(value) => update({ scope: value === 'active' ? null : value })}
        />
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            label="Search tasks"
            placeholder="Search by title or key…"
            width={240}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <FilterSelect
            label="Project"
            value={projectId}
            options={projects}
            allLabel="All projects"
            onChange={(value) => update({ project_id: value })}
            width={240}
          />
          <FilterSelect
            label="Assignee"
            value={assignee}
            options={[{ value: UNASSIGNED, label: 'Unassigned' }, ...people]}
            allLabel="Everyone"
            onChange={(value) => update({ assignee: value })}
            width={240}
          />
          <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={(value) => update({ status: value })} />
          <FilterSelect
            label="Priority"
            value={priority}
            options={PRIORITY_OPTIONS}
            onChange={(value) => update({ priority: value })}
          />
          <FilterSelect label="Due" value={due} options={DUE_OPTIONS} allLabel="Any time" onChange={(value) => update({ due: value })} />
          <FilterSelect
            label={`Sort: ${sortLabel}`}
            showValue={false}
            icon={ArrowDownUp}
            value={sort}
            options={SORT_OPTIONS}
            allLabel=""
            onChange={(value) => update({ sort: value && value !== 'due' ? value : null })}
          />
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <AdminTasksTable
        tasks={data?.items ?? []}
        loading={loading && !data}
        filtered={filtered}
        footer={
          data && (
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} itemLabel="tasks" onPageChange={setPage} />
          )
        }
      />
    </div>
  );
}

export default AdminTasksPage;
