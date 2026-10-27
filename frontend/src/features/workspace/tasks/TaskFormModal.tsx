import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { apiErrorMessage, type ApiErrorBody } from '../../../api/client';
import { getProjectMembers } from '../../../api/projects';
import { createTask } from '../../../api/tasks';
import { getMyProjects } from '../../../api/users';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select, type SelectOption } from '../../../components/ui/Select';
import { useAuth } from '../../../hooks/useAuth';
import {
  TASK_DESCRIPTION_MAX_LENGTH,
  taskFormSchema,
  type TaskFormValues,
} from '../../../lib/validators';
import type { Task, TaskStatus } from '../../../types/task';
import { STATUS_ORDER, TASK_STATUS_META } from './StatusMenu';

export interface TaskFormDefaults {
  projectId?: number;
  status?: TaskStatus;
  /** "2026-10-24", e.g. the day picked in the calendar. */
  dueDate?: string;
  /** Opened from a project page: the project cannot be changed. */
  lockProject?: boolean;
}

export interface TaskFormModalProps {
  open: boolean;
  defaults: TaskFormDefaults;
  onClose: () => void;
  onCreated: (task: Task) => void;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const STATUS_OPTIONS = STATUS_ORDER.map((value) => ({ value, label: TASK_STATUS_META[value].label }));

type FormField = keyof TaskFormValues;

/** Minimal "New task" form: the design has no screen for it. */
export function TaskFormModal({ open, defaults, onClose, onCreated }: TaskFormModalProps) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<SelectOption[]>([]);
  const [members, setMembers] = useState<SelectOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({ resolver: zodResolver(taskFormSchema) });

  const projectId = watch('project_id');
  const description = watch('description') ?? '';

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    reset({
      title: '',
      description: '',
      project_id: defaults.projectId ? String(defaults.projectId) : '',
      assignee_id: user ? String(user.id) : '',
      priority: 'medium',
      due_date: defaults.dueDate ?? '',
      status: defaults.status ?? 'todo',
    });
    getMyProjects()
      .then((items) => setProjects(items.map((project) => ({ value: String(project.id), label: project.name }))))
      .catch((reason) => setFormError(apiErrorMessage(reason, 'Unable to load your projects.')));
  }, [open, defaults, reset, user]);

  // Assignees are the members of the chosen project; default to me.
  useEffect(() => {
    if (!open || !projectId) {
      setMembers([]);
      return undefined;
    }
    let cancelled = false;
    getProjectMembers(Number(projectId))
      .then((items) => {
        if (cancelled) return;
        setMembers(
          items.map((member) => ({
            value: String(member.user.id),
            label: member.is_self ? `${member.user.full_name} (you)` : member.user.full_name,
          })),
        );
        if (user) setValue('assignee_id', String(user.id));
      })
      .catch(() => !cancelled && setMembers([]));
    return () => {
      cancelled = true;
    };
  }, [open, projectId, setValue, user]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const task = await createTask({
        title: values.title,
        description: values.description.trim() || null,
        project_id: Number(values.project_id),
        assignee_id: values.assignee_id ? Number(values.assignee_id) : null,
        priority: values.priority,
        due_date: values.due_date || null,
        status: values.status,
      });
      onCreated(task);
      onClose();
    } catch (error) {
      const body = axios.isAxiosError<ApiErrorBody>(error) ? error.response?.data : undefined;
      const fieldErrors = (body?.errors ?? []).filter((item) => item.field && item.field in taskFormSchema.shape);
      fieldErrors.forEach(({ field, message }) => setError(field as FormField, { message }));
      if (fieldErrors.length === 0) setFormError(apiErrorMessage(error, 'The task could not be created.'));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isSubmitting}
      title="New task"
      width={540}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" loading={isSubmitting}>
            Create task
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        <Input label="Title*" autoComplete="off" error={errors.title?.message} {...register('title')} />
        <div>
          <label htmlFor="task-description" className="mb-1.5 block text-[13px] font-semibold text-ink-label">
            Description
          </label>
          <textarea
            id="task-description"
            rows={3}
            maxLength={TASK_DESCRIPTION_MAX_LENGTH}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby="task-description-hint"
            className="block w-full resize-none rounded-field border border-line bg-white px-[14px] py-[11px] text-[15px] text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
            {...register('description')}
          />
          <p id="task-description-hint" className={`mt-1.5 text-xs ${errors.description ? 'text-danger' : 'text-ink-muted'}`}>
            {errors.description?.message ?? `${description.length}/${TASK_DESCRIPTION_MAX_LENGTH}`}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Project*"
            placeholder="Select a project"
            options={projects}
            disabled={defaults.lockProject}
            error={errors.project_id?.message}
            {...register('project_id')}
          />
          <Select
            label="Assignee"
            options={members}
            disabled={!projectId}
            error={errors.assignee_id?.message}
            {...register('assignee_id')}
          />
          <Select label="Priority" options={PRIORITY_OPTIONS} error={errors.priority?.message} {...register('priority')} />
          <Input label="Due date" type="date" error={errors.due_date?.message} {...register('due_date')} />
          <Select label="Status" options={STATUS_OPTIONS} error={errors.status?.message} {...register('status')} />
        </div>
      </form>
    </Modal>
  );
}

export default TaskFormModal;
