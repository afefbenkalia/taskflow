import type { ActivityEntry } from './activity';
import type { UserBrief } from './user';

export type * from './activity';
export type * from './project';
export type * from './task';
export type * from './user';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type StatsPeriod = '7d' | '30d' | '90d';

/** File format of the admin exports. */
export type ExportFormat = 'csv' | 'pdf';

export interface SidebarCounts {
  users: number;
  projects: number;
  tasks: number;
}

export type KpiKey = 'users' | 'projects' | 'completed' | 'overdue';

export interface Kpi {
  key: KpiKey;
  label: string;
  value: number;
  /** Percent change vs the previous period of the same length. */
  delta: number;
  sparkline: number[];
}

export interface ThroughputWeek {
  label: string;
  created: number;
  completed: number;
}

export interface StatusBreakdown {
  done: number;
  in_progress: number;
  todo: number;
  overdue: number;
  total: number;
  projects: number;
}

export interface WorkloadEntry {
  user: UserBrief;
  open_tasks: number;
  capacity: number;
}

export interface Overview {
  period: StatsPeriod;
  kpis: Kpi[];
  throughput: ThroughputWeek[];
  status: StatusBreakdown;
  completion_rate: number;
  /** Percentage points vs the start of the period. */
  completion_delta: number;
  workload: WorkloadEntry[];
  admin_activity: ActivityEntry[];
}
