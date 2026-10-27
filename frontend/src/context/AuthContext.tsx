import { Loader2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import * as authApi from '../api/auth';
import type { AuthResponse, RegisterPayload, RegisterResponse } from '../api/auth';
import { configureAuthHandlers, setAccessToken } from '../api/client';
import type { User } from '../types/user';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  status: AuthStatus;
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  register: (data: RegisterPayload) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  /** Reloads the signed-in user after a profile change. */
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionState {
  user: User | null;
  accessToken: string | null;
  status: AuthStatus;
}

const ANONYMOUS: SessionState = { user: null, accessToken: null, status: 'anonymous' };

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app" role="status">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">Loading your session…</span>
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({
    user: null,
    accessToken: null,
    status: 'loading',
  });
  const bootstrap = useRef<Promise<unknown> | null>(null);

  const applyAuth = useCallback((data: AuthResponse) => {
    setAccessToken(data.access_token);
    setSession({ user: data.user, accessToken: data.access_token, status: 'authenticated' });
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setSession(ANONYMOUS);
  }, []);

  const refreshSession = useCallback(async () => {
    const data = await authApi.refresh();
    applyAuth(data);
    return data.access_token;
  }, [applyAuth]);

  useEffect(() => {
    configureAuthHandlers({ refresh: refreshSession, onSessionEnd: clearSession });
  }, [refreshSession, clearSession]);

  // Restore the session from the httpOnly refresh cookie. The ref guards against
  // React StrictMode running the effect twice, which would replay a rotated token.
  useEffect(() => {
    bootstrap.current ??= refreshSession().catch(clearSession);
  }, [refreshSession, clearSession]);

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const data = await authApi.login({ email, password, remember_me: remember });
      applyAuth(data);
      return data.user;
    },
    [applyAuth],
  );

  const register = useCallback((data: RegisterPayload) => authApi.register(data), []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const user = await authApi.me();
    setSession((current) => ({ ...current, user }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...session, login, register, logout, refreshUser }),
    [session, login, register, logout, refreshUser],
  );

  return (
    <AuthContext.Provider value={value}>
      {session.status === 'loading' ? <FullScreenLoader /> : children}
    </AuthContext.Provider>
  );
}
