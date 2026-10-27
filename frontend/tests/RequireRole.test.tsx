import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContextValue } from '../src/context/AuthContext';
import { UsersTable } from '../src/features/admin/users/UsersTable';
import { AppRoutes } from '../src/routes';
import type { Dashboard, Overview } from '../src/types';
import type { AdminUser, Role, User } from '../src/types/user';

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: mocks.useAuth }));

const OVERVIEW: Overview = {
  period: '30d',
  kpis: [
    { key: 'users', label: 'Total users', value: 24, delta: 12, sparkline: [18, 19, 20, 21, 22, 23, 23, 24] },
    { key: 'projects', label: 'Active projects', value: 7, delta: 17, sparkline: [6, 6, 6, 6, 6, 7, 7, 7] },
    { key: 'completed', label: 'Tasks completed', value: 45, delta: 8, sparkline: [4, 5, 6, 5, 7, 6, 6, 6] },
    { key: 'overdue', label: 'Overdue tasks', value: 7, delta: -12, sparkline: [9, 9, 8, 8, 8, 7, 7, 7] },
  ],
  throughput: [],
  status: { done: 76, in_progress: 24, todo: 27, overdue: 7, total: 134, projects: 7 },
  completion_rate: 57,
  completion_delta: 8,
  workload: [],
  admin_activity: [],
};

vi.mock('../src/api/stats', () => ({
  getSidebarCounts: vi.fn().mockResolvedValue({ users: 24, projects: 7, tasks: 134 }),
  getOverview: vi.fn(() => Promise.resolve(OVERVIEW)),
  exportReport: vi.fn(),
}));

const DASHBOARD: Dashboard = {
  hero: { due_this_week: 3, overdue: 1, weekly_done: 3, weekly_target: 10 },
  stats: {
    assigned_open: 7, high_priority: 3, due_this_week: 3, overdue: 1,
    completed_this_month: 4, completed_prev_month: 1, prev_month_label: 'Sep',
  },
  focus: { today: [], upcoming: [], overdue: [], counts: { today: 0, upcoming: 0, overdue: 0 } },
  my_projects: [],
  week: [],
  next_deadline: null,
};

vi.mock('../src/api/users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/users')>()),
  getMeCounts: vi.fn().mockResolvedValue({ open_tasks: 8, projects: 4 }),
  getDashboard: vi.fn(() => Promise.resolve(DASHBOARD)),
}));

// Both layouts poll the unread notifications counter.
vi.mock('../src/api/notifications', () => ({
  getUnreadCount: vi.fn().mockResolvedValue(0),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

function makeUser(role: Role): User {
  return {
    id: role === 'admin' ? 1 : 3,
    first_name: role === 'admin' ? 'Afef' : 'Sarah',
    last_name: role === 'admin' ? 'Ben Kalia' : 'Mansour',
    full_name: role === 'admin' ? 'Afef Ben Kalia' : 'Sarah Mansour',
    email: role === 'admin' ? 'afef@taskflow.io' : 'sarah.m@taskflow.io',
    role,
    status: 'active',
    job_title: null,
    created_at: '2026-01-01T00:00:00Z',
  };
}

function signInAs(role: Role | null) {
  const value: AuthContextValue = {
    user: role ? makeUser(role) : null,
    accessToken: role ? 'token' : null,
    status: role ? 'authenticated' : 'anonymous',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
  mocks.useAuth.mockReturnValue(value);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('role-based routing', () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
  });

  /** The workspace layout loads its sidebar counters; wait for them to settle. */
  async function waitForWorkspace() {
    await screen.findByText('8');
  }

  it('redirects a member opening /admin to the 403 page', async () => {
    signInAs('user');
    renderAt('/admin');

    expect(
      screen.getByRole('heading', { name: 'This area is for administrators only' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/You’re signed in as/)).toHaveTextContent(
      'You’re signed in as Sarah Mansour (Member).',
    );
    await waitForWorkspace();
  });

  it.each(['/admin/users', '/admin/projects', '/admin/activity'])(
    'redirects a member opening %s to the 403 page',
    async (path) => {
      signInAs('user');
      renderAt(path);

      expect(screen.getByText('Error 403 · Forbidden')).toBeInTheDocument();
      expect(screen.queryByText('User management')).not.toBeInTheDocument();
      await waitForWorkspace();
    },
  );

  it('shows the admin console to an admin', async () => {
    signInAs('admin');
    renderAt('/admin');

    expect(
      screen.getByRole('heading', { name: /^Good (morning|afternoon|evening), Afef$/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Admin navigation' })).toBeInTheDocument();
    expect(await screen.findByText('Total users')).toBeInTheDocument();
    expect(screen.getByText('134 tasks across 7 projects')).toBeInTheDocument();
  });

  it('sends signed-out visitors to the sign-in page', () => {
    signInAs(null);
    renderAt('/admin');

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('redirects / according to the role', async () => {
    signInAs('user');
    renderAt('/');

    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^Good (morning|afternoon|evening), Sarah$/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/You have 3 tasks due this week and 1 overdue/)).toBeInTheDocument();
  });

  it('shows the 403 page inside the workspace layout for a member', async () => {
    signInAs('user');
    renderAt('/admin');

    const nav = screen.getByRole('navigation', { name: 'Workspace navigation' });
    expect(nav).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'This area is for administrators only' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin navigation' })).not.toBeInTheDocument();
    // Sidebar counters come from GET /me/counts.
    expect(await within(nav).findByText('8')).toBeInTheDocument();
  });
});

describe('RoleSelector in the users table', () => {
  function adminUser(overrides: Partial<AdminUser>): AdminUser {
    return {
      ...makeUser('admin'),
      projects_count: 2,
      last_active_at: null,
      is_self: false,
      ...overrides,
    };
  }

  const ME = adminUser({ is_self: true });
  const SARAH = adminUser({ ...makeUser('user'), id: 3, is_self: false });

  function renderTable() {
    const onRoleChange = vi.fn();
    render(
      <UsersTable
        users={[ME, SARAH]}
        loading={false}
        selected={new Set()}
        onToggleSelected={vi.fn()}
        onToggleAll={vi.fn()}
        onRoleChange={onRoleChange}
        onAction={vi.fn()}
        onApprove={vi.fn()}
      />,
    );
    return { onRoleChange, user: userEvent.setup() };
  }

  it('is locked on the signed-in admin’s own row', () => {
    renderTable();

    const ownRow = screen.getByText('Afef Ben Kalia').closest('tr')!;
    expect(within(ownRow).getByText('You')).toBeInTheDocument();
    expect(within(ownRow).getByTestId('role-locked')).toHaveAccessibleName(
      'Admin — you can’t change your own role',
    );
    expect(within(ownRow).queryByRole('button', { name: /^Role of/ })).not.toBeInTheDocument();
  });

  it('lets the admin change another user’s role', async () => {
    const { onRoleChange, user } = renderTable();

    await user.click(screen.getByRole('button', { name: 'Role of Sarah Mansour: Member' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Admin' }));

    expect(onRoleChange).toHaveBeenCalledWith(SARAH, 'admin');
  });

  it('hides self-destructive actions from the own row menu', async () => {
    const { user } = renderTable();

    await user.click(screen.getByRole('button', { name: 'More actions for Afef Ben Kalia' }));

    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Edit details' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Change role' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Deactivate user' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Delete user' })).not.toBeInTheDocument();
  });
});
