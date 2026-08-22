import { useEffect, useState } from 'react';
import { X, Plus, MapPin, Search, ChevronRight } from 'lucide-react';
import {
  searchCustomers,
  fetchNearbyProperties,
  createCustomerWithProperty,
  attachCustomerToVisit,
  reverseGeocode,
  fetchPropertiesForCustomer,
  createPropertyForCustomer,
  type NearbyProperty,
} from '@/lib/api';
import type { Customer, Property } from '@/lib/types';

interface CustomerSheetProps {
  visitId: string | null;
  gps: { lat: number; lng: number } | null;
  onAttached: (customerId: string, customerName: string, propertyName: string | null) => void;
  onClose: () => void;
  initialView?: SheetView;
}

type SheetView = 'search' | 'properties' | 'newCustomer' | 'newProperty';

export function CustomerSheet({ visitId, gps, onAttached, onClose, initialView = 'search' }: CustomerSheetProps) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [nearby, setNearby] = useState<NearbyProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<SheetView>(initialView);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected customer (for property selection / add-property flow)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerProperties, setCustomerProperties] = useState<Property[]>([]);
  const [loadingProps, setLoadingProps] = useState(false);

  // New customer form state
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // New property form state
  const [newPropAddress, setNewPropAddress] = useState('');
  const [newPropName, setNewPropName] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [results, nearbyProps] = await Promise.all([
          searchCustomers(''),
          gps ? fetchNearbyProperties(gps.lat, gps.lng) : Promise.resolve([]),
        ]);
        if (!alive) return;
        setCustomers(results);
        setNearby(nearbyProps);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load customers');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [gps]);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const results = await searchCustomers(query);
        if (alive) setCustomers(results);
      } catch {
        // keep previous results
      }
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [query]);

  useEffect(() => {
    if (!gps || view === 'newCustomer' || view === 'newProperty') return;
    let alive = true;
    (async () => {
      const addr = await reverseGeocode(gps.lat, gps.lng);
      if (alive && addr) {
        setNewAddress(addr);
        setNewPropAddress(addr);
      }
    })();
    return () => { alive = false; };
  }, [gps, view]);

  async function handleSelectNearby(p: NearbyProperty) {
    setSaving(true);
    setError(null);
    try {
      if (visitId) await attachCustomerToVisit(visitId, p.customer_id, p.id);
      onAttached(p.customer_id, p.customer_name, p.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not attach customer');
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectCustomer(c: Customer) {
    setSelectedCustomer(c);
    setView('properties');
    setLoadingProps(true);
    setCustomerProperties([]);
    try {
      const props = await fetchPropertiesForCustomer(c.id);
      setCustomerProperties(props);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load properties');
    } finally {
      setLoadingProps(false);
    }
  }

  async function handleSelectProperty(p: Property) {
    if (!selectedCustomer) return;
    setSaving(true);
    setError(null);
    try {
      if (visitId) await attachCustomerToVisit(visitId, selectedCustomer.id, p.id);
      onAttached(selectedCustomer.id, selectedCustomer.name, p.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not attach property');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateNewCustomer() {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { customer, property } = await createCustomerWithProperty({
        customer_name: newName.trim(),
        address: newAddress.trim() || null,
        latitude: gps?.lat ?? null,
        longitude: gps?.lng ?? null,
        contact_phone: newPhone.trim() || null,
        contact_email: newEmail.trim() || null,
      });
      if (visitId) await attachCustomerToVisit(visitId, customer.id, property.id);
      onAttached(customer.id, customer.name, property.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create customer');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateNewProperty() {
    if (!selectedCustomer || !newPropAddress.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const property = await createPropertyForCustomer({
        customer_id: selectedCustomer.id,
        name: newPropName.trim() || null,
        address: newPropAddress.trim(),
        latitude: gps?.lat ?? null,
        longitude: gps?.lng ?? null,
      });
      if (visitId) await attachCustomerToVisit(visitId, selectedCustomer.id, property.id);
      onAttached(selectedCustomer.id, selectedCustomer.name, property.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create property');
    } finally {
      setSaving(false);
    }
  }

  const headerTitle = view === 'properties'
    ? selectedCustomer?.name ?? 'Properties'
    : view === 'newCustomer'
      ? 'New customer'
      : view === 'newProperty'
        ? `New property for ${selectedCustomer?.name ?? ''}`
        : 'Identify customer';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-[20px] border-t border-border-strong bg-ink pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-head text-[15px] font-bold text-chalk">{headerTitle}</h2>
          <button onClick={onClose} aria-label="Close" className="text-mist hover:text-chalk">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mx-5 mb-2 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[11.5px] text-coral">
            {error}
          </div>
        )}

        {view === 'newCustomer' && (
          <NewCustomerForm
            newName={newName}
            setNewName={setNewName}
            newAddress={newAddress}
            setNewAddress={setNewAddress}
            newPhone={newPhone}
            setNewPhone={setNewPhone}
            newEmail={newEmail}
            setNewEmail={setNewEmail}
            onSave={handleCreateNewCustomer}
            onBack={() => setView('search')}
            saving={saving}
          />
        )}

        {view === 'newProperty' && selectedCustomer && (
          <NewPropertyForm
            newPropName={newPropName}
            setNewPropName={setNewPropName}
            newPropAddress={newPropAddress}
            setNewPropAddress={setNewPropAddress}
            onSave={handleCreateNewProperty}
            onBack={() => setView('properties')}
            saving={saving}
          />
        )}

        {view === 'properties' && selectedCustomer && (
          <div className="flex-1 overflow-y-auto no-scrollbar px-5">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              {loadingProps ? 'Loading…' : `${customerProperties.length} ${customerProperties.length === 1 ? 'property' : 'properties'}`}
            </div>
            {customerProperties.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectProperty(p)}
                disabled={saving}
                className="flex w-full items-center gap-2.5 border-b border-border py-2.5 text-left disabled:opacity-50"
              >
                <MapPin size={14} className="shrink-0 text-dusk" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-chalk">{p.name ?? p.address ?? 'Property'}</div>
                  {p.address && p.name && <div className="text-[11px] text-mist">{p.address}</div>}
                </div>
                <ChevronRight size={16} className="shrink-0 text-mist-dim" />
              </button>
            ))}
            <button
              onClick={() => setView('newProperty')}
              disabled={saving}
              className="mt-3 flex w-full items-center gap-2.5 rounded-[10px] border border-dusk/30 bg-dusk/10 px-3 py-2.5 text-left disabled:opacity-50"
            >
              <Plus size={16} className="text-dusk" />
              <span className="text-[13px] font-medium text-dusk">Add this as a new property for {selectedCustomer.name}</span>
            </button>
          </div>
        )}

        {view === 'search' && (
          <>
            {/* Search */}
            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 rounded-[10px] border border-border bg-cell px-3 py-2">
                <Search size={14} className="text-mist-dim" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search customers…"
                  className="flex-1 bg-transparent text-[13px] text-chalk placeholder:text-mist-dim focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-5">
              {/* Nearby properties */}
              {nearby.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
                    Nearby properties
                  </div>
                  {nearby.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectNearby(p)}
                      disabled={saving}
                      className="flex w-full items-center gap-2.5 border-b border-border py-2.5 text-left disabled:opacity-50"
                    >
                      <MapPin size={14} className="shrink-0 text-dusk" />
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-chalk">{p.customer_name}</div>
                        <div className="text-[11px] text-mist">
                          {p.name ?? p.address ?? 'Property'} · {p.distance_m < 1000 ? `${p.distance_m}m` : `${(p.distance_m / 1000).toFixed(1)}km`} away
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Customer search results */}
              <div className="mb-4">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
                  {query.trim() ? 'Search results' : 'All customers'}
                </div>
                {loading && customers.length === 0 && (
                  <div className="py-3 text-[12px] text-mist">Loading…</div>
                )}
                {!loading && customers.length === 0 && (
                  <div className="py-3 text-[12px] text-mist-dim">No customers found.</div>
                )}
                {customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    disabled={saving}
                    className="flex w-full items-center gap-2.5 border-b border-border py-2.5 text-left disabled:opacity-50"
                  >
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-chalk">{c.name}</div>
                      {c.contact_phone && <div className="text-[11px] text-mist">{c.contact_phone}</div>}
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-mist-dim" />
                  </button>
                ))}
              </div>

              {/* New customer button */}
              <button
                onClick={() => setView('newCustomer')}
                disabled={saving}
                className="flex w-full items-center gap-2.5 rounded-[10px] border border-amber/30 bg-amber/10 px-3 py-2.5 text-left disabled:opacity-50"
              >
                <Plus size={16} className="text-amber" />
                <span className="text-[13px] font-medium text-amber">New customer</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NewCustomerForm({
  newName, setNewName, newAddress, setNewAddress,
  newPhone, setNewPhone, newEmail, setNewEmail,
  onSave, onBack, saving,
}: {
  newName: string; setNewName: (v: string) => void;
  newAddress: string; setNewAddress: (v: string) => void;
  newPhone: string; setNewPhone: (v: string) => void;
  newEmail: string; setNewEmail: (v: string) => void;
  onSave: () => void; onBack: () => void; saving: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar px-5">
      <div className="mb-4">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          Business name *
        </label>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Riverside Apartments"
          className="w-full rounded-[10px] border border-border bg-cell px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          Property address
        </label>
        <input
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          placeholder="Auto-filled from GPS if available"
          className="w-full rounded-[10px] border border-border bg-cell px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          Phone (optional)
        </label>
        <input
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          placeholder="(555) 000-0000"
          className="w-full rounded-[10px] border border-border bg-cell px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          Email (optional)
        </label>
        <input
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="contact@example.com"
          className="w-full rounded-[10px] border border-border bg-cell px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
        />
      </div>

      <div className="flex gap-2.5">
        <button onClick={onBack} disabled={saving} className="rounded-[10px] border border-border-strong bg-cell-2 px-4 py-2.5 text-[13px] text-mist disabled:opacity-50">
          Back
        </button>
        <button
          onClick={onSave}
          disabled={!newName.trim() || saving}
          className="flex-1 rounded-[10px] bg-amber px-4 py-2.5 text-[13px] font-semibold text-amber-ink disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Create & attach'}
        </button>
      </div>
    </div>
  );
}

function NewPropertyForm({
  newPropName, setNewPropName, newPropAddress, setNewPropAddress,
  onSave, onBack, saving,
}: {
  newPropName: string; setNewPropName: (v: string) => void;
  newPropAddress: string; setNewPropAddress: (v: string) => void;
  onSave: () => void; onBack: () => void; saving: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto no-scrollbar px-5">
      <div className="mb-4">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          Property name (optional)
        </label>
        <input
          value={newPropName}
          onChange={(e) => setNewPropName(e.target.value)}
          placeholder="e.g. Bldg C"
          className="w-full rounded-[10px] border border-border bg-cell px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-dusk focus:outline-none"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          Property address *
        </label>
        <input
          value={newPropAddress}
          onChange={(e) => setNewPropAddress(e.target.value)}
          placeholder="Auto-filled from GPS if available"
          className="w-full rounded-[10px] border border-border bg-cell px-3 py-2 text-[13px] text-chalk placeholder:text-mist-dim focus:border-dusk focus:outline-none"
        />
      </div>

      <div className="flex gap-2.5">
        <button onClick={onBack} disabled={saving} className="rounded-[10px] border border-border-strong bg-cell-2 px-4 py-2.5 text-[13px] text-mist disabled:opacity-50">
          Back
        </button>
        <button
          onClick={onSave}
          disabled={!newPropAddress.trim() || saving}
          className="flex-1 rounded-[10px] bg-dusk px-4 py-2.5 text-[13px] font-semibold text-dusk-ink disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Create & attach'}
        </button>
      </div>
    </div>
  );
}