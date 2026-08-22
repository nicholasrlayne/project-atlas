import { useEffect, useState } from 'react';
import { ChevronLeft, TrendingUp, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchStats, type StatsRange, type StatsData } from '@/lib/api';

interface StatsProps {
  onBack: () => void;
  onOverdueTasks: () => void;
}

type RangeKey = 'week' | 'month' | 'all';

const RANGE_LABELS: Record<RangeKey, string> = {
  week: 'This week',
  month: 'This month',
  all: 'All time',
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function Stats({ onBack, onOverdueTasks }: StatsProps) {
  const [range, setRange] = useState<RangeKey>('week');
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const result = await fetchStats(range);
        if (alive) setData(result);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load stats');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [range]);

  const showDelta = range === 'week';

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-[18px] pt-6 no-scrollbar">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="flex items-center text-mist hover:text-chalk">
          <ChevronLeft size={20} />
        </button>
        <h1 className="font-head text-[22px] font-bold leading-tight text-chalk">Stats</h1>
      </div>

      {/* Range toggle */}
      <div className="mt-4 flex gap-0 rounded-[10px] border border-border bg-cell p-0.5">
        {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            className={`flex-1 rounded-[10px] py-2 text-center text-[12.5px] font-medium transition-colors ${
              range === key ? 'bg-amber-dim text-amber' : 'text-mist'
            }`}
          >
            {RANGE_LABELS[key]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-[16px] border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
        </div>
      )}

      {!loading && data && (
        <>
          {/* 2x2 metric grid */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricCard
              icon={<TrendingUp size={14} className="text-amber" />}
              label="Visits logged"
              value={data.visitsLogged}
              delta={showDelta ? data.visitsLogged - data.priorVisitsLogged : null}
            />
            <MetricCard
              icon={<Users size={14} className="text-dusk" />}
              label="Active customers"
              value={data.activeCustomers}
              delta={showDelta ? data.activeCustomers - data.priorActiveCustomers : null}
            />
            <MetricCard
              icon={<AlertCircle size={14} className="text-coral" />}
              label="Tasks overdue"
              value={data.tasksOverdue}
              delta={null}
              accent="coral"
              onClick={onOverdueTasks}
            />
            <MetricCard
              icon={<CheckCircle2 size={14} className="text-dusk" />}
              label="Tasks completed"
              value={data.tasksCompleted}
              delta={showDelta ? data.tasksCompleted - data.priorTasksCompleted : null}
              accent="dusk"
            />
          </div>

          {/* 7-day visit chart — only for week range */}
          {range === 'week' && (
            <VisitChart data={data.visitsByDay} />
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  delta,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  delta: number | null;
  accent?: 'coral' | 'dusk';
  onClick?: () => void;
}) {
  const accentBorder = accent === 'coral' ? 'border-coral/20' : accent === 'dusk' ? 'border-dusk/20' : 'border-border';
  const isClickable = Boolean(onClick);

  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={`flex flex-col rounded-[16px] border ${accentBorder} bg-cell p-3.5 text-left transition-colors ${
        isClickable ? 'hover:border-border-strong active:scale-[0.98]' : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          {label}
        </span>
      </div>
      <div className="mt-2 font-head text-[28px] font-bold leading-none text-chalk">
        {value}
      </div>
      <div className="mt-1.5 h-[14px] text-[11px]">
        {delta !== null && delta !== 0 && (
          <span className={delta > 0 ? 'text-dusk' : 'text-coral'}>
            {delta > 0 ? '↑' : '↓'} {Math.abs(delta)} vs. last week
          </span>
        )}
      </div>
    </button>
  );
}

function VisitChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  let busiestIdx = 0;
  let busiestCount = 0;
  data.forEach((d, i) => {
    if (d.count > busiestCount) {
      busiestCount = d.count;
      busiestIdx = i;
    }
  });

  const subtitle = `${total} total · busiest day ${busiestCount > 0 ? DAY_FULL[busiestIdx] : '—'}`;

  return (
    <div className="mt-4 rounded-[16px] border border-border bg-cell p-4">
      <div className="font-head text-[14px] font-bold text-chalk">Visits this week</div>
      <div className="mt-0.5 text-[11.5px] text-mist">{subtitle}</div>

      <div className="mt-4 flex items-end justify-between gap-2" style={{ height: 120 }}>
        {data.map((d, i) => {
          const h = d.count === 0 ? 4 : Math.max((d.count / max) * 100, 8);
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className={`w-full max-w-[28px] rounded-t-md transition-all ${
                    d.count > 0 ? 'bg-amber' : 'bg-border'
                  }`}
                  style={{ height: `${h}%` }}
                  title={`${d.count} visit${d.count === 1 ? '' : 's'}`}
                />
              </div>
              <span className="text-[10px] font-mono text-mist-dim">{DAY_LABELS[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
