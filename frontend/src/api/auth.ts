import type { User } from '../types/user';
import { api, skipAuthRefresh } from './client';

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
  remember_me: boolean;
}

export interface RegisterPayload {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  message: string;
  user: User;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', payload, skipAuthRefresh);
  return data;
}

export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const { data } = await api.post<RegisterResponse>('/auth/register', payload, skipAuthRefresh);
  return data;
}

/** Always resolves with the same message, whether or not the account exists. */
export async function forgotPassword(email: string): Promise<string> {
  const { data } = await api.post<{ message: string }>('/auth/forgot-password', { email }, skipAuthRefresh);
  return data.message;
}

export interface ResetPasswordPayload {
  token: string;
  new_password: string;
  confirm_password: string;
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<string> {
  const { data } = await api.post<{ message: string }>('/auth/reset-password', payload, skipAuthRefresh);
  return data.message;
}

export async function refresh(): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/refresh', undefined, skipAuthRefresh);
  return data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout', undefined, skipAuthRefresh);
}

export async function me(): Promise<User> {
  const { data } = await api.get<User>('/me');
  return data;
}
