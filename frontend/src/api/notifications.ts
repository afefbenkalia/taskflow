import type { AppNotification, NotificationPage } from '../types/notification';
import { api, cleanParams } from './client';

export interface NotificationParams {
  unread?: boolean;
  page?: number;
  page_size?: number;
}

export async function getNotifications(params: NotificationParams = {}): Promise<NotificationPage> {
  const { data } = await api.get<NotificationPage>('/notifications', {
    params: cleanParams({ ...params, unread: params.unread || undefined }),
  });
  return data;
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

export async function markNotificationRead(id: number): Promise<AppNotification> {
  const { data } = await api.post<AppNotification>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data } = await api.post<{ updated: number }>('/notifications/read-all');
  return data.updated;
}
