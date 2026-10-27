import { Check } from 'lucide-react';
import { Outlet } from 'react-router-dom';

const TRUSTED_AVATARS = [
  { initials: 'AB', color: 'bg-[#F59E0B]' },
  { initials: 'SM', color: 'bg-[#10B981]' },
  { initials: 'KB', color: 'bg-[#06B6D4]' },
  { initials: 'AM', color: 'bg-[#EC4899]' },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]">
        <Check className="h-[18px] w-[18px] text-white" strokeWidth={3} aria-hidden="true" />
      </span>
      <span className="text-lg font-extrabold tracking-tight">TaskFlow</span>
    </div>
  );
}

function VisualPanel() {
  return (
    <aside
      aria-label="About TaskFlow"
      className="relative m-4 hidden w-[660px] shrink-0 flex-col justify-center overflow-hidden rounded-panel bg-gradient-to-br from-[#3730A3] to-[#7C3AED] p-14 text-white lg:flex"
    >
      <span className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-white/[0.06]" />
      <span className="pointer-events-none absolute -bottom-40 -left-24 h-[360px] w-[360px] rounded-full bg-white/[0.06]" />

      <div className="relative">
        <h2 className="max-w-[520px] text-[38px] font-extrabold leading-[1.15] tracking-tight">
          One platform, two tailored experiences.
        </h2>
        <p className="mt-4 max-w-[520px] text-base leading-relaxed text-[#E0E7FF]">
          Admins get a complete control console. Team members get a focused workspace with only what
          they need — enforced on every request.
        </p>

        <div className="mt-10 flex items-center gap-3">
          <div className="flex">
            {TRUSTED_AVATARS.map(({ initials, color }, index) => (
              <span
                key={initials}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#5B3BC6] text-[11px] font-bold ${color} ${index > 0 ? '-ml-2' : ''}`}
                aria-hidden="true"
              >
                {initials}
              </span>
            ))}
          </div>
          <p className="text-[13px] text-[#E0E7FF]">Trusted by 120+ teams to ship on time</p>
        </div>
      </div>
    </aside>
  );
}

export function AuthLayout() {
  return (
    <div className="flex min-h-screen bg-surface">
      <div className="flex min-w-0 flex-1 flex-col justify-between px-5 py-6 sm:px-10 lg:px-16 lg:py-8">
        <header className="flex items-center justify-between">
          <Logo />
          <span className="text-[13px] text-ink-secondary">English (US)</span>
        </header>

        <main className="mx-auto w-full max-w-[400px] py-10">
          <Outlet />
        </main>

        <footer className="flex items-center justify-between gap-4 text-[13px] text-ink-muted">
          <span>© 2026 TaskFlow</span>
          <span>Privacy · Terms · Help</span>
        </footer>
      </div>
      <VisualPanel />
    </div>
  );
}

export default AuthLayout;
