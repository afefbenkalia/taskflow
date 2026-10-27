import { Calendar } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { exportActivity, listActivity, type ActivityFilters } from '../../../api/activity';
import { apiErrorMessage } from '../../../api/client';
import { listProjects } from '../../../api/projects';
import { listUsers } from '../../../api/users';
import { Alert } from '../../../components/ui/Alert';
import { PageHeader } from '../../../components/ui/Card';
import { ExportMenu } from '../../../components/ui/ExportMenu';
import { SearchInput } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { FilterSelect, type SelectOption } from '../../../components/ui/Select';
import { useDebounce } from '../../../hooks/useDebounce';
import { useQueryState } from '../../../hooks/usePagination';
import type { ExportFormat, Page } from '../../../types';
import type { ActivityEntry, ActivityPeriod, ActivityType } from '../../../types/activity';
import { AuditTable } from './AuditTable';

const PAGE_SIZE = 10;
const DEFAULT_PERIOD: ActivityPeriod = '7d';

const TYPE_OPTIONS: SelectOption<ActivityType>[] = [
  { value: 'role', label: 'Role changes' },
  { value: 'status', label: 'Status changes' },
  { value: 'create', label: 'Created' },
  { value: 'auth', label: 'Sign-ins' },
  { value: 'deactivate', label: 'Deactivations' },
  { value: 'update', label: 'Updates' },
  { value: 'denied', label: 'Access denied' },
];

const PERIOD_OPTIONS: SelectOption<ActivityPeriod>[] = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

export function ActivityLogPage() {
  const { get, page, update, setPage } = useQueryState();
  const [searchText, setSearchText] = useState(get('search'));
  const search = useDebounce(searchText.trim(), 300);

  const userId = get('user_id');
  const type = get('type') as ActivityType | '';
  const projectId = get('project_id');
  const period = (get('period') as ActivityPeriod) || DEFAULT_PERIOD;

  const [data, setData] = useState<Page<ActivityEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [userOptions, setUserOptions] = useState<SelectOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    if (search !== get('search')) update({ search });
  }, [search, get, update]);

  const filters = useMemo<ActivityFilters>(
    () => ({
      search: search || undefined,
      user_id: userId ? Number(userId) : undefined,
      type: type || undefined,
      project_id: projectId ? Number(projectId) : undefined,
      period,
    }),
    [search, userId, type, projectId, period],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listActivity({ ...filters, page, page_size: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load the activity log.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, page]);

  // Filter choices: every user and every project (including archived ones).
  useEffect(() => {
    listUsers({ page_size: 100 })
      .then((result) =>
        setUserOptions(result.items.map((user) => ({ value: String(user.id), label: user.full_name }))),
      )
      .catch(() => undefined);
    listProjects({ scope: 'all', page_size: 100 })
      .then((result) =>
        setProjectOptions(result.items.map((project) => ({ value: String(project.id), label: project.name }))),
      )
      .catch(() => undefined);
  }, []);

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await exportActivity(filters, format);
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Unable to export the activity log.'));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity log"
        subtitle="Complete audit trail of changes across all users and projects."
        actions={<ExportMenu label="Export" exporting={exporting} onExport={handleExport} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="Search activity"
          placeholder="Search activity…"
          width={280}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <FilterSelect
          label="All users"
          allLabel="All users"
          value={userId}
          options={userOptions}
          onChange={(value) => update({ user_id: value })}
          width={240}
        />
        <FilterSelect
          label="All actions"
          allLabel="All actions"
          value={type}
          options={TYPE_OPTIONS}
          onChange={(value) => update({ type: value })}
        />
        <FilterSelect
          label="All projects"
          allLabel="All projects"
          value={projectId}
          options={projectOptions}
          onChange={(value) => update({ project_id: value })}
          width={240}
        />
        <FilterSelect
          label="Period"
          allLabel=""
          icon={Calendar}
          value={period}
          options={PERIOD_OPTIONS}
          onChange={(value) => update({ period: value === DEFAULT_PERIOD ? null : value })}
        />
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <AuditTable
        entries={data?.items ?? []}
        loading={loading && !data}
        footer={
          data && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              itemLabel="events"
              onPageChange={setPage}
            />
          )
        }
      />
    </div>
  );
}

export default ActivityLogPage;
