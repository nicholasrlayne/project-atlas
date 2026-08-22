import { useEffect, useMemo, useState, useCallback } from 'react';
import { ChevronRight, Plus, X, Trash2, User, Settings, CalendarClock, TrendingUp, Sparkles, Folder, Mail, Repeat } from 'lucide-react';
import { Hex } from '@/components/Hex';
import { TopBar } from '@/components/TopBar';
import {
  fetchCustomerActivity,
  fetchPropertyActivity,
  createPropertyForCustomer,
  fetchCustomerFacts,
  createCustomerFact,
  updateCustomerFact,
  updateCustomerContactEmail,
  acknowledgeCustomerFact,
  deleteCustomerFact,
  type VisitActivityItem,
} from '@/lib/api';
import type { CustomerFact, CustomerFactType } from '@/lib/types';

interface CustomerDetailProps {
  scope: { kind: 'customer'; customerId: string } | { kind: 'property'; propertyId: string };
  onBack: () => void;
  onOpenVisit: (visitId: string) => void;
  onOpenCustomer: (customerId: string) => void;
  onAskCustomer: (customerId: string, customerName: string) => void;
}

interface DayGroup {
  dateLabel: string;
  items: VisitActivityItem[];
}

function dayLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

const FACT_TYPE_LABELS: Record<CustomerFactType, string> = {
  decision_maker: 'Decision maker',
  process: 'Process',
  renewal_timing: 'Renewal',
  upsell_opportunity: 'Opportunity',
  cadence_override: 'Visit cadence',
};

const FACT_TYPE_ORDER: CustomerFactType[] = ['decision_maker', 'cadence_override', 'process', 'renewal_timing', 'upsell_opportunity'];

const FACT_TYPE_ICONS: Record<CustomerFactType, typeof User> = {
  decision_maker: User,
  process: Settings,
  renewal_timing: CalendarClock,
  upsell_opportunity: TrendingUp,
  cadence_override: Repeat,
};

export function CustomerDetail({ scope, onBack, onOpenVisit, onOpenCustomer, onAskCustomer }: CustomerDetailProps) {
  const [items, setItems] = useState<VisitActivityItem[]>([]);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [seeAllLink, setSeeAllLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddProp, setShowAddProp] = useState(false);
  const [propName, setPropName] = useState('');
  const [propAddr, setPropAddr] = useState('');
  const [savingProp, setSavingProp] = useState(false);
  const [propError, setPropError] = useState<string | null>(null);

  const [facts, setFacts] = useState<CustomerFact[]>([]);
  const [editingFact, setEditingFact] = useState<CustomerFact | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [editingContactEmail, setEditingContactEmail] = useState(false);
  const [showAddFact, setShowAddFact] = useState(false);

  const scopeKey = scope.kind === 'customer' ? scope.customerId : scope.propertyId;

  const loadFacts = useCallback(async (customerId: string) => {
    try {
      const f = await fetchCustomerFacts(customerId);
      setFacts(f);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (scope.kind === 'customer') {
          const [activity, factData] = await Promise.all([
            fetchCustomerActivity(scope.customerId),
            fetchCustomerFacts(scope.customerId),
          ]);
          if (!alive) return;
          setItems(activity.visits);
          setContactEmail(activity.contactEmail);
          setFacts(factData);
          const custName = activity.visits[0]?.customer_name ?? 'Customer';
          setTitle(custName);
          setSubtitle(`${activity.propertyCount} ${activity.propertyCount === 1 ? 'property' : 'properties'} · ${activity.visitCount} ${activity.visitCount === 1 ? 'visit' : 'visits'} total`);
          setSeeAllLink(null);
        } else {
          const { visits, customerName, visitCount } = await fetchPropertyActivity(scope.propertyId);
          if (!alive) return;
          setItems(visits);
          setFacts([]);
          const propLabel = visits[0]?.property_address ?? visits[0]?.property_name ?? 'Property';
          setTitle(propLabel);
          setSubtitle(`${customerName ?? 'Customer'} · ${visitCount} ${visitCount === 1 ? 'visit' : 'visits'}`);
          setSeeAllLink(customerName);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load details');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scopeKey]);

  const groups: DayGroup[] = useMemo(() => {
    const map = new Map<string, VisitActivityItem[]>();
    items.forEach((item) => {
      const label = dayLabel(item.started_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(item);
    });
    return Array.from(map.entries()).map(([dateLabel, groupItems]) => ({ dateLabel, items: groupItems }));
  }, [items]);

  const factsByType = useMemo(() => {
    const map = new Map<CustomerFactType, CustomerFact[]>();
    for (const fact of facts) {
      if (!map.has(fact.type)) map.set(fact.type, []);
      map.get(fact.type)!.push(fact);
    }
    return FACT_TYPE_ORDER
      .filter((t) => map.has(t))
      .map((t) => ({ type: t, facts: map.get(t)! }));
  }, [facts]);

  async function handleFactSave(factId: string, newValue: string) {
    try {
      await updateCustomerFact(factId, newValue);
      setEditingFact(null);
      await loadFacts(scope.kind === 'customer' ? scope.customerId : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save fact');
    }
  }

  async function handleFactDelete(factId: string) {
    try {
      await deleteCustomerFact(factId);
      setEditingFact(null);
      await loadFacts(scope.kind === 'customer' ? scope.customerId : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete fact');
    }
  }

  async function handleFactAck(factId: string) {
    try {
      await acknowledgeCustomerFact(factId);
      await loadFacts(scope.kind === 'customer' ? scope.customerId : '');
    } catch {
      // non-fatal
    }
  }

  async function handleAddFact(type: CustomerFactType, value: string) {
    if (scope.kind !== 'customer') return;
    try {
      await createCustomerFact({ customer_id: scope.customerId, type, value });
      setShowAddFact(false);
      await loadFacts(scope.customerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add fact');
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-[18px] pt-6">
      <TopBar onBack={onBack} title={title} subtitle={subtitle} />

      {seeAllLink && (
        <button
          onClick={() => {
            const custId = items[0]?.customer_id;
            if (custId) onOpenCustomer(custId);
          }}
          className="mb-3.5 mt-1 text-[12px] text-dusk underline underline-offset-2"
        >
          See all properties for {seeAllLink} →
        </button>
      )}

      {scope.kind === 'customer' && (
        <div className="mb-3.5 mt-1 flex items-center gap-4">
          <button
            onClick={() => setShowAddProp(true)}
            className="flex items-center gap-1.5 text-[12px] text-dusk"
          >
            <Plus size={14} />
            Add property
          </button>
          <button
            onClick={() => onAskCustomer(scope.customerId, title)}
            className="flex items-center gap-1.5 text-[12px] text-dusk"
          >
            <Sparkles size={14} />
            Ask about {title}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar min-h-0">
        {scope.kind === 'customer' && !loading && (
          <button
            onClick={() => setEditingContactEmail(true)}
            className="mb-4 flex w-full items-center gap-2.5 rounded-[16px] border border-border bg-cell p-4 text-left"
          >
            <Mail size={15} className="shrink-0 text-mist-dim" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">Customer email</div>
              <div className={`mt-0.5 truncate text-[13px] ${contactEmail ? 'text-chalk' : 'text-dusk'}`}>
                {contactEmail || 'Add email'}
              </div>
            </div>
            <ChevronRight size={14} className="shrink-0 text-mist-dim" />
          </button>
        )}

        {loading && <div className="py-6 text-center text-[12px] text-mist">Loading…</div>}

        {error && (
          <div className="rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
            {error}
          </div>
        )}

        {scope.kind === 'customer' && !loading && factsByType.length > 0 && (
          <div className="mb-4 rounded-[16px] border border-border bg-cell p-4">
            <div className="mb-3 font-head text-[14px] font-bold text-chalk">Key facts</div>
            <div className="space-y-3">
              {factsByType.map(({ type, facts: typeFacts }) => {
                const Icon = FACT_TYPE_ICONS[type];
                return typeFacts.map((fact) => (
                  <button
                    key={fact.id}
                    onClick={() => {
                      setEditingFact(fact);
                      if (!fact.acknowledged) handleFactAck(fact.id);
                    }}
                    className="flex w-full items-start gap-2.5 text-left"
                  >
                    <Icon size={14} className="mt-0.5 shrink-0 text-mist-dim" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
                          {FACT_TYPE_LABELS[type]}
                        </span>
                        {!fact.acknowledged && (
                          <span className="rounded bg-amber/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber">
                            Updated
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[13px] text-chalk">{fact.value}</div>
                    </div>
                    <ChevronRight size={14} className="mt-1 shrink-0 text-mist-dim" />
                  </button>
                ));
              })}
            </div>
            <button
              onClick={() => setShowAddFact(true)}
              className="mt-3 flex items-center gap-1.5 text-[12px] text-dusk"
            >
              <Plus size={14} />
              Add fact
            </button>
          </div>
        )}

        {scope.kind === 'customer' && !loading && factsByType.length === 0 && (
          <button
            onClick={() => setShowAddFact(true)}
            className="mb-4 flex items-center gap-1.5 text-[12px] text-dusk"
          >
            <Plus size={14} />
            Add key fact
          </button>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="py-6 text-center text-[12px] text-mist-dim">Nothing here yet.</div>
        )}

        {!loading && !error && groups.map((group) => (
          <div key={group.dateLabel} className="mb-4">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              {group.dateLabel}
            </div>
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpenVisit(item.visit_id)}
                className="flex w-full items-center gap-2.5 rounded-[16px] border border-border bg-cell px-3 py-2.5 text-left"
              >
                {item.type === 'project' ? (
                  <Folder size={16} className="shrink-0 text-amber" />
                ) : (
                  <Hex variant={item.type === 'visit' ? 'tag' : 'tag-dusk'} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-chalk">{item.label}</div>
                  <div className="mt-0.5 text-[11px] text-mist">
                    {item.type === 'project'
                      ? `${item.visit_count} ${item.visit_count === 1 ? 'visit' : 'visits'}`
                      : scope.kind === 'customer' && (item.property_name ?? item.property_address)
                        ? `${item.property_name ?? item.property_address} · ${item.label}`
                        : new Date(item.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-mist-dim" />
              </button>
            ))}
          </div>
        ))}
      </div>

      {showAddProp && scope.kind === 'customer' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setShowAddProp(false)}>
          <div className="flex max-h-[60dvh] w-full max-w-md flex-col rounded-t-[20px] border-t border-border-strong bg-ink pb-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="font-head text-[15px] font-bold text-chalk">Add property</h2>
              <button onClick={() => setShowAddProp(false)} aria-label="Close" className="text-mist hover:text-chalk">
                <X size={18} />
              </button>
            </div>
            {propError && (
              <div className="mx-5 mb-2 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[11.5px] text-coral">
                {propError}
              </div>
            )}
            <div className="flex-1 overflow-y-auto no-scrollbar px-5">
              <div className="mb-4">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
                  Property name (optional)
                </label>
                <input
                  value={propName}
                  onChange={(e) => setPropName(e.target.value)}
                  placeholder="e.g. Bldg C"
                  className="w-full rounded-[10px] border border-border bg-cell px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-dusk focus:outline-none"
                />
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
                  Property address *
                </label>
                <input
                  value={propAddr}
                  onChange={(e) => setPropAddr(e.target.value)}
                  placeholder="Enter address"
                  className="w-full rounded-[10px] border border-border bg-cell px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-dusk focus:outline-none"
                />
              </div>
              <button
                onClick={async () => {
                  if (!propAddr.trim()) return;
                  setSavingProp(true);
                  setPropError(null);
                  try {
                    await createPropertyForCustomer({
                      customer_id: scope.customerId,
                      name: propName.trim() || null,
                      address: propAddr.trim(),
                    });
                    setShowAddProp(false);
                    setPropName('');
                    setPropAddr('');
                    setLoading(true);
                    const { visits, propertyCount, visitCount } = await fetchCustomerActivity(scope.customerId);
                    setItems(visits);
                    setSubtitle(`${propertyCount} ${propertyCount === 1 ? 'property' : 'properties'} · ${visitCount} ${visitCount === 1 ? 'visit' : 'visits'} total`);
                  } catch (e) {
                    setPropError(e instanceof Error ? e.message : 'Could not add property');
                  } finally {
                    setSavingProp(false);
                    setLoading(false);
                  }
                }}
                disabled={!propAddr.trim() || savingProp}
                className="w-full rounded-[10px] bg-dusk px-4 py-2.5 text-[13px] font-semibold text-dusk-ink disabled:opacity-50"
              >
                {savingProp ? 'Saving…' : 'Add property'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingContactEmail && scope.kind === 'customer' && (
        <ContactEmailEditSheet
          email={contactEmail ?? ''}
          onSave={async (email) => {
            try {
              await updateCustomerContactEmail(scope.customerId, email);
              setContactEmail(email.trim() || null);
              setEditingContactEmail(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not save customer email');
            }
          }}
          onClose={() => setEditingContactEmail(false)}
        />
      )}

      {editingFact && (
        <FactEditSheet
          fact={editingFact}
          onSave={(newValue) => handleFactSave(editingFact.id, newValue)}
          onDelete={() => handleFactDelete(editingFact.id)}
          onClose={() => setEditingFact(null)}
        />
      )}

      {showAddFact && scope.kind === 'customer' && (
        <FactAddSheet
          onSave={handleAddFact}
          onClose={() => setShowAddFact(false)}
        />
      )}
    </div>
  );
}

function ContactEmailEditSheet({
  email,
  onSave,
  onClose,
}: {
  email: string;
  onSave: (email: string) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(email);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-t-[20px] bg-ink-2 p-5 pb-7" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-[14px] font-semibold text-chalk">Customer email</div>
        <input
          autoFocus
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="customer@example.com"
          className="mb-4 w-full rounded-[10px] border border-border-strong bg-cell px-3 py-3 text-[13px] text-chalk placeholder:text-mist-dim focus:outline-none"
        />
        <div className="flex gap-2.5">
          <button onClick={onClose} className="flex-1 rounded-[10px] border border-border-strong bg-cell py-3 text-[13px] font-semibold text-chalk">Cancel</button>
          <button
            disabled={saving}
            onClick={async () => { setSaving(true); await onSave(draft); setSaving(false); }}
            className="flex-1 rounded-[10px] bg-amber py-3 text-[13px] font-semibold text-amber-ink disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FactEditSheet({
  fact,
  onSave,
  onDelete,
  onClose,
}: {
  fact: CustomerFact;
  onSave: (value: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(fact.value);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="flex max-h-[60dvh] w-full max-w-md flex-col rounded-t-[20px] border-t border-border-strong bg-ink pb-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-head text-[15px] font-bold text-chalk">Edit {FACT_TYPE_LABELS[fact.type]}</h2>
          <button onClick={onClose} aria-label="Close" className="text-mist hover:text-chalk">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-5">
          {fact.previous_value && (
            <div className="mb-3 rounded-[10px] border border-border bg-cell px-3 py-2 text-[11.5px] text-mist-dim">
              Previously: {fact.previous_value}
            </div>
          )}
          <div className="mb-4">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              {FACT_TYPE_LABELS[fact.type]}
            </label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              autoFocus
              className="w-full rounded-[10px] border border-border bg-cell px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
            />
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={onDelete}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2.5 text-[13px] text-coral disabled:opacity-50"
            >
              <Trash2 size={14} />
              Delete
            </button>
            <button
              onClick={async () => {
                if (!value.trim()) return;
                setSaving(true);
                onSave(value.trim());
              }}
              disabled={!value.trim() || saving}
              className="flex-1 rounded-[10px] bg-amber px-4 py-2.5 text-[13px] font-semibold text-amber-ink disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FactAddSheet({
  onSave,
  onClose,
}: {
  onSave: (type: CustomerFactType, value: string) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<CustomerFactType>('decision_maker');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="flex max-h-[60dvh] w-full max-w-md flex-col rounded-t-[20px] border-t border-border-strong bg-ink pb-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-head text-[15px] font-bold text-chalk">Add key fact</h2>
          <button onClick={onClose} aria-label="Close" className="text-mist hover:text-chalk">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-5">
          <div className="mb-4">
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              Type
            </label>
            <div className="flex flex-wrap gap-2">
              {FACT_TYPE_ORDER.map((t) => {
                const Icon = FACT_TYPE_ICONS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[12px] transition-colors ${
                      type === t
                        ? 'border-amber bg-amber-dim text-amber'
                        : 'border-border bg-cell text-mist'
                    }`}
                  >
                    <Icon size={12} />
                    {FACT_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              Value
            </label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Enter the fact…"
              className="w-full rounded-[10px] border border-border bg-cell px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
            />
          </div>
          <button
            onClick={async () => {
              if (!value.trim()) return;
              setSaving(true);
              onSave(type, value.trim());
            }}
            disabled={!value.trim() || saving}
            className="w-full rounded-[10px] bg-amber px-4 py-2.5 text-[13px] font-semibold text-amber-ink disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add fact'}
          </button>
        </div>
      </div>
    </div>
  );
}
