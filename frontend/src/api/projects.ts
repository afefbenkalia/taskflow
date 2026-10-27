import type { ExportFormat, Page } from '../types';
import type { ProjectActivityEntry } from '../types/activity';
import type {
  MemberCandidate,
  Project,
  ProjectCreatePayload,
  ProjectDetail,
  ProjectFile,
  ProjectHealth,
  ProjectMember,
  ProjectPermission,
  ProjectScope,
  ProjectSummary,
} from '../types/project';
import type { Task } from '../types/task';
import { api, cleanParams, downloadFile, saveBlob } from './client';

export interface ProjectListParams {
  scope?: ProjectScope;
  search?: string;
  owner_id?: number;
  health?: ProjectHealth;
  page?: number;
  page_size?: number;
}

export interface ProjectPage extends Page<Project> {
  summary: ProjectSummary;
}

const BASE = '/admin/projects';

export async function listProjects(params: ProjectListParams): Promise<ProjectPage> {
  const { data } = await api.get<ProjectPage>(BASE, { params: cleanParams(params) });
  return data;
}

export async function createProject(payload: ProjectCreatePayload): Promise<Project> {
  const { data } = await api.post<Project>(BASE, payload);
  return data;
}

export async function setProjectArchived(id: number, archived: boolean): Promise<Project> {
  const { data } = await api.post<Project>(`${BASE}/${id}/${archived ? 'archive' : 'unarchive'}`);
  return data;
}

export async function deleteProject(id: number): Promise<void> {
  await api.delete(`${BASE}/${id}`);
}

export function exportProjects(format: ExportFormat = 'csv'): Promise<void> {
  return downloadFile(`${BASE}/export`, { format }, `taskflow-projects.${format}`);
}

// --- member workspace (404 unless the user belongs to the project) ---------------

export async function getProject(id: number): Promise<ProjectDetail> {
  const { data } = await api.get<ProjectDetail>(`/projects/${id}`);
  return data;
}

export async function getProjectTasks(id: number): Promise<Task[]> {
  const { data } = await api.get<Task[]>(`/projects/${id}/tasks`);
  return data;
}

export async function getProjectMembers(id: number): Promise<ProjectMember[]> {
  const { data } = await api.get<ProjectMember[]>(`/projects/${id}/members`);
  return data;
}

export async function getProjectPermissions(id: number): Promise<ProjectPermission[]> {
  const { data } = await api.get<ProjectPermission[]>(`/projects/${id}/permissions`);
  return data;
}

// Members: managed by the project owner only.

export async function getMemberCandidates(id: number): Promise<MemberCandidate[]> {
  const { data } = await api.get<MemberCandidate[]>(`/projects/${id}/member-candidates`);
  return data;
}

export async function addProjectMember(id: number, userId: number): Promise<ProjectMember[]> {
  const { data } = await api.post<ProjectMember[]>(`/projects/${id}/members`, { user_id: userId });
  return data;
}

export async function removeProjectMember(id: number, userId: number): Promise<void> {
  await api.delete(`/projects/${id}/members/${userId}`);
}

export async function getProjectActivity(
  id: number,
  params: { page?: number; page_size?: number } = {},
): Promise<Page<ProjectActivityEntry>> {
  const { data } = await api.get<Page<ProjectActivityEntry>>(`/projects/${id}/activity`, {
    params: cleanParams(params),
  });
  return data;
}

// Files: any member uploads and downloads; the uploader or the owner deletes.

export async function getProjectFiles(id: number): Promise<ProjectFile[]> {
  const { data } = await api.get<ProjectFile[]>(`/projects/${id}/files`);
  return data;
}

export async function uploadProjectFile(id: number, file: File): Promise<ProjectFile> {
  const form = new FormData();
  form.append('file', file);
  // Overrides the JSON default (axios would serialize FormData to JSON); the
  // browser then sets the header itself, with the multipart boundary.
  const { data } = await api.post<ProjectFile>(`/projects/${id}/files`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function downloadProjectFile(id: number, file: Pick<ProjectFile, 'id' | 'name'>): Promise<void> {
  const response = await api.get<Blob>(`/projects/${id}/files/${file.id}/download`, { responseType: 'blob' });
  saveBlob(response.data, file.name);
}

export async function deleteProjectFile(id: number, fileId: number): Promise<void> {
  await api.delete(`/projects/${id}/files/${fileId}`);
}
