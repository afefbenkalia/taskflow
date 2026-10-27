import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordPage } from '../src/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../src/features/auth/ResetPasswordPage';

const api = vi.hoisted(() => ({ forgotPassword: vi.fn(), resetPassword: vi.fn() }));
vi.mock('../src/api/auth', () => api);

function apiError(status: number, detail: string, code: string): AxiosError {
  const response = {
    status, statusText: '', data: { detail, code }, headers: {}, config: { headers: new AxiosHeaders() },
  } as AxiosResponse;
  return new AxiosError(detail, String(status), undefined, undefined, response);
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<p>Sign in page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('forgot password', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
  });

  it('asks for the email and confirms without revealing whether the account exists', async () => {
    api.forgotPassword.mockResolvedValue('If an account exists…');
    const user = renderAt('/forgot-password');

    await user.type(screen.getByLabelText('Email'), 'sarah.m@taskflow.io');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(api.forgotPassword).toHaveBeenCalledWith('sarah.m@taskflow.io');
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('If an account exists for sarah.m@taskflow.io');

    await user.click(screen.getByRole('button', { name: 'Resend the link' }));
    expect(api.forgotPassword).toHaveBeenCalledTimes(2);
  });

  it('validates the email before sending', async () => {
    const user = renderAt('/forgot-password');

    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
    expect(api.forgotPassword).not.toHaveBeenCalled();
  });
});

describe('reset password', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
  });

  it('sets a new password from the emailed link', async () => {
    api.resetPassword.mockResolvedValue('Your password has been reset.');
    const user = renderAt('/reset-password?token=abc123');

    await user.type(screen.getByLabelText('New password'), 'Brand-new1');
    await user.type(screen.getByLabelText('Confirm password'), 'Brand-new1');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(api.resetPassword).toHaveBeenCalledWith({
      token: 'abc123', new_password: 'Brand-new1', confirm_password: 'Brand-new1',
    });
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Sign in page')).toBeInTheDocument();
  });

  it('checks the password rules and the confirmation', async () => {
    const user = renderAt('/reset-password?token=abc123');

    await user.type(screen.getByLabelText('New password'), 'weakpass');
    await user.type(screen.getByLabelText('Confirm password'), 'other');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByText('Must include at least one uppercase letter.')).toBeInTheDocument();
    expect(screen.getByText('Passwords don’t match.')).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it('explains an expired or used link and offers a new one', async () => {
    api.resetPassword.mockRejectedValue(
      apiError(400, 'This reset link is invalid or has expired. Request a new one.', 'invalid_reset_token'),
    );
    const user = renderAt('/reset-password?token=old');

    await user.type(screen.getByLabelText('New password'), 'Brand-new1');
    await user.type(screen.getByLabelText('Confirm password'), 'Brand-new1');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByRole('heading', { name: 'Link no longer valid' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it('handles a link without token', () => {
    renderAt('/reset-password');

    expect(screen.getByRole('heading', { name: 'Link no longer valid' })).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });
});
