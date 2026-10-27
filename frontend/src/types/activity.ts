import type { UserBrief } from './user';

export type ActivityType = 'role' | 'status' | 'create' | 'auth' | 'deactivate' | 'update' | 'denied';

export type ActivityPeriod = '24h' | '7d' | '30d';

export type TargetKind = 'user' | 'task' | 'project' | 'file' | 'session' | 'security';

export interface ActivityEntry {
  id: number;
  actor: UserBrief | null;
  action: string;
  type: ActivityType;
  entity_type: string;
  entity_id: number | null;
  entity_label: string | null;
  target_kind: TargetKind;
  target_label: string;
  details: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

/** GET /projects/{id}/activity: what members see (no IP, no audit target). */
export type ProjectActivityEntry = Omit<ActivityEntry, 'ip' | 'target_kind' | 'target_label'>;

/** GET /me/activity: entries across the member's projects, tagged with their project. */
export interface WorkspaceActivityEntry extends ProjectActivityEntry {
  project: { id: number; key: string; name: string; color: string } | null;
}
