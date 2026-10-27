import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContextValue } from '../src/context/AuthContext';
import { LoginPage } from '../src/features/auth/LoginPage';
import type { User } from '../src/types/user';

const mocks = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock('../src/hooks/useAuth', () => ({
  useAuth: (): AuthContextValue => ({
    user: null,
    accessToken: null,
    status: 'anonymous',
    login: mocks.login,
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

const ADMIN: User = {
  id: 1,
  first_name: 'Afef',
  last_name: 'Ben Kalia',
  full_name: 'Afef Ben Kalia',
  email: 'afef@taskflow.io',
  role: 'admin',
  status: 'active',
  job_title: null,
  created_at: '2026-01-01T00:00:00Z',
};

function apiError(status: number, detail: string, code: string): AxiosError {
  const response = {
    status,
    statusText: '',
    data: { detail, code },
    headers: {},
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse;
  return new AxiosError(detail, String(status), undefined, undefined, response);
}

function renderLogin() {
  render(
    <MemoryRouter
      initialEntries={['/login']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<p>Admin console page</p>} />
        <Route path="/app" element={<p>User workspace page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    mocks.login.mockReset();
  });

  it('shows validation messages when fields are empty', async () => {
    const user = renderLogin();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('shows an error alert on a 401', async () => {
    mocks.login.mockRejectedValue(apiError(401, 'Incorrect email or password.', 'invalid_credentials'));
    const user = renderLogin();

    await fillAndSubmit(user, 'afef@taskflow.io', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(mocks.login).toHaveBeenCalledWith('afef@taskflow.io', 'wrong-password', false);
  });

  it('shows a warning for a pending account', async () => {
    mocks.login.mockRejectedValue(
      apiError(403, 'Your account is awaiting administrator approval.', 'account_pending'),
    );
    const user = renderLogin();

    await fillAndSubmit(user, 'nour.k@company.com', 'User@1234');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your account is awaiting administrator approval.',
    );
  });

  it('navigates an admin to /admin after signing in', async () => {
    mocks.login.mockResolvedValue(ADMIN);
    const user = renderLogin();

    await user.click(screen.getByLabelText('Remember for 30 days'));
    await fillAndSubmit(user, 'afef@taskflow.io', 'Admin@1234');

    expect(await screen.findByText('Admin console page')).toBeInTheDocument();
    expect(mocks.login).toHaveBeenCalledWith('afef@taskflow.io', 'Admin@1234', true);
  });
});
