import { ArrowRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ProgressRing } from '../../../components/charts/ProgressRing';
import { greeting, pluralize } from '../../../lib/format';
import type { Dashboard } from '../../../types/task';

const TODAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export interface HeroCardProps {
  firstName: string;
  hero: Dashboard['hero'] | null;
  onAddTask: () => void;
}

export function HeroCard({ firstName, hero, onAddTask }: HeroCardProps) {
  const done = hero?.weekly_done ?? 0;
  const target = hero?.weekly_target ?? 10;
  const remaining = Math.max(0, target - done);

  return (
    <section className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-[#4338CA] to-[#7C3AED] px-6 py-7 text-white sm:px-9">
      <span className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/[0.07]" />
      <span className="pointer-events-none absolute -bottom-28 right-48 h-56 w-56 rounded-full bg-white/[0.07]" />

      <div className="relative flex flex-wrap items-center justify-between gap-8">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#C7D2FE]">
            {TODAY_FORMAT.format(new Date())}
          </p>
          <h1 className="mt-2 text-[32px] font-extrabold leading-tight tracking-[-0.02em]">
            Good {greeting()}, {firstName}
          </h1>
          <p className="mt-2 max-w-[480px] text-[15px] leading-relaxed text-[#E0E7FF]">
            {hero
              ? `You have ${pluralize(hero.due_this_week, 'task')} due this week and ${hero.overdue} overdue. Keep the momentum going.`
              : ' '}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/app/tasks"
              className="inline-flex items-center gap-2 rounded-field bg-white px-4 py-2.5 text-sm font-bold text-[#4338CA] shadow-sm transition hover:bg-[#F5F6FF] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
            >
              View my tasks
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={onAddTask}
              className="inline-flex items-center gap-2 rounded-field border border-white/25 bg-white/[0.14] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              Add task
            </button>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <ProgressRing value={done} max={target} ariaLabel={`${done} of ${target} tasks done this week`}>
            <span className="text-2xl font-extrabold leading-none">
              {done}/{target}
            </span>
            <span className="mt-1 text-[11px] font-semibold text-[#E0E7FF]">this week</span>
          </ProgressRing>
          <div className="max-w-[180px]">
            <p className="text-[15px] font-bold">Weekly goal</p>
            <p className="mt-1 text-[13px] text-[#E0E7FF]">
              {`${pluralize(remaining, 'more task')} to reach your target`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroCard;
