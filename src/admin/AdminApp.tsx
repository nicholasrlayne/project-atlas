import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { AdminShell, type AdminTab } from '@/admin/AdminShell';
import { AdminLogin } from '@/admin/AdminLogin';
import { AdminOverview } from '@/admin/AdminOverview';
import { AdminUsers } from '@/admin/AdminUsers';
import { fetchAdminStats } from '@/lib/api';
import type { AdminStats } from '@/lib/types';
import type { Profile } from '@/lib/useAuth';

type AdminAuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'not-admin'; profile: Profile | null }
  | { status: 'authenticated'; profile: Profile };

export function AdminApp() {
  const [authState, setAuthState] = useState<AdminAuthState>({ status: 'loading' });
  const [tab, setTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setAuthState({ status: 'unauthenticated' });
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      setAuthState({ status: 'not-admin', profile: profile as Profile | null });
      return;
    }

    setAuthState({ status: 'authenticated', profile: profile as Profile });
  }, []);

  useEffect(() => {
    void checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthState({ status: 'unauthenticated' });
      } else {
        void checkSession();
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [checkSession]);

  const loadStats = useCallback(async () => {
    if (authState.status !== 'authenticated') return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const s = await fetchAdminStats();
      setStats(s);
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setStatsLoading(false);
    }
  }, [authState.status]);

  useEffect(() => {
    if (authState.status === 'authenticated' && tab === 'overview' && !stats) {
      void loadStats();
    }
  }, [authState.status, tab, stats, loadStats]);

  async function handleSendCode(email: string) {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
  }

  async function handleSignIn(email: string, otp: string) {
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (error) throw error;
    // onAuthStateChange will fire and checkSession will run
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setAuthState({ status: 'unauthenticated' });
    setStats(null);
    setTab('overview');
  }

  if (authState.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-ink">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
      </div>
    );
  }

  if (authState.status === 'unauthenticated') {
    return <AdminLogin onSignIn={handleSignIn} onSendCode={handleSendCode} />;
  }

  if (authState.status === 'not-admin') {
    return (
      <div className="flex h-screen items-center justify-center bg-ink px-6">
        <div className="text-center">
          <h1 className="font-head text-[22px] font-bold text-chalk">Not authorized</h1>
          <p className="mt-2 text-[13px] text-mist">You don't have access to the admin panel.</p>
          <button
            onClick={handleSignOut}
            className="mt-5 rounded-[10px] bg-amber px-5 py-2.5 font-head text-[13px] font-semibold text-amber-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminShell active={tab} onTabChange={setTab} onSignOut={handleSignOut}>
      {tab === 'overview' && (
        statsLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
          </div>
        ) : statsError ? (
          <div className="px-8 py-8">
            <div className="rounded-[12px] border border-coral/30 bg-coral/10 px-4 py-3 text-[13px] text-coral">
              {statsError}
            </div>
          </div>
        ) : stats ? (
          <AdminOverview stats={stats} />
        ) : null
      )}
      {tab === 'users' && <AdminUsers />}
    </AdminShell>
  );
}
