import type { Page } from '../types';
import type { ProjectScope } from '../types/project';
import type {
  AdminTask,
  AdminTaskStatus,
  DueFilter,
  Priority,
  Task,
  TaskComment,
  TaskCreatePayload,
  TaskSort,
  TaskStatus,
  TaskSummary,
} from '../types/task';
import { api, cleanParams } from './client';

export async function createTask(payload: TaskCreatePayload): Promise<Task> {
  const { data } = await api.post<Task>('/tasks', payload);
  return data;
}

export async function changeTaskStatus(id: number, status: TaskStatus): Promise<Task> {
  const { data } = await api.patch<Task>(`/tasks/${id}/status`, { status });
  return data;
}

// --- comments (members of the task's project) ----------------------------------------

export async function getTaskComments(taskId: number): Promise<TaskComment[]> {
  const { data } = await api.get<TaskComment[]>(`/tasks/${taskId}/comments`);
  return data;
}

export async function addTaskComment(taskId: number, content: string): Promise<TaskComment> {
  const { data } = await api.post<TaskComment>(`/tasks/${taskId}/comments`, { content });
  return data;
}

export async function deleteTaskComment(taskId: number, commentId: number): Promise<void> {
  await api.delete(`/tasks/${taskId}/comments/${commentId}`);
}

// --- admin console: read-only ------------------------------------------------------

export interface AdminTaskParams {
  scope?: ProjectScope;
  search?: string;
  project_id?: number;
  assignee_id?: number;
  unassigned?: boolean;
  status?: AdminTaskStatus;
  priority?: Priority;
  due?: DueFilter;
  sort?: TaskSort;
  page?: number;
  page_size?: number;
}

export interface AdminTaskPage extends Page<AdminTask> {
  summary: TaskSummary;
}

export async function listAdminTasks(params: AdminTaskParams): Promise<AdminTaskPage> {
  const { data } = await api.get<AdminTaskPage>('/admin/tasks', {
    params: cleanParams({ ...params, unassigned: params.unassigned || undefined }),
  });
  return data;
}
