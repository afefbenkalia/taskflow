import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContextValue } from '../src/context/AuthContext';
import { AppRoutes } from '../src/routes';
import type { Me, Role } from '../src/types/user';

const mocks = vi.hoisted(() => ({ useAuth: vi.fn(), getMe: vi.fn(), updateMe: vi.fn() }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: mocks.useAuth }));

vi.mock('../src/api/users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/users')>()),
  getMe: mocks.getMe,
  updateMe: mocks.updateMe,
  changePassword: vi.fn(),
  getMeCounts: vi.fn().mockResolvedValue({ open_tasks: 8, projects: 4 }),
}));
vi.mock('../src/api/stats', () => ({
  getSidebarCounts: vi.fn().mockResolvedValue({ users: 24, projects: 7, tasks: 134 }),
  getOverview: vi.fn(() => new Promise(() => undefined)),
  exportReport: vi.fn(),
}));
vi.mock('../src/api/notifications', () => ({
  getUnreadCount: vi.fn().mockResolvedValue(0),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

function me(role: Role): Me {
  const admin = role === 'admin';
  return {
    id: admin ? 1 : 3,
    first_name: admin ? 'Afef' : 'Sarah',
    last_name: admin ? 'Ben Kalia' : 'Mansour',
    full_name: admin ? 'Afef Ben Kalia' : 'Sarah Mansour',
    email: admin ? 'afef@taskflow.io' : 'sarah.m@taskflow.io',
    role,
    status: 'active',
    job_title: admin ? 'Head of Operations' : 'Product Designer',
    created_at: '2026-03-01T09:00:00Z',
    phone: null,
    timezone: 'Africa/Tunis',
    last_active_at: null,
    password_changed_at: null,
    sessions_count: 1,
  };
}

function signInAs(role: Role) {
  const value: AuthContextValue = {
    user: me(role),
    accessToken: 'token',
    status: 'authenticated',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
  mocks.useAuth.mockReturnValue(value);
  mocks.getMe.mockResolvedValue(me(role));
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('admin profile', () => {
  beforeEach(() => {
    mocks.updateMe.mockReset();
  });

  it('replaces Settings with Profile in the admin sidebar', async () => {
    signInAs('admin');
    renderAt('/admin/profile');

    const nav = screen.getByRole('navigation', { name: 'Admin navigation' });
    expect(within(nav).getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/admin/profile');
    expect(within(nav).getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByText('Settings')).not.toBeInTheDocument();
    expect(within(nav).getByText('Account')).toBeInTheDocument();
    await screen.findByDisplayValue('Afef');
  });

  it('shows the admin profile with the same forms as members', async () => {
    signInAs('admin');
    renderAt('/admin/profile');

    expect(await screen.findByRole('heading', { name: 'Afef Ben Kalia' })).toBeInTheDocument();
    expect(screen.getByText('Admin', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Visible to everyone in the workspace.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('afef@taskflow.io');
    expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument();
  });

  it('saves the admin’s changes through /me', async () => {
    signInAs('admin');
    mocks.updateMe.mockResolvedValue({ ...me('admin'), job_title: 'COO' });
    const user = renderAt('/admin/profile');
    const jobTitle = await screen.findByLabelText('Job title');

    await user.clear(jobTitle);
    await user.type(jobTitle, 'COO');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(mocks.updateMe).toHaveBeenCalledWith({ job_title: 'COO' });
    expect(await screen.findByText('Profile updated.')).toBeInTheDocument();
  });

  it('opens the profile from the account menu', async () => {
    signInAs('admin');
    const user = renderAt('/admin');

    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Profile' }));

    expect(await screen.findByDisplayValue('Afef')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument();
  });

  it('keeps the member profile unchanged', async () => {
    signInAs('user');
    renderAt('/app/profile');

    expect(await screen.findByRole('heading', { name: 'Sarah Mansour' })).toBeInTheDocument();
    expect(screen.getByText('Member', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Visible to members of your projects.')).toBeInTheDocument();
  });
});
