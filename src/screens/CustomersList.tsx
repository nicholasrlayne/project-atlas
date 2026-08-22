import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronRight, MapPin, Plus, Download, Check } from 'lucide-react';
import { Hex } from '@/components/Hex';
import { CustomerSheet } from '@/components/CustomerSheet';
import { fetchCustomersWithStats, emailCsv, type CustomerWithStats } from '@/lib/api';

interface CustomersListProps {
  onOpenCustomer: (customerId: string) => void;
  onOpenProperty: (propertyId: string) => void;
  onStartVisit: () => void;
}

type SearchResult =
  | { kind: 'customer'; customer: CustomerWithStats }
  | { kind: 'property'; customer: CustomerWithStats; propertyIndex: number };

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function CustomersList({ onOpenCustomer, onOpenProperty, onStartVisit }: CustomersListProps) {
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchCustomersWithStats();
        if (!alive) return;
        setCustomers(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load customers');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...customers]
        .sort((a, b) => {
          const aT = a.last_visit_at ? new Date(a.last_visit_at).getTime() : 0;
          const bT = b.last_visit_at ? new Date(b.last_visit_at).getTime() : 0;
          return bT - aT;
        })
        .map((c) => ({ kind: 'customer' as const, customer: c }));
    }

    const customerMatches = new Set<string>();
    const propertyMatches: SearchResult[] = [];

    customers.forEach((c) => {
      const nameMatch = c.name.toLowerCase().includes(q);
      if (nameMatch) customerMatches.add(c.id);

      c.properties.forEach((p, idx) => {
        const addrMatch = (p.address ?? '').toLowerCase().includes(q);
        const namePropMatch = (p.name ?? '').toLowerCase().includes(q);
        if (addrMatch || namePropMatch) {
          propertyMatches.push({ kind: 'property', customer: c, propertyIndex: idx });
        }
      });
    });

    const customerResults: SearchResult[] = customers
      .filter((c) => customerMatches.has(c.id))
      .map((c) => ({ kind: 'customer' as const, customer: c }));

    return [...propertyMatches, ...customerResults];
  }, [query, customers]);

  async function handleExport() {
    const seen = new Set<string>();
    const uniqueCustomers: CustomerWithStats[] = [];
    for (const r of results) {
      if (!seen.has(r.customer.id)) {
        seen.add(r.customer.id);
        uniqueCustomers.push(r.customer);
      }
    }

    const rows = uniqueCustomers.map((c) => [
      c.name,
      c.contact_name ?? '',
      c.contact_phone ?? '',
      c.contact_email ?? '',
      c.properties.map((p) => p.address ?? p.name ?? '').filter(Boolean).join('; '),
      c.notes ?? '',
    ]);

    setExportState('sending');
    setExportError(null);
    try {
      await emailCsv(
        'servicshadow-customers.csv',
        ['Customer Name', 'Contact Name', 'Phone', 'Email', 'Properties', 'Notes'],
        rows,
        'customer_list',
      );
      setExportState('sent');
      setTimeout(() => setExportState('idle'), 3000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Could not email export');
      setExportState('idle');
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-[18px] pt-6">
      <div className="flex items-center justify-between">
        <h1 className="font-head text-[22px] font-bold leading-tight text-chalk">Customers</h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exportState === 'sending'}
            title="Email CSV export"
            aria-label="Email CSV export"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-cell-2 text-mist transition-colors hover:bg-cell active:scale-95 disabled:opacity-50"
          >
            {exportState === 'sending' ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
            ) : exportState === 'sent' ? (
              <Check size={16} className="text-dusk" />
            ) : (
              <Download size={16} />
            )}
          </button>
          <button
            onClick={() => setShowNewCustomer(true)}
            title="New customer"
            aria-label="New customer"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-cell-2 text-amber transition-colors hover:bg-cell active:scale-95"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {exportError && (
        <div className="mt-3 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[11.5px] text-coral">
          {exportError}
        </div>
      )}

      <div className="mb-4 mt-3.5 flex items-center gap-2 rounded-[10px] border border-border bg-cell px-3 py-2">
        <Search size={14} className="text-mist-dim" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers or properties…"
          className="flex-1 bg-transparent text-[13px] text-chalk placeholder:text-mist-dim focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!query.trim() && results.length > 0 && (
          <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
            Recent activity
          </div>
        )}

        {query.trim() && !loading && !error && results.length > 0 && (
          <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
            Matches for '{query.trim()}'
          </div>
        )}

        {loading && (
          <div className="py-6 text-center text-[12px] text-mist">Loading…</div>
        )}

        {error && (
          <div className="rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
            {error}
          </div>
        )}

        {!loading && !error && results.length === 0 && !query.trim() && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="text-[14px] font-medium text-chalk">No customers yet</div>
            <div className="max-w-[240px] text-[12px] leading-snug text-mist-dim">
              Customers are added automatically the first time you start a visit — nothing to set up ahead of time.
            </div>
            <button
              onClick={onStartVisit}
              className="mt-2 rounded-[10px] bg-amber px-5 py-2.5 font-head text-[13px] font-semibold text-amber-ink transition-transform active:scale-95"
            >
              Start a visit
            </button>
          </div>
        )}

        {!loading && !error && results.length === 0 && query.trim() && (
          <div className="py-6 text-center text-[12px] text-mist-dim">Nothing here yet.</div>
        )}

        {!loading && !error && results.map((r, i) => {
          if (r.kind === 'customer') {
            const c = r.customer;
            return (
              <button
                key={`c-${c.id}`}
                onClick={() => onOpenCustomer(c.id)}
                className="flex w-full items-center gap-3 border-b border-border py-3 text-left"
                style={i === results.length - 1 ? { borderBottom: 'none' } : undefined}
              >
                <Hex variant="avatar-sm">
                  <span className="font-head font-extrabold text-amber-ink">{initials(c.name)}</span>
                </Hex>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-chalk">{c.name}</div>
                  <div className="mt-0.5 text-[11.5px] text-mist">
                    {c.property_count} {c.property_count === 1 ? 'property' : 'properties'} · {c.visit_count} {c.visit_count === 1 ? 'visit' : 'visits'}
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-mist-dim" />
              </button>
            );
          }

          const p = r.customer.properties[r.propertyIndex];
          if (!p) return null;
          return (
            <button
              key={`p-${p.id}`}
              onClick={() => onOpenProperty(p.id)}
              className="flex w-full items-center gap-3 border-b border-border py-3 text-left"
              style={i === results.length - 1 ? { borderBottom: 'none' } : undefined}
            >
              <Hex variant="avatar-pin">
                <MapPin size={16} className="text-dusk" />
              </Hex>
              <div className="flex-1 min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-chalk">
                  {p.address ?? p.name ?? 'Property'}
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-mist">
                  Owned by {r.customer.name}
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-mist-dim" />
            </button>
          );
        })}
      </div>

      {showNewCustomer && (
        <CustomerSheet
          visitId={null}
          gps={null}
          initialView="newCustomer"
          onAttached={(customerId) => {
            setShowNewCustomer(false);
            onOpenCustomer(customerId);
          }}
          onClose={() => setShowNewCustomer(false)}
        />
      )}
    </div>
  );
}
