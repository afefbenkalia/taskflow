import { KeyRound, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiErrorMessage } from '../../../api/client';
import { getMyProjects, getMyTasks } from '../../../api/users';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/Card';
import { SearchInput } from '../../../components/ui/Input';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { FilterSelect, type SelectOption } from '../../../components/ui/Select';
import { useDebounce } from '../../../hooks/useDebounce';
import { useQueryState } from '../../../hooks/usePagination';
import { pluralize } from '../../../lib/format';
import { useWorkspace } from '../../../layouts/UserLayout';
import type { DueFilter, Priority, Task } from '../../../types/task';
import { KanbanColumn } from './KanbanColumn';
import { MyTasksList } from './MyTasksList';
import { STATUS_ORDER, useStatusUpdater } from './StatusMenu';
import { TaskDetailsModal } from './TaskDetailsModal';

const PRIORITY_OPTIONS: SelectOption<Priority>[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const DUE_OPTIONS: SelectOption<Exclude<DueFilter, 'any'>>[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'overdue', label: 'Overdue' },
];

type TasksView = 'board' | 'list';

const VIEW_OPTIONS: { value: TasksView; label: string }[] = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
];

function labelOf<T extends string>(options: SelectOption<T>[], value: string, fallback: string) {
  return options.find((option) => option.value === value)?.label ?? fallback;
}

export function MyTasksBoard() {
  const { refreshKey, notifyChanged, openNewTask } = useWorkspace();
  const { get, update } = useQueryState();
  const [searchText, setSearchText] = useState(get('search'));
  const search = useDebounce(searchText.trim(), 300);
  const projectId = get('project_id');
  const priority = get('priority') as Priority | '';
  const due = get('due') as DueFilter | '';
  const view: TasksView = get('view') === 'list' ? 'list' : 'board';

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectOptions, setProjectOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    if (search !== get('search')) update({ search });
  }, [search, get, update]);

  useEffect(() => {
    let cancelled = false;
    getMyTasks({
      search: search || undefined,
      project_id: projectId ? Number(projectId) : undefined,
      priority: priority || undefined,
      due: due || undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setTasks(result);
        setError(null);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load your tasks.')));
    return () => {
      cancelled = true;
    };
  }, [search, projectId, priority, due, refreshKey]);

  useEffect(() => {
    getMyProjects()
      .then((projects) => setProjectOptions(projects.map((project) => ({ value: String(project.id), label: project.name }))))
      .catch(() => undefined);
  }, [refreshKey]);

  const updateTask = useCallback(
    (taskId: number, next: (task: Task) => Task) =>
      setTasks((current) => current && current.map((task) => (task.id === taskId ? next(task) : task))),
    [],
  );
  const status = useStatusUpdater(updateTask, notifyChanged);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  // Read from the list so the details follow status changes made on the board.
  const openTask = tasks?.find((task) => task.id === openTaskId) ?? null;

  const columns = useMemo(
    () => Object.fromEntries(STATUS_ORDER.map((value) => [value, (tasks ?? []).filter((task) => task.status === value)])),
    [tasks],
  );
  const projectCount = new Set((tasks ?? []).map((task) => task.project.id)).size;

  return (
    // On md+ the board fills the viewport (minus top bar and padding); columns scroll independently.
    <div className="flex flex-col gap-6 md:h-[calc(100vh-120px)] md:min-h-[560px] xl:h-[calc(100vh-136px)]">
      <PageHeader
        title="My tasks"
        subtitle={
          tasks
            ? `${pluralize(tasks.length, 'task')} assigned to you across ${pluralize(projectCount, 'project')}`
            : ' '
        }
        actions={
          <>
            <SegmentedControl
              ariaLabel="View"
              options={VIEW_OPTIONS}
              value={view}
              onChange={(value) => update({ view: value === 'board' ? null : value })}
            />
            <Button
              onClick={() => openNewTask()}
              leftIcon={<Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
            >
              New task
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            label="Search my tasks"
            placeholder="Search my tasks…"
            width={260}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <FilterSelect
            label={`Project: ${labelOf(projectOptions, projectId, 'All')}`}
            showValue={false}
            value={projectId}
            options={projectOptions}
            onChange={(value) => update({ project_id: value })}
            width={240}
          />
          <FilterSelect
            label={`Priority: ${labelOf(PRIORITY_OPTIONS, priority, 'All')}`}
            showValue={false}
            value={priority}
            options={PRIORITY_OPTIONS}
            onChange={(value) => update({ priority: value })}
          />
          <FilterSelect
            label={`Due: ${labelOf(DUE_OPTIONS, due, 'Any')}`}
            showValue={false}
            allLabel="Any"
            value={due}
            options={DUE_OPTIONS}
            onChange={(value) => update({ due: value })}
          />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF2FF] px-3 py-2 text-xs font-semibold text-[#4338CA]">
          <KeyRound className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} aria-hidden="true" />
          Only tasks you own or are assigned to
        </span>
      </div>

      {(error || status.error) && <Alert variant="error">{error ?? status.error}</Alert>}

      {view === 'list' ? (
        // The list scrolls inside the page height, like the board columns.
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MyTasksList
            tasks={tasks === null && error ? [] : tasks}
            onStatusChange={status.change}
            onOpen={(task) => setOpenTaskId(task.id)}
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-3">
          {STATUS_ORDER.map((value) => (
            <KanbanColumn
              key={value}
              status={value}
              tasks={columns[value] ?? []}
              loading={tasks === null && !error}
              onAdd={(statusValue) => openNewTask({ status: statusValue })}
              onStatusChange={status.change}
              onOpen={(task) => setOpenTaskId(task.id)}
            />
          ))}
        </div>
      )}

      <TaskDetailsModal
        task={openTask}
        onClose={() => setOpenTaskId(null)}
        onCommentsChange={(task, count) => updateTask(task.id, (current) => ({ ...current, comments_count: count }))}
      />
    </div>
  );
}

export default MyTasksBoard;
