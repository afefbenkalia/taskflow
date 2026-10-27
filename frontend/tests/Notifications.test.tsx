import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarAdmin } from '../src/components/navigation/SidebarAdmin';
import { NotificationBell } from '../src/components/notifications/NotificationBell';
import { NotificationsProvider } from '../src/context/NotificationsContext';
import { NotificationsPage } from '../src/features/notifications/NotificationsPage';
import type { AppNotification } from '../src/types/notification';
import type { UserBrief } from '../src/types/user';

const api = vi.hoisted(() => ({
  getUnreadCount: vi.fn(),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
vi.mock('../src/api/notifications', () => api);

const SARAH: UserBrief = { id: 3, first_name: 'Sarah', last_name: 'Mansour', full_name: 'Sarah Mansour', role: 'user' };
const NOUR: UserBrief = { id: 9, first_name: 'Nour', last_name: 'Kefi', full_name: 'Nour Kefi', role: 'user' };
const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

const ASSIGNED: AppNotification = {
  id: 2,
  kind: 'task.assigned',
  actor: SARAH,
  message: 'assigned you Homepage mockup in Website redesign',
  link: '/app/projects/1?tab=tasks',
  project: { id: 1, name: 'Website redesign', color: '#4F46E5' },
  read: false,
  created_at: new Date().toISOString(),
};
const REGISTERED: AppNotification = {
  id: 1,
  kind: 'user.registered',
  actor: NOUR,
  message: 'signed up and is waiting for approval',
  link: '/admin/users?status=pending',
  project: null,
  read: true,
  created_at: new Date().toISOString(),
};

function page(items: AppNotification[], unread: number) {
  return { items, total: items.length, page: 1, page_size: 20, unread_count: unread };
}

function renderWithProvider(element: JSX.Element, path: string, pagePath = '/app/notifications') {
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <Routes>
        <Route
          element={
            <NotificationsProvider pagePath={pagePath}>
              {element}
              <Outlet />
            </NotificationsProvider>
          }
        >
          <Route path="/app" element={<p>Home page</p>} />
          <Route path="/app/projects/:id" element={<p>Project page</p>} />
          <Route path="/app/notifications" element={<NotificationsPage />} />
          <Route path="/admin" element={<p>Admin home</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('notification bell', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.getUnreadCount.mockResolvedValue(1);
    api.getNotifications.mockResolvedValue(page([ASSIGNED, REGISTERED], 1));
    api.markNotificationRead.mockResolvedValue({ ...ASSIGNED, read: true });
    api.markAllNotificationsRead.mockResolvedValue(1);
  });

  it('shows the unread count from the API', async () => {
    renderWithProvider(<NotificationBell />, '/app');

    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
  });

  it('opens the latest notifications and follows a link, marking it read', async () => {
    const user = renderWithProvider(<NotificationBell />, '/app');

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(api.getNotifications).toHaveBeenCalledWith({ page_size: 6 });
    // The counter is re-read after navigating; the server then has nothing unread.
    api.getUnreadCount.mockResolvedValue(0);
    await user.click(
      await within(panel).findByRole('button', { name: /Sarah Mansour assigned you Homepage mockup/ }),
    );

    expect(api.markNotificationRead).toHaveBeenCalledWith(2);
    expect(await screen.findByText('Project page')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('marks everything as read', async () => {
    const user = renderWithProvider(<NotificationBell />, '/app');

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    await within(panel).findByText('Nour Kefi');
    await user.click(within(panel).getByRole('button', { name: 'Mark all as read' }));

    expect(api.markAllNotificationsRead).toHaveBeenCalled();
    expect(within(panel).getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('says when there is nothing new', async () => {
    api.getUnreadCount.mockResolvedValue(0);
    api.getNotifications.mockResolvedValue(page([], 0));
    const user = renderWithProvider(<NotificationBell />, '/app');

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(await screen.findByText('You’re all caught up')).toBeInTheDocument();
  });
});

describe('Notifications page', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.getUnreadCount.mockResolvedValue(1);
    api.getNotifications.mockResolvedValue(page([ASSIGNED, REGISTERED], 1));
    api.markNotificationRead.mockResolvedValue({ ...ASSIGNED, read: true });
  });

  it('lists notifications by day and marks one as read', async () => {
    const user = renderWithProvider(<></>, '/app/notifications');

    const today = await screen.findByRole('region', { name: 'Today' });
    expect(within(today).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('You have 1 unread notification.')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Mark as read: Sarah Mansour assigned you Homepage mockup in Website redesign' }),
    );

    expect(api.markNotificationRead).toHaveBeenCalledWith(2);
    expect(await screen.findByText('You’re all caught up.')).toBeInTheDocument();
    // Marking as read stays on the page.
    expect(screen.queryByText('Project page')).not.toBeInTheDocument();
  });

  it('filters unread notifications', async () => {
    const user = renderWithProvider(<></>, '/app/notifications');
    await screen.findByRole('region', { name: 'Today' });
    api.getNotifications.mockResolvedValue(page([], 0));

    await user.click(screen.getByRole('button', { name: /^Unread/ }));

    expect(api.getNotifications).toHaveBeenLastCalledWith({ unread: true, page: 1, page_size: 20 });
    expect(await screen.findByText('No unread notifications')).toBeInTheDocument();
  });
});

describe('admin sidebar', () => {
  it('links Notifications with the unread badge', async () => {
    api.getUnreadCount.mockReset().mockResolvedValue(12);
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <NotificationsProvider pagePath="/admin/notifications">
          <SidebarAdmin counts={null} userName="Afef Ben Kalia" onLogout={vi.fn()} />
        </NotificationsProvider>
      </MemoryRouter>,
    );

    const link = await screen.findByRole('link', { name: 'Notifications 9+ unread' });
    expect(link).toHaveAttribute('href', '/admin/notifications');
  });
});
