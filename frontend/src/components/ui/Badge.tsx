import type { ReactNode } from 'react';

export type BadgeTone = 'gray' | 'indigo' | 'green' | 'amber' | 'red' | 'blue' | 'violet';

const TONES: Record<BadgeTone, { pill: string; dot: string }> = {
  gray: { pill: 'bg-[#F2F4F7] text-[#344054]', dot: 'bg-[#667085]' },
  indigo: { pill: 'bg-[#EEF2FF] text-[#4338CA]', dot: 'bg-[#6366F1]' },
  green: { pill: 'bg-[#ECFDF3] text-[#067647]', dot: 'bg-[#12B76A]' },
  amber: { pill: 'bg-[#FFFAEB] text-[#B54708]', dot: 'bg-[#F79009]' },
  red: { pill: 'bg-[#FEF3F2] text-[#B42318]', dot: 'bg-[#F04438]' },
  blue: { pill: 'bg-[#EFF8FF] text-[#175CD3]', dot: 'bg-[#2E90FA]' },
  violet: { pill: 'bg-[#F4F3FF] text-[#5925DC]', dot: 'bg-[#7A5AF8]' },
};

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'gray', dot = true, icon, children, className = '' }: BadgeProps) {
  const { pill, dot: dotColor } = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[10px] py-[3px] text-xs font-semibold ${pill} ${className}`}
    >
      {icon ??
        (dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />)}
      {children}
    </span>
  );
}
