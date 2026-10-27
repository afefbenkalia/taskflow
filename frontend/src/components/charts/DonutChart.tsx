import type { ReactNode } from 'react';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  /** Inner radius as a ratio of the outer radius. */
  innerRatio?: number;
  /** Gap between segments, in degrees. */
  gap?: number;
  children?: ReactNode;
  ariaLabel: string;
}

function polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
  const radians = ((angle - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

function arcPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0;
  const [x1, y1] = polar(cx, cy, outer, start);
  const [x2, y2] = polar(cx, cy, outer, end);
  const [x3, y3] = polar(cx, cy, inner, end);
  const [x4, y4] = polar(cx, cy, inner, start);
  return [
    `M${x1},${y1}`,
    `A${outer},${outer} 0 ${large} 1 ${x2},${y2}`,
    `L${x3},${y3}`,
    `A${inner},${inner} 0 ${large} 0 ${x4},${y4}`,
    'Z',
  ].join(' ');
}

/** Ring chart in SVG with small gaps between segments and a centered slot. */
export function DonutChart({
  segments,
  size = 140,
  innerRatio = 0.72,
  gap = 2,
  children,
  ariaLabel,
}: DonutChartProps) {
  const center = size / 2;
  const outer = size / 2;
  const inner = outer * innerRatio;
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  const gapAngle = visible.length > 1 ? gap : 0;

  let cursor = 0;
  const arcs = visible.map((segment) => {
    const sweep = (segment.value / total) * 360;
    const start = cursor + gapAngle / 2;
    // A full circle cannot be drawn as one arc; stop just short of 360°.
    const end = Math.max(start + 0.01, cursor + Math.min(sweep, 359.99) - gapAngle / 2);
    cursor += sweep;
    return { ...segment, path: arcPath(center, center, outer, inner, start, end) };
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
        {total === 0 ? (
          <circle
            cx={center}
            cy={center}
            r={(outer + inner) / 2}
            fill="none"
            stroke="#F2F4F7"
            strokeWidth={outer - inner}
          />
        ) : (
          arcs.map((arc) => (
            <path key={arc.key} d={arc.path} fill={arc.color}>
              <title>{`${arc.label}: ${arc.value}`}</title>
            </path>
          ))
        )}
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  );
}
