import {
  Users as UsersIcon,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Mail,
  DollarSign,
  CreditCard,
} from 'lucide-react';
import type { AdminStats } from '@/lib/types';

interface AdminOverviewProps {
  stats: AdminStats;
}

export function AdminOverview({ stats }: AdminOverviewProps) {
  const mrr = (stats.monthly_recurring_revenue_cents / 100).toFixed(2);
  const proposedValue = (stats.total_proposed_value / 100).toFixed(2);

  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <h1 className="font-head text-[24px] font-bold text-chalk">Overview</h1>
        <p className="mt-1 text-[13px] text-mist">Platform-wide metrics at a glance.</p>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard icon={<UsersIcon size={16} className="text-amber" />} label="Total users" value={stats.total_users} />
        <MetricCard icon={<TrendingUp size={16} className="text-dusk" />} label="Active (30d)" value={stats.active_users_30d} />
        <MetricCard icon={<TrendingUp size={16} className="text-amber" />} label="Total visits" value={stats.total_visits} />
        <MetricCard icon={<CheckCircle2 size={16} className="text-dusk" />} label="Tasks done" value={stats.completed_tasks} />
        <MetricCard icon={<XCircle size={16} className="text-coral" />} label="Open tasks" value={stats.open_tasks} />
        <MetricCard icon={<Mail size={16} className="text-dusk" />} label="Proposals" value={stats.total_proposals} />
        <MetricCard icon={<DollarSign size={16} className="text-amber" />} label="Proposed value" value={`$${proposedValue}`} />
        <MetricCard icon={<CreditCard size={16} className="text-dusk" />} label="Active subs" value={stats.active_subscriptions} />
      </div>

      {/* Revenue banner */}
      <div className="mt-5 rounded-[18px] border border-amber/20 bg-amber-dim/30 p-6">
        <div className="flex items-center gap-2">
          <DollarSign size={16} className="text-amber" />
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-amber">
            Monthly recurring revenue
          </span>
        </div>
        <div className="mt-3 font-head text-[40px] font-bold leading-none text-chalk">
          ${mrr}
          <span className="ml-2 text-[18px] font-normal text-mist">/mo</span>
        </div>
        <div className="mt-2 text-[12.5px] text-mist">
          {stats.active_subscriptions} active · {stats.total_subscriptions} total subscriptions
        </div>
      </div>

      {/* Task summary */}
      <div className="mt-5 grid grid-cols-3 gap-4">
        <div className="rounded-[16px] border border-border bg-cell p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-dusk" />
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">Completed tasks</span>
          </div>
          <div className="mt-3 font-head text-[28px] font-bold text-chalk">{stats.completed_tasks}</div>
        </div>
        <div className="rounded-[16px] border border-border bg-cell p-5">
          <div className="flex items-center gap-2">
            <XCircle size={15} className="text-coral" />
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">Open tasks</span>
          </div>
          <div className="mt-3 font-head text-[28px] font-bold text-chalk">{stats.open_tasks}</div>
        </div>
        <div className="rounded-[16px] border border-border bg-cell p-5">
          <div className="flex items-center gap-2">
            <TrendingDown size={15} className="text-mist-dim" />
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">Total tasks</span>
          </div>
          <div className="mt-3 font-head text-[28px] font-bold text-chalk">{stats.total_tasks}</div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-cell p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">{label}</span>
      </div>
      <div className="mt-3 font-head text-[28px] font-bold leading-none text-chalk">{value}</div>
    </div>
  );
}
