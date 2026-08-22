import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft,
  Users,
  TrendingUp,
  DollarSign,
  CreditCard,
  Mail,
  Send,
  Shield,
  CheckCircle2,
  XCircle,
  Search,
} from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { fetchAdminUsers, fetchAdminStats, adminUpdateEmail, adminSendOtp } from '@/lib/api';
import type { AdminUser, AdminStats } from '@/lib/types';

interface AdminPanelProps {
  onBack: () => void;
}

type Tab = 'stats' | 'users';

export function AdminPanel({ onBack }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('stats');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, s] = await Promise.all([fetchAdminUsers(), fetchAdminStats()]);
      setUsers(u);
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data');
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
    <div className="flex flex-1 flex-col overflow-y-auto px-[18px] pt-6 no-scrollbar">
      <TopBar onBack={onBack} title="Admin" />

      <div className="mt-2 flex items-center gap-1.5">
        <Shield size={13} className="text-amber" />
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          ServiceShadow Admin Panel
        </span>
      </div>

      {/* Tab switcher */}
      <div className="mt-4 flex gap-0 rounded-[10px] border border-border bg-cell p-0.5">
        <button
          onClick={() => setTab('stats')}
          className={`flex-1 rounded-[10px] py-2 text-center text-[12.5px] font-medium transition-colors ${
            tab === 'stats' ? 'bg-amber-dim text-amber' : 'text-mist'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab('users')}
          className={`flex-1 rounded-[10px] py-2 text-center text-[12.5px] font-medium transition-colors ${
            tab === 'users' ? 'bg-amber-dim text-amber' : 'text-mist'
          }`}
        >
          Users
        </button>
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

      {!loading && tab === 'stats' && stats && (
        <StatsTab stats={stats} />
      )}

      {!loading && tab === 'users' && (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-[10px] border border-border bg-cell px-3 py-2">
            <Search size={14} className="text-mist-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users by name, email, or business"
              className="flex-1 bg-transparent text-[13px] text-chalk placeholder:text-mist-dim focus:outline-none"
            />
          </div>

          <div className="mt-3 space-y-2">
            {filtered.length === 0 && (
              <p className="py-8 text-center text-[13px] text-mist">No users found.</p>
            )}
            {filtered.map((u) => (
              <UserRow key={u.user_id} user={u} onClick={() => setSelectedUser(u)} />
            ))}
          </div>
        </>
      )}

      {selectedUser && (
        <UserDetailSheet
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUpdated={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}

function StatsTab({ stats }: { stats: AdminStats }) {
  const mrr = (stats.monthly_recurring_revenue_cents / 100).toFixed(2);
  const proposedValue = (stats.total_proposed_value / 100).toFixed(2);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Users size={14} className="text-amber" />}
          label="Total users"
          value={stats.total_users}
        />
        <StatCard
          icon={<TrendingUp size={14} className="text-dusk" />}
          label="Active (30d)"
          value={stats.active_users_30d}
        />
        <StatCard
          icon={<TrendingUp size={14} className="text-amber" />}
          label="Total visits"
          value={stats.total_visits}
        />
        <StatCard
          icon={<CheckCircle2 size={14} className="text-dusk" />}
          label="Tasks done"
          value={stats.completed_tasks}
        />
        <StatCard
          icon={<XCircle size={14} className="text-coral" />}
          label="Open tasks"
          value={stats.open_tasks}
        />
        <StatCard
          icon={<Mail size={14} className="text-dusk" />}
          label="Proposals"
          value={stats.total_proposals}
        />
        <StatCard
          icon={<DollarSign size={14} className="text-amber" />}
          label="Proposed value"
          value={`$${proposedValue}`}
        />
        <StatCard
          icon={<CreditCard size={14} className="text-dusk" />}
          label="Active subs"
          value={stats.active_subscriptions}
        />
      </div>

      {/* Revenue card */}
      <div className="mt-3 rounded-[16px] border border-amber/20 bg-amber-dim/30 p-4">
        <div className="flex items-center gap-1.5">
          <DollarSign size={14} className="text-amber" />
          <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-amber">
            Monthly recurring revenue
          </span>
        </div>
        <div className="mt-2 font-head text-[32px] font-bold leading-none text-chalk">
          ${mrr}
          <span className="ml-1 text-[14px] font-normal text-mist">/mo</span>
        </div>
        <div className="mt-1.5 text-[11.5px] text-mist">
          {stats.active_subscriptions} active · {stats.total_subscriptions} total subscriptions
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex flex-col rounded-[16px] border border-border bg-cell p-3.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          {label}
        </span>
      </div>
      <div className="mt-2 font-head text-[24px] font-bold leading-none text-chalk">
        {value}
      </div>
    </div>
  );
}

function UserRow({ user, onClick }: { user: AdminUser; onClick: () => void }) {
  const subStatus = user.subscription?.status;
  const isActive = subStatus === 'active';

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[14px] border border-border bg-cell p-3 text-left transition-colors hover:border-border-strong active:scale-[0.98]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cell-2">
        <span className="text-[13px] font-semibold text-mist">
          {user.full_name.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-chalk">{user.full_name}</span>
          {user.is_admin && (
            <Shield size={11} className="shrink-0 text-amber" />
          )}
        </div>
        <div className="truncate text-[11.5px] text-mist">{user.email}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-mist-dim">
          <span>{user.visit_count} visits</span>
          {subStatus && (
            <span className={isActive ? 'text-dusk' : 'text-coral'}>
              · {subStatus}
            </span>
          )}
        </div>
      </div>
      <ChevronLeft size={16} className="shrink-0 rotate-180 text-mist-dim" />
    </button>
  );
}

function UserDetailSheet({
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] rounded-t-[20px] bg-ink-2 p-5 pb-7 max-h-[85vh] overflow-y-auto no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-border-strong" />

        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cell-2">
            <span className="text-[16px] font-semibold text-mist">
              {user.full_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[16px] font-semibold text-chalk">{user.full_name}</span>
              {user.is_admin && <Shield size={13} className="text-amber" />}
            </div>
            <div className="truncate text-[12px] text-mist">{user.business_name}</div>
          </div>
        </div>

        {/* Info grid */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <InfoCell label="Visits" value={String(user.visit_count)} />
          <InfoCell
            label="Last active"
            value={user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'Never'}
          />
          <InfoCell label="Joined" value={formatDate(user.created_at)} />
          <InfoCell
            label="Subscription"
            value={user.subscription?.status ?? 'None'}
          />
        </div>

        {/* Email change */}
        <div className="mt-5 rounded-[14px] border border-border bg-cell p-3.5">
          <label className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.05em] text-mist-dim">
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
            className="w-full rounded-[10px] border border-border-strong bg-cell-2 px-3 py-2.5 text-[13px] text-chalk outline-none focus:border-amber"
            placeholder="user@example.com"
          />
          {emailError && <p className="mt-2 text-[12px] text-coral">{emailError}</p>}
          {emailSuccess && (
            <p className="mt-2 text-[12px] text-dusk">Email updated successfully.</p>
          )}
          {emailChanged && (
            <button
              onClick={handleSaveEmail}
              disabled={savingEmail}
              className="mt-3 w-full rounded-[10px] bg-amber py-2.5 text-center font-head text-[13px] font-semibold text-amber-ink transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {savingEmail ? 'Saving…' : 'Save email'}
            </button>
          )}
        </div>

        {/* Send verification code */}
        <div className="mt-3 rounded-[14px] border border-border bg-cell p-3.5">
          <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.05em] text-mist-dim">
            Verification code
          </div>
          <p className="mb-3 text-[12px] text-mist">
            Send a 6-digit sign-in code to this user's email address.
          </p>
          {codeError && <p className="mb-2 text-[12px] text-coral">{codeError}</p>}
          {codeSent && !codeError && (
            <p className="mb-2 text-[12px] text-dusk">Code sent to {user.email}.</p>
          )}
          <button
            onClick={handleSendCode}
            disabled={sendingCode}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-border-strong bg-cell-2 py-2.5 text-center font-head text-[13px] font-semibold text-chalk transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <Send size={14} />
            {sendingCode ? 'Sending…' : 'Send verification code'}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-[10px] border border-border-strong bg-cell py-3 text-center font-head text-[13px] font-semibold text-chalk"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-cell-2 px-3 py-2">
      <div className="text-[9.5px] font-medium uppercase tracking-[0.05em] text-mist-dim">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[12.5px] text-chalk">{value}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
