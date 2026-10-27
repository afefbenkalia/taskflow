import type { Page } from './index';
import type { UserBrief } from './user';

export interface AppNotification {
  id: number;
  kind: string;
  actor: UserBrief | null;
  /** Sentence without the actor's name, e.g. "assigned you Homepage mockup in Website redesign". */
  message: string;
  /** Where it leads for the signed-in user's role; null when nowhere. */
  link: string | null;
  project: { id: number; name: string; color: string } | null;
  read: boolean;
  created_at: string;
}

export interface NotificationPage extends Page<AppNotification> {
  unread_count: number;
}
