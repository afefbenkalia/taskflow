import { Fragment, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import type { GlobalSearchState } from '../components/navigation/GlobalSearch';

import { ActivityLogPage } from '../features/admin/activity/ActivityLogPage';
import { OverviewPage } from '../features/admin/overview/OverviewPage';
import { AllProjectsPage } from '../features/admin/projects/AllProjectsPage';
import { AdminTasksPage } from '../features/admin/tasks/AdminTasksPage';
import { UsersPage } from '../features/admin/users/UsersPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { ForbiddenPage } from '../features/errors/ForbiddenPage';
import { NotFoundPage } from '../features/errors/NotFoundPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { ActivityPage } from '../features/workspace/activity/ActivityPage';
import { CalendarPage } from '../features/workspace/calendar/CalendarPage';
import { HomePage } from '../features/workspace/home/HomePage';
import { MyProjectsPage } from '../features/workspace/projects/MyProjectsPage';
import { ProjectPage } from '../features/workspace/projects/ProjectPage';
import { ProfilePage } from '../features/workspace/profile/ProfilePage';
import { MyTasksBoard } from '../features/workspace/tasks/MyTasksBoard';
import { useAuth } from '../hooks/useAuth';
import { AdminLayout } from '../layouts/AdminLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { UserLayout } from '../layouts/UserLayout';
import { RequireAuth } from './RequireAuth';
import { RequireRole } from './RequireRole';
import { RoleRedirect, homePathFor } from './RoleRedirect';

/** /login and /register are only for signed-out visitors. */
function GuestOnly() {
  const { user } = useAuth();
  return user ? <Navigate to={homePathFor(user.role)} replace /> : <Outlet />;
}

/**
 * Pages that read ?search= only when they mount: a result of the top bar search
 * (which sets location.state.globalSearch) remounts them so they pick it up.
 */
function KeyedBySearch({ children }: { children: ReactNode }) {
  const { state } = useLocation();
  const marker = (state as Partial<GlobalSearchState> | null)?.globalSearch ?? 'page';
  return <Fragment key={marker}>{children}</Fragment>;
}

/** Members see the 403 page inside their workspace layout, as in the design. */
function ForbiddenShell() {
  const { user } = useAuth();
  return user?.role === 'user' ? <UserLayout /> : <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>
      </Route>

      <Route path="/" element={<RoleRedirect />} />

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireRole role="admin">
              <AdminLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="users" element={<KeyedBySearch><UsersPage /></KeyedBySearch>} />
        <Route path="projects" element={<KeyedBySearch><AllProjectsPage /></KeyedBySearch>} />
        <Route path="tasks" element={<KeyedBySearch><AdminTasksPage /></KeyedBySearch>} />
        <Route path="activity" element={<ActivityLogPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="/app"
        element={
          <RequireAuth>
            <RequireRole role="user">
              <UserLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="tasks" element={<MyTasksBoard />} />
        <Route path="projects" element={<MyProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage embedded />} />
      </Route>

      <Route path="/403" element={<ForbiddenShell />}>
        <Route index element={<ForbiddenPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default AppRoutes;
