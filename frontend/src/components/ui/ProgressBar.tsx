export interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  width?: number | string;
  height?: number;
  label?: string;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  color = '#4F46E5',
  width = '100%',
  height = 8,
  label,
  className = '',
}: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={`overflow-hidden rounded-full bg-[#F2F4F7] ${className}`}
      style={{ width, height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${ratio * 100}%`, backgroundColor: color }}
      />
    </div>
  );
}
