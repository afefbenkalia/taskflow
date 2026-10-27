import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { apiErrorMessage, type ApiErrorBody } from '../../../api/client';
import {
  createProject,
  deleteProject,
  exportProjects,
  listProjects,
  setProjectArchived,
  type ProjectPage,
} from '../../../api/projects';
import { listUsers } from '../../../api/users';
import { Alert, Toast } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, PageHeader, Skeleton } from '../../../components/ui/Card';
import { ExportMenu } from '../../../components/ui/ExportMenu';
import { Input, SearchInput } from '../../../components/ui/Input';
import { ConfirmDialog, Modal } from '../../../components/ui/Modal';
import { Pagination } from '../../../components/ui/Pagination';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { FilterSelect, Select, type SelectOption } from '../../../components/ui/Select';
import { useDebounce } from '../../../hooks/useDebounce';
import { useQueryState } from '../../../hooks/usePagination';
import type { ExportFormat } from '../../../types';
import type { Project, ProjectHealth, ProjectScope, ProjectSummary } from '../../../types/project';
import { HEALTH_STYLES, ProjectsTable, type ProjectAction } from './ProjectsTable';

const PAGE_SIZE = 10;

const SUMMARY_CARDS: { key: keyof ProjectSummary; label: string; color: string }[] = [
  { key: 'active', label: 'Active', color: '#4F46E5' },
  { key: 'on_track', label: 'On track', color: '#12B76A' },
  { key: 'at_risk', label: 'At risk', color: '#F79009' },
  { key: 'overdue', label: 'Overdue', color: '#F04438' },
  { key: 'archived', label: 'Archived', color: '#98A2B3' },
];

const SCOPE_LABELS: Record<ProjectScope, string> = {
  active: 'active projects',
  archived: 'archived projects',
  all: 'projects',
};

const HEALTH_OPTIONS = (Object.keys(HEALTH_STYLES) as ProjectHealth[]).map((value) => ({
  value,
  label: HEALTH_STYLES[value].label,
}));

const PROJECT_COLORS = ['#4F46E5', '#0D9488', '#D97706', '#DB2777', '#2563EB', '#16A34A'];

const projectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.').max(120, 'Project name must be at most 120 characters.'),
  key: z.string().trim().regex(/^[A-Za-z]{3}$/, 'Key must be exactly 3 letters.'),
  description: z.string().trim(),
  owner_id: z.string().min(1, 'Choose an owner.'),
  due_date: z.string(),
  color: z.string(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

interface NewProjectModalProps {
  open: boolean;
  owners: SelectOption[];
  onClose: () => void;
  onCreated: (project: Project) => void;
}

/** Minimal form: the design has no screen for project creation. */
function NewProjectModal({ open, owners, onClose, onCreated }: NewProjectModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({ resolver: zodResolver(projectSchema) });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    reset({ name: '', key: '', description: '', owner_id: '', due_date: '', color: PROJECT_COLORS[0] });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const project = await createProject({
        name: values.name,
        key: values.key.toUpperCase(),
        description: values.description || null,
        owner_id: Number(values.owner_id),
        due_date: values.due_date || null,
        color: values.color,
      });
      onCreated(project);
      onClose();
    } catch (error) {
      const response = axios.isAxiosError<ApiErrorBody>(error) ? error.response : undefined;
      if (response?.status === 409) {
        setError('key', { message: response.data.detail }, { shouldFocus: true });
        return;
      }
      setFormError(apiErrorMessage(error, 'The project could not be created.'));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isSubmitting}
      title="New project"
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={isSubmitting}>
            Create project
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
          <Input label="Name" autoComplete="off" error={errors.name?.message} {...register('name')} />
          <Input
            label="Key"
            autoComplete="off"
            maxLength={3}
            placeholder="ABC"
            className="[&_input]:font-mono [&_input]:uppercase"
            error={errors.key?.message}
            {...register('key')}
          />
        </div>
        <div>
          <label htmlFor="project-description" className="mb-1.5 block text-[13px] font-semibold text-ink-label">
            Description
          </label>
          <textarea
            id="project-description"
            rows={3}
            className="block w-full resize-none rounded-field border border-line bg-white px-[14px] py-[11px] text-[15px] text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
            {...register('description')}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Owner"
            placeholder="Select an owner"
            options={owners}
            error={errors.owner_id?.message}
            {...register('owner_id')}
          />
          <Input label="Due date" type="date" error={errors.due_date?.message} {...register('due_date')} />
        </div>
        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-ink-label">Color</legend>
              <div className="flex gap-2.5" role="radiogroup" aria-label="Color">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={field.value === color}
                    aria-label={color}
                    onClick={() => field.onChange(color)}
                    className={`h-8 w-8 rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${
                      field.value === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0B1220]' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </fieldset>
          )}
        />
      </form>
    </Modal>
  );
}

export function AllProjectsPage() {
  const { get, page, update, setPage } = useQueryState();
  const [searchText, setSearchText] = useState(get('search'));
  const search = useDebounce(searchText.trim(), 300);
  const scope = (get('scope') as ProjectScope) || 'active';
  const ownerId = get('owner_id');
  const health = get('health') as ProjectHealth | '';

  const [data, setData] = useState<ProjectPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [owners, setOwners] = useState<SelectOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (search !== get('search')) update({ search });
  }, [search, get, update]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProjects({
      scope,
      search: search || undefined,
      owner_id: ownerId ? Number(ownerId) : undefined,
      health: health || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load projects.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scope, search, ownerId, health, page, reloadKey]);

  useEffect(() => {
    listUsers({ status: 'active', page_size: 100 })
      .then((result) =>
        setOwners(result.items.map((user) => ({ value: String(user.id), label: user.full_name }))),
      )
      .catch(() => undefined);
  }, []);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const closeToast = useCallback(() => setToast(null), []);

  const handleAction = async (project: Project, action: ProjectAction) => {
    if (action === 'delete') {
      setDeleteError(null);
      setDeleting(project);
      return;
    }
    try {
      await setProjectArchived(project.id, action === 'archive');
      setToast(`${project.name} was ${action === 'archive' ? 'archived' : 'restored'}.`);
      reload();
    } catch (reason) {
      setError(apiErrorMessage(reason, 'The project could not be updated.'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteProject(deleting.id);
      setToast(`${deleting.name} was deleted.`);
      setDeleting(null);
      reload();
    } catch (reason) {
      setDeleteError(apiErrorMessage(reason, 'The project could not be deleted.'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await exportProjects(format);
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Unable to export projects.'));
    } finally {
      setExporting(null);
    }
  };

  const summary = data?.summary;
  const scopeOptions = useMemo(
    () => [
      { value: 'active' as const, label: 'Active', count: summary?.active },
      { value: 'archived' as const, label: 'Archived', count: summary?.archived },
      { value: 'all' as const, label: 'All', count: summary?.all },
    ],
    [summary],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="All projects"
        subtitle="Every project in the workspace — including ones you are not a member of."
        actions={
          <>
            <ExportMenu label="Export" exporting={exporting} onExport={handleExport} />
            <Button
              onClick={() => setCreating(true)}
              leftIcon={<Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
            >
              New project
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
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

      {/* Tabs and filters share one row from xl; below, the filters get their own row.
          Search, Owner and Health never wrap: the search field shrinks first. */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="shrink-0">
          <SegmentedControl
            ariaLabel="Filter projects"
            options={scopeOptions}
            value={scope}
            onChange={(value) => update({ scope: value === 'active' ? null : value })}
          />
        </div>
        <div className="flex w-full min-w-0 items-center gap-3 xl:w-auto xl:flex-1 xl:justify-end">
          <SearchInput
            label="Search projects"
            placeholder="Search projects…"
            width={260}
            className="min-w-0 flex-1"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <FilterSelect
            label="Owner"
            value={ownerId}
            options={owners}
            onChange={(value) => update({ owner_id: value })}
            width={240}
          />
          <FilterSelect
            label="Health"
            value={health}
            options={HEALTH_OPTIONS}
            onChange={(value) => update({ health: value })}
          />
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <ProjectsTable
        projects={data?.items ?? []}
        loading={loading && !data}
        onAction={handleAction}
        footer={
          data && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              itemLabel={SCOPE_LABELS[scope]}
              onPageChange={setPage}
            />
          )
        }
      />

      <NewProjectModal
        open={creating}
        owners={owners}
        onClose={() => setCreating(false)}
        onCreated={(project) => {
          setToast(`${project.name} was created.`);
          reload();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete project"
        message={
          deleting && (
            <>
              Permanently delete <strong className="text-ink">{deleting.name}</strong> and its{' '}
              {deleting.tasks_total} tasks? This can’t be undone.
            </>
          )
        }
        confirmLabel="Delete project"
        tone="danger"
        loading={deleteBusy}
        error={deleteError && <Alert variant="error">{deleteError}</Alert>}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}

export default AllProjectsPage;
