export type Role = 'admin' | 'user';

export type UserStatus = 'active' | 'pending' | 'deactivated';

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  role: Role;
  status: UserStatus;
  job_title: string | null;
  created_at: string;
}

/** Compact reference used in projects, workload and activity rows. */
export interface UserBrief {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
}

export interface AdminUser extends User {
  projects_count: number;
  last_active_at: string | null;
  is_self: boolean;
}

/** GET /me: the signed-in user's own profile. */
export interface Me extends User {
  phone: string | null;
  timezone: string;
  last_active_at: string | null;
  password_changed_at: string | null;
  sessions_count: number;
}

export interface MeCounts {
  open_tasks: number;
  projects: number;
}

export interface UserCounts {
  all: number;
  admins: number;
  members: number;
  pending: number;
  deactivated: number;
}
