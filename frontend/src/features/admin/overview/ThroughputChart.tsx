import { BarChart, type BarSeries } from '../../../components/charts/BarChart';
import { Card, CardHeader, Skeleton } from '../../../components/ui/Card';
import type { ThroughputWeek } from '../../../types';

const SERIES: BarSeries[] = [
  { key: 'completed', label: 'Completed', color: '#4F46E5' },
  { key: 'created', label: 'Created', color: '#C7D2FE' },
];

function Legend() {
  return (
    <ul className="flex items-center gap-4">
      {SERIES.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ThroughputChart({ weeks }: { weeks: ThroughputWeek[] | null }) {
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Task throughput"
        subtitle="Tasks created vs completed per week"
        action={<Legend />}
      />
      <div className="mt-5">
        {weeks ? (
          <BarChart
            ariaLabel="Tasks created and completed per week"
            series={SERIES}
            groups={weeks.map((week) => ({
              label: week.label,
              values: { completed: week.completed, created: week.created },
            }))}
            height={200}
          />
        ) : (
          <Skeleton className="h-[200px] w-full" />
        )}
      </div>
    </Card>
  );
}

export default ThroughputChart;
