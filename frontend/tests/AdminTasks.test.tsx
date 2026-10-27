import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContextValue } from '../src/context/AuthContext';
import { AppRoutes } from '../src/routes';
import type { AdminTask } from '../src/types/task';
import type { UserBrief } from '../src/types/user';

const mocks = vi.hoisted(() => ({ listAdminTasks: vi.fn() }));

vi.mock('../src/hooks/useAuth', () => ({
  useAuth: (): AuthContextValue => ({
    user: {
      id: 1, first_name: 'Afef', last_name: 'Ben Kalia', full_name: 'Afef Ben Kalia', email: 'afef@taskflow.io',
      role: 'admin', status: 'active', job_title: null, created_at: '2026-01-01T00:00:00Z',
    },
    accessToken: 'token',
    status: 'authenticated',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));
vi.mock('../src/api/tasks', () => ({ listAdminTasks: mocks.listAdminTasks, createTask: vi.fn(), changeTaskStatus: vi.fn() }));
vi.mock('../src/api/stats', () => ({
  getSidebarCounts: vi.fn().mockResolvedValue({ users: 24, projects: 7, tasks: 3 }),
  getOverview: vi.fn(),
  exportReport: vi.fn(),
}));
vi.mock('../src/api/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/projects')>()),
  listProjects: vi.fn().mockResolvedValue({ items: [{ id: 1, name: 'Website redesign' }], total: 1, page: 1, page_size: 100 }),
}));
vi.mock('../src/api/users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/users')>()),
  listUsers: vi.fn().mockResolvedValue({ items: [{ id: 3, full_name: 'Sarah Mansour' }], total: 1, page: 1, page_size: 100 }),
}));
vi.mock('../src/api/notifications', () => ({
  getUnreadCount: vi.fn().mockResolvedValue(0),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const SARAH: UserBrief = { id: 3, first_name: 'Sarah', last_name: 'Mansour', full_name: 'Sarah Mansour', role: 'user' };
const PROJECT = { id: 1, key: 'WEB', name: 'Website redesign', color: '#4F46E5', archived: false };

function task(id: number, overrides: Partial<AdminTask>): AdminTask {
  return {
    id, key: `WEB-${id}`, title: `Task ${id}`, status: 'todo', priority: 'medium', due_date: null,
    completed_at: null, created_at: '2026-10-01T09:00:00Z', overdue: false, project: PROJECT,
    assignee: SARAH, creator: null, subtasks_done: 0, subtasks_total: 0, comments_count: 0,
    ...overrides,
  };
}

const TASKS = [
  task(41, { title: 'Fix checkout bug', due_date: '2026-10-20', overdue: true, priority: 'high' }),
  task(42, { title: 'Homepage mockup', status: 'in_progress', subtasks_done: 3, subtasks_total: 5 }),
  task(43, { title: 'Write release notes', assignee: null, status: 'done', completed_at: '2026-10-22T10:00:00Z' }),
];

function renderPage(path = '/admin/tasks') {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('admin Tasks page (read-only)', () => {
  beforeEach(() => {
    mocks.listAdminTasks.mockReset().mockResolvedValue({
      items: TASKS, total: 3, page: 1, page_size: 10,
      summary: { total: 3, todo: 1, in_progress: 1, done: 1, overdue: 1, unassigned: 1 },
    });
  });

  it('is reachable from the sidebar', async () => {
    renderPage();

    const nav = screen.getByRole('navigation', { name: 'Admin navigation' });
    const link = within(nav).getByRole('link', { name: /Tasks/ });
    expect(link).toHaveAttribute('href', '/admin/tasks');
    expect(link).toHaveAttribute('aria-current', 'page');
    await screen.findByText('Fix checkout bug');
  });

  it('shows every task with its project, assignee, priority, status and deadline', async () => {
    renderPage();

    const table = await screen.findByRole('table', { name: 'All tasks (read-only)' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Fix checkout bug');
    expect(rows[0]).toHaveTextContent('WEB-41');
    expect(rows[0]).toHaveTextContent('Website redesign');
    expect(rows[0]).toHaveTextContent('Sarah Mansour');
    expect(rows[0]).toHaveTextContent('High');
    expect(rows[0]).toHaveTextContent('To do');
    expect(rows[0]).toHaveTextContent('Overdue');
    expect(rows[1]).toHaveTextContent('In progress');
    expect(rows[1]).toHaveTextContent('3/5');
    expect(rows[2]).toHaveTextContent('Unassigned');
    expect(rows[2]).toHaveTextContent('Done Oct 22');
    expect(screen.getByText('Read-only')).toBeInTheDocument();
  });

  it('offers no way to create, edit or delete tasks', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'All tasks (read-only)' });

    // Nothing inside the table is interactive.
    expect(within(table).queryAllByRole('button')).toHaveLength(0);
    expect(within(table).queryAllByRole('link')).toHaveLength(0);
    expect(within(table).queryAllByRole('textbox')).toHaveLength(0);
    // And no task action anywhere on the page.
    for (const name of [/new task/i, /add task/i, /edit/i, /delete/i, /change status/i]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('filters through the API', async () => {
    const user = renderPage();
    await screen.findByText('Fix checkout bug');

    await user.click(screen.getByRole('button', { name: 'Status' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Overdue' }));

    expect(mocks.listAdminTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'overdue', scope: 'active', sort: 'due', page: 1 }),
    );

    await user.click(screen.getByRole('button', { name: 'Assignee' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Unassigned' }));

    expect(mocks.listAdminTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ unassigned: true, assignee_id: undefined, status: 'overdue' }),
    );
  });

  it('reads filters from the URL', async () => {
    renderPage('/admin/tasks?scope=archived&priority=high&sort=priority');
    await screen.findByText('Fix checkout bug');

    expect(mocks.listAdminTasks).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'archived', priority: 'high', sort: 'priority' }),
    );
  });
});
