import { Navigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import type { Role } from '../types/user';

const HOME_BY_ROLE: Record<Role, string> = {
  admin: '/admin',
  user: '/app',
};

export function homePathFor(role: Role): string {
  return HOME_BY_ROLE[role];
}

/** Whether `role` may open `path` (used to honour the page requested before login). */
export function canAccessPath(path: string, role: Role): boolean {
  if (path === '/admin' || path.startsWith('/admin/')) return role === 'admin';
  if (path === '/app' || path.startsWith('/app/')) return role === 'user';
  return false;
}

export function RoleRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

export default RoleRedirect;
