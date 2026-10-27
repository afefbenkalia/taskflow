import { useId } from 'react';

export interface SparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}

export function Sparkline({ values, color, width = 88, height = 32 }: SparklineProps) {
  const gradientId = useId();
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;

  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => [
    pad + (index * (width - pad * 2)) / (values.length - 1),
    height - pad - ((value - min) / range) * (height - pad * 2),
  ]);
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x!.toFixed(1)},${y!.toFixed(1)}`).join(' ');
  const area = `${line} L${points.at(-1)![0]!.toFixed(1)},${height} L${points[0]![0]!.toFixed(1)},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
