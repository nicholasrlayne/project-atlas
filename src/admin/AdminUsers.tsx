import { useState, useCallback, useEffect } from 'react';
import {
  Search,
  Shield,
  Mail,
  Send,
  X,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { fetchAdminUsers, adminUpdateEmail, adminSendOtp } from '@/lib/api';
import type { AdminUser } from '@/lib/types';

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = await fetchAdminUsers();
      setUsers(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.business_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <h1 className="font-head text-[24px] font-bold text-chalk">Users</h1>
        <p className="mt-1 text-[13px] text-mist">All registered accounts on the platform.</p>
      </div>

      {/* Search */}
      <div className="mb-5 flex items-center gap-2.5 rounded-[12px] border border-border bg-cell px-4 py-3" style={{ maxWidth: 400 }}>
        <Search size={16} className="text-mist-dim" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or business"
          className="flex-1 bg-transparent text-[13.5px] text-chalk placeholder:text-mist-dim focus:outline-none"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-[12px] border border-coral/30 bg-coral/10 px-4 py-3 text-[13px] text-coral">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-[14px] border border-border bg-cell">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Business</Th>
                <Th className="text-center">Visits</Th>
                <Th>Subscription</Th>
                <Th>Last active</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-mist">
                    No users found.
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr
                  key={u.user_id}
                  onClick={() => setSelectedUser(u)}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-cell-2"
                >
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cell-2">
                        <span className="text-[12px] font-semibold text-mist">
                          {u.full_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium text-chalk">{u.full_name}</span>
                      {u.is_admin && <Shield size={12} className="text-amber" />}
                    </div>
                  </Td>
                  <Td className="text-mist">{u.email}</Td>
                  <Td className="text-mist">{u.business_name}</Td>
                  <Td className="text-center text-chalk">{u.visit_count}</Td>
                  <Td>
                    {u.subscription?.status ? (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        u.subscription.status === 'active'
                          ? 'bg-dusk-dim text-dusk'
                          : 'bg-coral/10 text-coral'
                      }`}>
                        {u.subscription.status}
                      </span>
                    ) : (
                      <span className="text-[12px] text-mist-dim">None</span>
                    )}
                  </Td>
                  <Td className="text-mist">{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Never'}</Td>
                  <Td className="text-mist">{formatDate(u.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUser && (
        <UserDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUpdated={() => void load()}
        />
      )}
    </div>
  );
}

function UserDrawer({
  user,
  onClose,
  onUpdated,
}: {
  user: AdminUser;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [emailDraft, setEmailDraft] = useState(user.email);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const emailChanged = emailDraft.trim() !== user.email && emailDraft.trim().length > 0;

  async function handleSaveEmail() {
    if (!emailChanged) return;
    setSavingEmail(true);
    setEmailError(null);
    setEmailSuccess(false);
    try {
      await adminUpdateEmail(user.user_id, emailDraft.trim());
      setEmailSuccess(true);
      onUpdated();
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : 'Could not update email');
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSendCode() {
    setSendingCode(true);
    setCodeError(null);
    setCodeSent(false);
    try {
      await adminSendOtp(user.email);
      setCodeSent(true);
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : 'Could not send code');
    } finally {
      setSendingCode(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-[420px] flex-col overflow-y-auto bg-ink-2 border-l border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <span className="font-head text-[16px] font-semibold text-chalk">User Details</span>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-mist transition-colors hover:bg-cell-2 hover:text-chalk"
          >
            <X size={18} />
          </button>
        </div>

        {/* Profile */}
        <div className="px-6 py-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cell-2">
              <span className="text-[18px] font-semibold text-mist">
                {user.full_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[16px] font-semibold text-chalk">{user.full_name}</span>
                {user.is_admin && <Shield size={13} className="text-amber" />}
              </div>
              <div className="truncate text-[12.5px] text-mist">{user.business_name}</div>
            </div>
          </div>

          {/* Info grid */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <InfoCell label="Visits" value={String(user.visit_count)} />
            <InfoCell label="Last active" value={user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'Never'} />
            <InfoCell label="Joined" value={formatDate(user.created_at)} />
            <InfoCell label="Subscription" value={user.subscription?.status ?? 'None'} />
          </div>

          {/* Email change */}
          <div className="mt-6 rounded-[14px] border border-border bg-cell p-5">
            <label className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              <Mail size={12} />
              Email address
            </label>
            <input
              type="email"
              value={emailDraft}
              onChange={(e) => {
                setEmailDraft(e.target.value);
                setEmailSuccess(false);
                setEmailError(null);
              }}
              className="w-full rounded-[10px] border border-border-strong bg-cell-2 px-3.5 py-2.5 text-[13.5px] text-chalk outline-none focus:border-amber"
              placeholder="user@example.com"
            />
            {emailError && <p className="mt-2 text-[12.5px] text-coral">{emailError}</p>}
            {emailSuccess && <p className="mt-2 text-[12.5px] text-dusk">Email updated successfully.</p>}
            {emailChanged && (
              <button
                onClick={handleSaveEmail}
                disabled={savingEmail}
                className="mt-3 w-full rounded-[10px] bg-amber py-2.5 text-center font-head text-[13px] font-semibold text-amber-ink transition-transform hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {savingEmail ? 'Saving…' : 'Save email'}
              </button>
            )}
          </div>

          {/* Send verification code */}
          <div className="mt-4 rounded-[14px] border border-border bg-cell p-5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              Verification code
            </div>
            <p className="mb-3 text-[12.5px] text-mist">
              Send a 6-digit sign-in code to this user's email address.
            </p>
            {codeError && <p className="mb-2 text-[12.5px] text-coral">{codeError}</p>}
            {codeSent && !codeError && (
              <p className="mb-2 flex items-center gap-1.5 text-[12.5px] text-dusk">
                <CheckCircle2 size={13} />
                Code sent to {user.email}
              </p>
            )}
            <button
              onClick={handleSendCode}
              disabled={sendingCode}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-cell-2 py-2.5 text-center font-head text-[13px] font-semibold text-chalk transition-transform hover:bg-cell active:scale-[0.98] disabled:opacity-60"
            >
              <Send size={14} />
              {sendingCode ? 'Sending…' : 'Send verification code'}
            </button>
          </div>

          {/* Subscription details */}
          {user.subscription && (
            <div className="mt-4 rounded-[14px] border border-border bg-cell p-5">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
                Subscription
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InfoCell label="Plan" value={user.subscription.plan_name} />
                <InfoCell label="Status" value={user.subscription.status} />
                <InfoCell label="Monthly" value={`$${(user.subscription.monthly_amount_cents / 100).toFixed(2)}`} />
                <InfoCell label="Renews" value={user.subscription.current_period_end ? formatDate(user.subscription.current_period_end) : '—'} />
              </div>
            </div>
          )}

          {user.stripe_customer_id && (
            <div className="mt-4 rounded-[14px] border border-border bg-cell px-5 py-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">Stripe customer</span>
              <div className="mt-1 font-mono text-[12px] text-mist">{user.stripe_customer_id}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3.5 text-[13px] ${className}`}>
      {children}
    </td>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-cell-2 px-3.5 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.05em] text-mist-dim">{label}</div>
      <div className="mt-0.5 truncate text-[13px] text-chalk">{value}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
