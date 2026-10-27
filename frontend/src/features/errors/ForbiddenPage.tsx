import { Ban, Lock, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { homePathFor } from '../../routes/RoleRedirect';

export function ForbiddenPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const roleLabel = user?.role === 'admin' ? 'Admin' : 'Member';
  // Members see this page inside the workspace layout (see routes/index.tsx).
  const embedded = user?.role === 'user';
  const Root = embedded ? 'div' : 'main';

  return (
    <Root
      className={`flex items-center justify-center px-5 py-12 ${embedded ? 'min-h-[calc(100vh-200px)]' : 'min-h-screen bg-surface'}`}
    >
      <div className="flex w-full max-w-[640px] flex-col items-center text-center">
        <div className="relative flex h-[168px] w-[168px] items-center justify-center rounded-full bg-[#EEF2FF]">
          <div className="flex h-[124px] w-[124px] items-center justify-center rounded-full bg-[#E0E7FF]">
            <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] shadow-btn">
              <Lock className="h-9 w-9 text-white" aria-hidden="true" />
            </div>
          </div>
          <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-[#F04438]">
            <Ban className="h-4 w-4 text-white" strokeWidth={2.5} aria-hidden="true" />
          </span>
        </div>

        <Badge tone="red" className="mt-8">
          Error 403 · Forbidden
        </Badge>

        <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">
          This area is for administrators only
        </h1>
        <p className="mt-3 max-w-[580px] text-base leading-relaxed text-ink-secondary">
          {user ? (
            <>
              You’re signed in as <strong className="font-semibold text-ink">{user.full_name}</strong> (
              {roleLabel}).{' '}
            </>
          ) : null}
          The page you tried to open requires the Admin role, so it isn’t available in your
          workspace.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={() => navigate(user ? homePathFor(user.role) : '/', { replace: true })}>
            Back to my workspace
          </Button>
          <Button size="lg" variant="secondary">
            Request access
          </Button>
        </div>

        <div className="mt-8 w-full max-w-[580px] overflow-x-auto rounded-xl bg-night px-4 py-3 text-left font-mono text-[13px]">
          <span className="text-[#C7D2FE]">GET /api/admin/users →</span>{' '}
          <span className="text-[#FDA29B]">403 Forbidden · "Admin role required"</span>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-xs text-ink-muted">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          This attempt was recorded in the security log.
        </p>
      </div>
    </Root>
  );
}

export default ForbiddenPage;
