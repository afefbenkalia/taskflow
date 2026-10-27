import { useEffect, useRef, useState } from 'react';

import { TooltipBubble } from '../ui/Tooltip';

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarGroup {
  label: string;
  values: Record<string, number>;
}

export interface BarChartProps {
  series: BarSeries[];
  groups: BarGroup[];
  height?: number;
  barWidth?: number;
  barGap?: number;
  /** Tick interval of the Y axis. */
  step?: number;
  ariaLabel: string;
}

const AXIS_WIDTH = 28;
const LABEL_HEIGHT = 24;
const TOP_PADDING = 8;
const RADIUS = 4;

/** Rectangle with only the top corners rounded. */
function barPath(x: number, y: number, width: number, height: number): string {
  if (height <= 0) return '';
  const r = Math.min(RADIUS, height, width / 2);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Grouped bar chart drawn in SVG (no chart library). */
export function BarChart({
  series,
  groups,
  height = 200,
  barWidth = 14,
  barGap = 4,
  step = 10,
  ariaLabel,
}: BarChartProps) {
  const [containerRef, width] = useWidth<HTMLDivElement>(640);
  const [hovered, setHovered] = useState<{ x: number; y: number; text: string } | null>(null);

  const maxValue = Math.max(0, ...groups.flatMap((group) => Object.values(group.values)));
  const top = Math.max(step * 3, Math.ceil(maxValue / step) * step);
  const ticks = Array.from({ length: top / step + 1 }, (_, index) => index * step);

  const plotHeight = height - LABEL_HEIGHT - TOP_PADDING;
  const plotWidth = width - AXIS_WIDTH;
  const groupWidth = plotWidth / Math.max(1, groups.length);
  const clusterWidth = series.length * barWidth + (series.length - 1) * barGap;
  const yFor = (value: number) => TOP_PADDING + plotHeight - (value / top) * plotHeight;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={AXIS_WIDTH}
              x2={width}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke={tick === 0 ? '#D0D5DD' : '#F2F4F7'}
              strokeWidth={1}
            />
            <text x={0} y={yFor(tick) + 4} fontSize={11} fill="#98A2B3">
              {tick}
            </text>
          </g>
        ))}

        {groups.map((group, groupIndex) => {
          const clusterX = AXIS_WIDTH + groupIndex * groupWidth + (groupWidth - clusterWidth) / 2;
          return (
            <g key={group.label}>
              {series.map((item, seriesIndex) => {
                const value = group.values[item.key] ?? 0;
                const x = clusterX + seriesIndex * (barWidth + barGap);
                const y = yFor(value);
                const text = `${group.label} · ${item.label}: ${value}`;
                return (
                  <path
                    key={item.key}
                    d={barPath(x, y, barWidth, yFor(0) - y)}
                    fill={item.color}
                    tabIndex={0}
                    aria-label={text}
                    className="cursor-pointer outline-none transition-opacity hover:opacity-80 focus:opacity-80"
                    onMouseEnter={() => setHovered({ x: x + barWidth / 2, y, text })}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered({ x: x + barWidth / 2, y, text })}
                    onBlur={() => setHovered(null)}
                  />
                );
              })}
              <text
                x={AXIS_WIDTH + groupIndex * groupWidth + groupWidth / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="#98A2B3"
              >
                {group.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hovered && (
        <span
          className="absolute z-10 -translate-x-1/2 -translate-y-full"
          style={{ left: hovered.x, top: hovered.y - 6 }}
        >
          <TooltipBubble>{hovered.text}</TooltipBubble>
        </span>
      )}
    </div>
  );
}
