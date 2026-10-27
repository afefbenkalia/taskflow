import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

export interface RedirectState {
  from?: string;
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return null;

  if (!user) {
    const state: RedirectState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }

  return <>{children ?? <Outlet />}</>;
}

export default RequireAuth;
