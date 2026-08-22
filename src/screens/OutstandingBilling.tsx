import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { fetchOutstandingBilling, type OutstandingBillingItem } from '@/lib/api';

interface OutstandingBillingProps {
  onBack: () => void;
  onOpenVisit: (visitId: string) => void;
}

export function OutstandingBilling({ onBack, onOpenVisit }: OutstandingBillingProps) {
  const [items, setItems] = useState<OutstandingBillingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await fetchOutstandingBilling();
        if (alive) setItems(result);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load outstanding billing');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const totalOutstanding = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-[18px] pt-6 no-scrollbar min-h-0">
      <TopBar onBack={onBack} title="Outstanding Billing" />

      {loading && <div className="mt-8 text-center text-[13px] text-mist">Loading…</div>}

      {error && (
        <div className="mt-4 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="mt-10 text-center">
          <div className="text-[13px] font-medium text-chalk">Nothing outstanding</div>
          <div className="mt-1 text-[12px] text-mist">Every Ready to Bill item has been marked paid.</div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="mt-3 mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
            {items.length} outstanding · $
            {totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} total
          </div>
          <div className="mt-2 space-y-2 pb-6">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpenVisit(item.visit_id)}
                className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-border bg-cell p-3.5 text-left transition-colors hover:border-border-strong active:scale-[0.98]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-chalk">{item.customer_name}</div>
                  {item.property_name && (
                    <div className="truncate text-[11px] text-mist">{item.property_name}</div>
                  )}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                        item.payment_status === 'waiting'
                          ? 'bg-amber/15 text-amber'
                          : 'bg-coral/15 text-coral'
                      }`}
                    >
                      {item.payment_status}
                    </span>
                    <span className="text-[10.5px] text-mist-dim">
                      {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
                {item.amount != null && (
                  <div className="shrink-0 font-head text-[15px] font-bold text-chalk">
                    ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
