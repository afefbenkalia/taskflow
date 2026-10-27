import { Calendar, Plus, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { apiErrorMessage } from '../../../api/client';
import { exportReport, getOverview } from '../../../api/stats';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/Card';
import { ExportMenu } from '../../../components/ui/ExportMenu';
import { FilterSelect } from '../../../components/ui/Select';
import { useAuth } from '../../../hooks/useAuth';
import { greeting } from '../../../lib/format';
import type { ExportFormat, Overview, StatsPeriod } from '../../../types';
import { AdminActivity } from './AdminActivity';
import { KpiCard, KpiCardSkeleton } from './KpiCard';
import { StatusDonut } from './StatusDonut';
import { TeamWorkload } from './TeamWorkload';
import { ThroughputChart } from './ThroughputChart';

const PERIODS: { value: StatsPeriod; label: string; comparison: string; current: string }[] = [
  { value: '7d', label: 'Last 7 days', comparison: 'vs last week', current: 'this week' },
  { value: '30d', label: 'Last 30 days', comparison: 'vs last month', current: 'this month' },
  { value: '90d', label: 'Last 90 days', comparison: 'vs last quarter', current: 'this quarter' },
];

export function OverviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<StatsPeriod>('30d');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    getOverview(period)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((reason) => !cancelled && setError(apiErrorMessage(reason, 'Unable to load the overview.')));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await exportReport(period, format);
    } catch (reason) {
      setError(apiErrorMessage(reason, 'Unable to export the report.'));
    } finally {
      setExporting(null);
    }
  };

  const periodInfo = PERIODS.find((item) => item.value === period)!;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Badge tone="amber" icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />}>
            Admin console
          </Badge>
        }
        title={`Good ${greeting()}, ${user?.first_name ?? ''}`}
        subtitle="Here’s what’s happening across your workspace today."
        actions={
          <>
            <FilterSelect
              label="Period"
              allLabel=""
              icon={Calendar}
              value={period}
              options={PERIODS}
              onChange={(value) => value && setPeriod(value)}
            />
            <ExportMenu label="Export report" exporting={exporting} onExport={handleExport} />
            <Button
              onClick={() => navigate('/admin/users?invite=1')}
              leftIcon={<Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
            >
              Invite user
            </Button>
          </>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {data
          ? data.kpis.map((kpi) => (
              <KpiCard key={kpi.key} kpi={kpi} comparisonLabel={periodInfo.comparison} />
            ))
          : Array.from({ length: 4 }, (_, index) => <KpiCardSkeleton key={index} />)}
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1">
          <ThroughputChart weeks={data?.throughput ?? null} />
        </div>
        <StatusDonut
          status={data?.status ?? null}
          completionRate={data?.completion_rate ?? 0}
          completionDelta={data?.completion_delta ?? 0}
          periodLabel={periodInfo.current}
        />
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1">
          <TeamWorkload entries={data?.workload ?? null} />
        </div>
        <AdminActivity entries={data?.admin_activity ?? null} />
      </div>
    </div>
  );
}

export default OverviewPage;
