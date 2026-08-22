import { useEffect, useState } from 'react';
import { ChevronRight, Settings as SettingsIcon, AlertCircle } from 'lucide-react';
import { Hex } from '@/components/Hex';
import { SuggestionCard } from '@/components/SuggestionCard';
import {
  fetchStats,
  fetchRecentVisits,
  fetchOutstandingBilling,
  type StatsData,
  type RecentVisit,
} from '@/lib/api';
import type { Suggestion } from '@/lib/types';

interface HomeProps {
  onStartVisit: () => void;
  onOpenStats: () => void;
  onOpenVisit: (visitId: string) => void;
  onOpenSettings: () => void;
  onOpenOutstandingBilling: () => void;
  userName: string;
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatVisitDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Home({ onStartVisit, onOpenStats, onOpenVisit, onOpenSettings, onOpenOutstandingBilling, userName }: HomeProps) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [outstandingCount, setOutstandingCount] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Suggestions temporarily disabled — "Add as task" wasn't
        // reliably showing created tasks back to the user. Re-enable by
        // adding fetchPendingSuggestions() back into this Promise.all
        // once that's resolved.
        const [s, recent, outstanding] = await Promise.all([
          fetchStats('week'),
          fetchRecentVisits(3),
          fetchOutstandingBilling(),
        ]);
        if (!alive) return;
        setStats(s);
        setRecentVisits(recent);
        setOutstandingCount(outstanding.length);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load home');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleSuggestionDismissed = (id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-[18px] pt-6 no-scrollbar">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-head text-[22px] font-bold leading-tight text-chalk">
            {greeting()}, {userName.split(' ')[0]}
          </h1>
          <p className="mt-0.5 text-[13px] text-mist">{formatDate()}</p>
        </div>
        <button
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] bg-cell-2 text-chalk transition-colors hover:bg-cell active:scale-95"
        >
          <SettingsIcon size={17} />
        </button>
      </div>

      {/* Start Visit */}
      <div className="mb-3.5 mt-[22px] flex flex-col items-center">
        <Hex
          variant="cta"
          onClick={onStartVisit}
          title="Start visit"
          className="h-[185px] w-[160px]"
        >
          <span className="text-center font-head text-[16px] font-extrabold leading-tight text-amber-ink">
            Start
            <br />
            visit
          </span>
        </Hex>
        <p className="mt-2.5 text-[12px] text-mist">Tap to begin — voice starts automatically</p>
      </div>

      {error && (
        <div className="mt-2 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
          {error}
        </div>
      )}

      {/* Stats card */}
      {!loading && stats && (
        <button
          onClick={onOpenStats}
          className="mt-4 flex w-full items-center justify-between rounded-[16px] border border-border bg-cell p-3.5 text-left transition-colors hover:border-border-strong active:scale-[0.98]"
        >
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              This week
            </div>
            <div className="mt-1.5 text-[13px] font-medium text-chalk">
              {stats.visitsLogged} {stats.visitsLogged === 1 ? 'visit' : 'visits'} ·{' '}
              {stats.activeCustomers} active{' '}
              {stats.activeCustomers === 1 ? 'customer' : 'customers'} ·{' '}
              {stats.tasksOverdue} overdue
            </div>
          </div>
          <ChevronRight size={18} className="text-mist-dim" />
        </button>
      )}

      {/* Outstanding Billing — persistent, not a dismissible suggestion.
          Only rendered when there's actually something outstanding. */}
      {!loading && outstandingCount > 0 && (
        <button
          onClick={onOpenOutstandingBilling}
          className="mt-3 flex w-full items-center justify-between rounded-[16px] border border-coral/30 bg-coral/10 p-3.5 text-left transition-colors hover:border-coral/50 active:scale-[0.98]"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle size={16} className="shrink-0 text-coral" />
            <div className="text-[13px] font-medium text-chalk">
              {outstandingCount} {outstandingCount === 1 ? 'item' : 'items'} outstanding for billing
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-coral" />
        </button>
      )}

      {/* Suggestions — renders nothing when empty */}
      <div className="mt-4">
        <SuggestionCard suggestions={suggestions} onDismissed={handleSuggestionDismissed} />
      </div>

      {/* Recent visits */}
      {!loading && (
        <div className="mt-5">
          <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
            Recent
          </div>
          {recentVisits.length === 0 ? (
            <div className="py-3 text-[12px] text-mist-dim">No visits yet.</div>
          ) : (
            recentVisits.map((v, i) => (
              <button
                key={v.id}
                onClick={() => onOpenVisit(v.id)}
                className="flex w-full items-center justify-between border-b border-border py-3 text-left transition-colors last:border-none hover:bg-cell/50"
                style={i === recentVisits.length - 1 ? { borderBottom: 'none' } : undefined}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-chalk">
                    {v.customer_name ?? 'Unlinked visit'}
                    {v.property_count > 1 && v.property_name && (
                      <span className="text-mist"> · {v.property_name}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-mist-dim">
                    {formatVisitDate(v.started_at)}
                  </div>
                </div>
                <ChevronRight size={16} className="ml-2 shrink-0 text-mist-dim" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
