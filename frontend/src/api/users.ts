import type { Page } from '../types';
import type { WorkspaceActivityEntry } from '../types/activity';
import type { MyProject } from '../types/project';
import type { Dashboard, DueFilter, Priority, Task } from '../types/task';
import type { AdminUser, Me, MeCounts, Role, UserCounts, UserStatus } from '../types/user';
import { api, cleanParams } from './client';

export interface UserListParams {
  search?: string;
  role?: Role;
  status?: UserStatus;
  page?: number;
  page_size?: number;
}

export interface AdminUserPage extends Page<AdminUser> {
  counts: UserCounts;
}

export interface UserCreatePayload {
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
}

export interface UserUpdatePayload {
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
}

export interface UserCreatedResponse {
  user: AdminUser;
  temporary_password: string;
}

const BASE = '/admin/users';

export async function listUsers(params: UserListParams): Promise<AdminUserPage> {
  const { data } = await api.get<AdminUserPage>(BASE, { params: cleanParams(params) });
  return data;
}

export async function createUser(payload: UserCreatePayload): Promise<UserCreatedResponse> {
  const { data } = await api.post<UserCreatedResponse>(BASE, payload);
  return data;
}

export async function updateUser(id: number, payload: UserUpdatePayload): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(`${BASE}/${id}`, payload);
  return data;
}

export async function changeRole(id: number, role: Role): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(`${BASE}/${id}/role`, { role });
  return data;
}

type StatusAction = 'approve' | 'deactivate' | 'activate';

export async function setUserStatus(id: number, action: StatusAction): Promise<AdminUser> {
  const { data } = await api.post<AdminUser>(`${BASE}/${id}/${action}`);
  return data;
}

export async function resetPassword(id: number): Promise<string> {
  const { data } = await api.post<{ temporary_password: string }>(`${BASE}/${id}/reset-password`);
  return data.temporary_password;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`${BASE}/${id}`);
}

// --- current user (/me) ------------------------------------------------------------

export interface MyTaskFilters {
  search?: string;
  project_id?: number;
  priority?: Priority;
  due?: DueFilter;
  /** Inclusive range of due dates ("2026-10-01"); tasks without a due date are excluded. */
  due_from?: string;
  due_to?: string;
}

export interface MyActivityParams {
  project_id?: number;
  /** Only events I made. */
  mine?: boolean;
  page?: number;
  page_size?: number;
}

export interface MeUpdatePayload {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  timezone: string;
}

export interface PasswordChangePayload {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export async function getMe(): Promise<Me> {
  const { data } = await api.get<Me>('/me');
  return data;
}

export async function updateMe(payload: Partial<MeUpdatePayload>): Promise<Me> {
  const { data } = await api.patch<Me>('/me', payload);
  return data;
}

export async function changePassword(payload: PasswordChangePayload): Promise<void> {
  await api.put('/me/password', payload);
}

export async function getMeCounts(): Promise<MeCounts> {
  const { data } = await api.get<MeCounts>('/me/counts');
  return data;
}

export async function getDashboard(): Promise<Dashboard> {
  const { data } = await api.get<Dashboard>('/me/dashboard');
  return data;
}

export async function getMyTasks(filters: MyTaskFilters): Promise<Task[]> {
  const { data } = await api.get<Task[]>('/me/tasks', { params: cleanParams(filters) });
  return data;
}

export async function getMyProjects(): Promise<MyProject[]> {
  const { data } = await api.get<MyProject[]>('/me/projects');
  return data;
}

export async function getMyActivity(params: MyActivityParams): Promise<Page<WorkspaceActivityEntry>> {
  const { data } = await api.get<Page<WorkspaceActivityEntry>>('/me/activity', {
    params: cleanParams({ ...params, mine: params.mine || undefined }),
  });
  return data;
}
