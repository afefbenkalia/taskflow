import type { MyProject } from './project';
import type { UserBrief } from './user';

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export type Priority = 'low' | 'medium' | 'high';

export type DueFilter = 'any' | 'today' | 'week' | 'overdue';

export interface Subtask {
  id: number;
  title: string;
  is_done: boolean;
  position: number;
}

export interface TaskProjectRef {
  id: number;
  key: string;
  name: string;
  color: string;
}

export interface Task {
  id: number;
  key: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  project: TaskProjectRef;
  assignee: UserBrief | null;
  creator_id: number | null;
  subtasks_done: number;
  subtasks_total: number;
  comments_count: number;
  can_change_status: boolean;
}

/** Max length mirrored from backend/app/schemas/task.py (COMMENT_MAX_LENGTH). */
export const COMMENT_MAX_LENGTH = 1000;

export interface TaskComment {
  id: number;
  author: UserBrief | null;
  content: string;
  created_at: string;
  /** The author, or the project owner. */
  can_delete: boolean;
}

// --- admin console (read-only) ---------------------------------------------------

/** Status filter of the admin Tasks page; "overdue" = open and past its due date. */
export type AdminTaskStatus = TaskStatus | 'overdue';

export type TaskSort = 'due' | 'recent' | 'priority';

export interface AdminTask {
  id: number;
  key: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  overdue: boolean;
  project: TaskProjectRef & { archived: boolean };
  assignee: UserBrief | null;
  creator: UserBrief | null;
  subtasks_done: number;
  subtasks_total: number;
  comments_count: number;
}

/** Counts over the selected scope, before the other filters. */
export interface TaskSummary {
  total: number;
  todo: number;
  in_progress: number;
  done: number;
  overdue: number;
  unassigned: number;
}

export interface TaskCreatePayload {
  title: string;
  description: string | null;
  project_id: number;
  assignee_id: number | null;
  priority: Priority;
  due_date: string | null;
  status: TaskStatus;
}

export interface Dashboard {
  hero: { due_this_week: number; overdue: number; weekly_done: number; weekly_target: number };
  stats: {
    assigned_open: number;
    high_priority: number;
    due_this_week: number;
    overdue: number;
    completed_this_month: number;
    completed_prev_month: number;
    prev_month_label: string;
  };
  focus: {
    today: Task[];
    upcoming: Task[];
    overdue: Task[];
    counts: { today: number; upcoming: number; overdue: number };
  };
  my_projects: MyProject[];
  week: { date: string; has_due: boolean }[];
  next_deadline: Task | null;
}
