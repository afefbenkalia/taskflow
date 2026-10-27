import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersPage } from '../src/features/admin/users/UsersPage';
import { namesSummary } from '../src/features/admin/users/bulkActions';
import type { AdminUser } from '../src/types/user';

const api = vi.hoisted(() => ({
  listUsers: vi.fn(),
  setUserStatus: vi.fn(),
  changeRole: vi.fn(),
  deleteUser: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock('../src/api/users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api/users')>()),
  ...api,
}));

function person(id: number, first: string, last: string, overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id, first_name: first, last_name: last, full_name: `${first} ${last}`,
    email: `${first.toLowerCase()}@taskflow.io`, role: 'user', status: 'active', job_title: null,
    created_at: '2026-01-01T00:00:00Z', projects_count: 1, last_active_at: null, is_self: false,
    ...overrides,
  };
}

const AFEF = person(1, 'Afef', 'Ben Kalia', { role: 'admin', is_self: true });
const SARAH = person(3, 'Sarah', 'Mansour');
const KARIM = person(4, 'Karim', 'Bouzid');
const NOUR = person(9, 'Nour', 'Kefi', { status: 'pending' });
const YOUSSEF = person(7, 'Youssef', 'Trabelsi', { status: 'deactivated' });
const USERS = [AFEF, SARAH, KARIM, NOUR, YOUSSEF];

function page(items: AdminUser[]) {
  return {
    items, total: items.length, page: 1, page_size: 10,
    counts: { all: 5, admins: 1, members: 4, pending: 1, deactivated: 1 },
  };
}

function apiError(detail: string): AxiosError {
  const response = {
    status: 409, statusText: '', data: { detail, code: 'user_owns_projects' }, headers: {},
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse;
  return new AxiosError(detail, '409', undefined, undefined, response);
}

async function renderUsers() {
  render(
    <MemoryRouter initialEntries={['/admin/users']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/admin/users" element={<UsersPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText('Karim Bouzid');
  return userEvent.setup();
}

const checkbox = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}` });
const selectAll = () => screen.getByRole('checkbox', { name: 'Select all users on this page' });
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('Users › selection', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.listUsers.mockResolvedValue(page(USERS));
    api.setUserStatus.mockResolvedValue(undefined);
    api.deleteUser.mockResolvedValue(undefined);
    api.changeRole.mockResolvedValue(undefined);
  });

  it('highlights selected rows and shows a partial "select all"', async () => {
    const user = await renderUsers();

    await user.click(checkbox('Sarah Mansour'));

    expect(checkbox('Sarah Mansour')).toBeChecked();
    expect(rowOf('Sarah Mansour').className).toContain('bg-[#F5F6FF]');
    expect(selectAll()).toBePartiallyChecked();
    expect(within(screen.getByRole('region', { name: 'Selected users' })).getByText('1 selected')).toBeInTheDocument();

    await user.click(selectAll());
    expect(selectAll()).toBeChecked();
    expect(screen.getByText('5 selected')).toBeInTheDocument();

    await user.click(selectAll());
    expect(selectAll()).not.toBeChecked();
    expect(screen.queryByRole('region', { name: 'Selected users' })).not.toBeInTheDocument();
  });

  it('selects a range with Shift+click', async () => {
    const user = await renderUsers();

    await user.click(checkbox('Sarah Mansour'));
    await user.keyboard('{Shift>}');
    await user.click(checkbox('Nour Kefi'));
    await user.keyboard('{/Shift}');

    for (const selected of [SARAH, KARIM, NOUR]) expect(checkbox(selected.full_name)).toBeChecked();
    expect(checkbox('Afef Ben Kalia')).not.toBeChecked();
    expect(checkbox('Youssef Trabelsi')).not.toBeChecked();
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('only offers the actions that apply, with how many users each affects', async () => {
    const user = await renderUsers();
    await user.click(selectAll());

    const bar = screen.getByRole('region', { name: 'Selected users' });
    expect(within(bar).getByRole('button', { name: /Approve\s*1/ })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: /Activate\s*1/ })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: /Deactivate\s*2/ })).toBeInTheDocument();
    // Never yourself: 4 of the 5 selected users can be deleted.
    expect(within(bar).getByRole('button', { name: /Delete\s*4/ })).toBeInTheDocument();
  });

  it('says when nothing applies (only your own account)', async () => {
    const user = await renderUsers();
    await user.click(checkbox('Afef Ben Kalia'));

    expect(screen.getByText('No bulk action applies to your own account.')).toBeInTheDocument();
  });

  it('deactivates the selected users after confirmation, then clears the selection', async () => {
    const user = await renderUsers();
    await user.click(checkbox('Afef Ben Kalia'));
    await user.click(checkbox('Sarah Mansour'));
    await user.click(checkbox('Karim Bouzid'));

    await user.click(screen.getByRole('button', { name: /Deactivate\s*2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Deactivate 2 users' });
    expect(dialog).toHaveTextContent('Sarah Mansour and Karim Bouzid will be signed out immediately');
    expect(dialog).toHaveTextContent('1 selected user will be skipped');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(api.setUserStatus).toHaveBeenCalledTimes(2));
    expect(api.setUserStatus.mock.calls).toEqual([[3, 'deactivate'], [4, 'deactivate']]);
    expect(await screen.findByText('2 users deactivated.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected users' })).not.toBeInTheDocument();
    expect(api.listUsers).toHaveBeenCalledTimes(2); // reloaded
  });

  it('reports partial failures and keeps the failed rows selected', async () => {
    api.deleteUser.mockImplementation((id: number) =>
      id === 4 ? Promise.reject(apiError('This user owns projects.')) : Promise.resolve(),
    );
    const user = await renderUsers();
    await user.click(checkbox('Sarah Mansour'));
    await user.click(checkbox('Karim Bouzid'));

    await user.click(screen.getByRole('button', { name: /Delete\s*2/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('1 user deleted.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Karim Bouzid: This user owns projects.');
    expect(checkbox('Karim Bouzid')).toBeChecked();
    expect(checkbox('Sarah Mansour')).not.toBeChecked();
  });

  it('approves without confirmation', async () => {
    const user = await renderUsers();
    await user.click(checkbox('Nour Kefi'));

    await user.click(screen.getByRole('button', { name: /Approve\s*1/ }));

    await waitFor(() => expect(api.setUserStatus).toHaveBeenCalledWith(9, 'approve'));
    expect(await screen.findByText('1 user approved.')).toBeInTheDocument();
  });

  it('clears the selection when the filter changes', async () => {
    const user = await renderUsers();
    await user.click(checkbox('Sarah Mansour'));

    await user.click(screen.getByRole('button', { name: /^Admins/ }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Selected users' })).not.toBeInTheDocument());
  });
});

describe('Users › row actions', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.listUsers.mockResolvedValue(page(USERS));
  });

  it('shows a spinner on Approve and ignores a second click while it runs', async () => {
    let finish: () => void = () => undefined;
    api.setUserStatus.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = await renderUsers();
    const approve = within(rowOf('Nour Kefi')).getByRole('button', { name: 'Approve' });

    await user.click(approve);
    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute('aria-busy', 'true');
    await user.click(approve);
    expect(api.setUserStatus).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByText('Nour Kefi was approved.')).toBeInTheDocument();
  });

  it('lets the admin reject a pending sign-up from its menu', async () => {
    api.deleteUser.mockResolvedValue(undefined);
    const user = await renderUsers();

    await user.click(screen.getByRole('button', { name: 'More actions for Nour Kefi' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Reset password' })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Reject and delete' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete user' })).getByRole('button', { name: 'Delete user' }));

    await waitFor(() => expect(api.deleteUser).toHaveBeenCalledWith(9));
    expect(await screen.findByText('Nour Kefi was deleted.')).toBeInTheDocument();
  });

  it('shows a spinner on the row while a user is being activated', async () => {
    let finish: () => void = () => undefined;
    api.setUserStatus.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = await renderUsers();

    await user.click(screen.getByRole('button', { name: 'More actions for Youssef Trabelsi' }));
    await user.click(screen.getByRole('menuitem', { name: 'Activate user' }));

    expect(screen.getByRole('status', { name: 'Updating Youssef Trabelsi' })).toBeInTheDocument();
    finish();
    expect(await screen.findByText('Youssef Trabelsi was activated.')).toBeInTheDocument();
  });
});

describe('namesSummary', () => {
  it('lists up to three names', () => {
    expect(namesSummary([SARAH])).toBe('Sarah Mansour');
    expect(namesSummary([SARAH, KARIM, NOUR])).toBe('Sarah Mansour, Karim Bouzid and Nour Kefi');
    expect(namesSummary(USERS)).toBe('Afef Ben Kalia, Sarah Mansour, Karim Bouzid and 2 others');
  });
});
