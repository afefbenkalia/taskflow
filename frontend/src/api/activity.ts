import type { ExportFormat, Page } from '../types';
import type { ActivityEntry, ActivityPeriod, ActivityType } from '../types/activity';
import { api, cleanParams, downloadFile } from './client';

export interface ActivityFilters {
  search?: string;
  user_id?: number;
  type?: ActivityType;
  project_id?: number;
  period?: ActivityPeriod;
}

export interface ActivityListParams extends ActivityFilters {
  page?: number;
  page_size?: number;
}

const BASE = '/admin/activity';

export async function listActivity(params: ActivityListParams): Promise<Page<ActivityEntry>> {
  const { data } = await api.get<Page<ActivityEntry>>(BASE, { params: cleanParams(params) });
  return data;
}

export function exportActivity(filters: ActivityFilters, format: ExportFormat = 'csv'): Promise<void> {
  return downloadFile(`${BASE}/export`, { ...filters, format }, `taskflow-activity.${format}`);
}
