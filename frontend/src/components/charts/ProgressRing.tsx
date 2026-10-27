import type { ReactNode } from 'react';

export interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  ariaLabel: string;
  children?: ReactNode;
}

/** Circular progress in SVG with a centered slot. */
export function ProgressRing({
  value,
  max,
  size = 124,
  thickness = 10,
  color = '#FFFFFF',
  trackColor = 'rgba(255,255,255,0.18)',
  ariaLabel,
  children,
}: ProgressRingProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
      )}
    </div>
  );
}

export default ProgressRing;
