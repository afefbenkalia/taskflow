import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import type { Role } from '../types/user';

export interface RequireRoleProps {
  role: Role;
  children?: ReactNode;
}

/** UI guard only: the backend enforces the same rule on every request. */
export function RequireRole({ role, children }: RequireRoleProps) {
  const { user } = useAuth();

  if (!user || user.role !== role) {
    return <Navigate to="/403" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

export default RequireRole;
