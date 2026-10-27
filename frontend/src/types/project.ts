import type { UserBrief } from './user';

export type ProjectHealth = 'on_track' | 'at_risk' | 'overdue' | 'completed';

export type ProjectScope = 'active' | 'archived' | 'all';

export interface Project {
  id: number;
  key: string;
  name: string;
  description: string | null;
  color: string;
  owner: UserBrief;
  members: UserBrief[];
  members_count: number;
  tasks_total: number;
  tasks_done: number;
  progress: number;
  due_date: string | null;
  health: ProjectHealth;
  archived: boolean;
  created_at: string;
}

export interface ProjectSummary {
  active: number;
  on_track: number;
  at_risk: number;
  overdue: number;
  archived: number;
  all: number;
}

export type ProjectRole = 'owner' | 'member';

/** A project the signed-in member belongs to. */
export interface MyProject {
  id: number;
  key: string;
  name: string;
  color: string;
  my_role: ProjectRole;
  progress: number;
  done: number;
  total: number;
  due_date: string | null;
  health: ProjectHealth;
}

export interface ProjectDetail {
  id: number;
  key: string;
  name: string;
  description: string | null;
  color: string;
  owner: UserBrief;
  due_date: string | null;
  health: ProjectHealth;
  progress: number;
  tasks_done: number;
  tasks_count: number;
  members_count: number;
  files_count: number;
  my_role: ProjectRole;
  archived: boolean;
  created_at: string;
}

export interface ProjectMember {
  user: UserBrief;
  email: string;
  job_title: string | null;
  role_in_project: ProjectRole;
  is_self: boolean;
  joined_at: string;
  open_tasks: number;
  done_tasks: number;
  /** Only the owner may remove members, never the owner themself. */
  can_remove: boolean;
}

/** An active user the owner can add to the project. */
export interface MemberCandidate {
  id: number;
  full_name: string;
  email: string;
  job_title: string | null;
}

export interface ProjectFile {
  id: number;
  name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: UserBrief | null;
  created_at: string;
  can_delete: boolean;
}

export type PermissionKey =
  | 'create_tasks'
  | 'update_status'
  | 'comment'
  | 'edit_settings'
  | 'manage_members'
  | 'archive_delete';

export interface ProjectPermission {
  key: PermissionKey;
  label: string;
  allowed: boolean;
}

export interface ProjectCreatePayload {
  name: string;
  key: string;
  description: string | null;
  owner_id: number;
  due_date: string | null;
  color: string;
}
