import type { ExportFormat, Overview, SidebarCounts, StatsPeriod } from '../types';
import { api, downloadFile } from './client';

const BASE = '/admin/stats';

export async function getSidebarCounts(): Promise<SidebarCounts> {
  const { data } = await api.get<SidebarCounts>(`${BASE}/counts`);
  return data;
}

export async function getOverview(period: StatsPeriod): Promise<Overview> {
  const { data } = await api.get<Overview>(`${BASE}/overview`, { params: { period } });
  return data;
}

export function exportReport(period: StatsPeriod, format: ExportFormat = 'csv'): Promise<void> {
  return downloadFile(`${BASE}/export`, { period, format }, `taskflow-report-${period}.${format}`);
}
