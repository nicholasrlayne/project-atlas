import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export interface Profile {
  user_id: string;
  full_name: string;
  business_name: string;
  summary_email: string | null;
  is_admin: boolean;
  stripe_customer_id: string | null;
  auto_email_summary: boolean;
  has_seen_walkthrough: boolean;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated'; session: null; user: null; profile: null }
  | { status: 'authenticated'; session: Session; user: User; profile: Profile | null }
  | { status: 'needsOnboarding'; session: Session; user: User; profile: null };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (!session) {
        setState({ status: 'unauthenticated', session: null, user: null, profile: null });
        return;
      }
      await checkProfile(session);
    });

    supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || !session) {
        setState({ status: 'unauthenticated', session: null, user: null, profile: null });
        return;
      }
      checkProfile(session);
    });

    async function checkProfile(session: Session) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error('[useAuth] Failed to load profile:', error.message);
      }

      if (error || !data) {
        setState({ status: 'needsOnboarding', session, user: session.user, profile: null });
      } else {
        setState({ status: 'authenticated', session, user: session.user, profile: data as Profile });
      }
    }

    return () => { mounted = false; };
  }, []);

const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const updateEmail = useCallback(async (newEmail: string) => {
    const { error: authError } = await supabase.auth.updateUser({ email: newEmail });
    if (authError) throw authError;

    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ summary_email: newEmail })
        .eq('user_id', userData.user.id);
      if (profileError) throw profileError;
    }
  }, []);

  const updateAutoEmailSummary = useCallback(async (value: boolean) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('profiles')
      .update({ auto_email_summary: value })
      .eq('user_id', userData.user.id);
    if (error) throw error;
    setState((prev) =>
      prev.status === 'authenticated' && prev.profile
        ? { ...prev, profile: { ...prev.profile, auto_email_summary: value } }
        : prev,
    );
  }, []);

  const markWalkthroughSeen = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    // Optimistic first — this gates a screen the owner is actively trying
    // to get past (Skip/Get started), so it must feel instant regardless
    // of the write's latency. Best-effort: if the write fails, worst case
    // the walkthrough reappears next session, which is harmless.
    setState((prev) =>
      prev.status === 'authenticated' && prev.profile
        ? { ...prev, profile: { ...prev.profile, has_seen_walkthrough: true } }
        : prev,
    );
    try {
      await supabase
        .from('profiles')
        .update({ has_seen_walkthrough: true })
        .eq('user_id', userData.user.id);
    } catch (e) {
      console.error('[useAuth] Failed to persist walkthrough completion:', e);
    }
  }, []);

  return { state, signOut, updateEmail, updateAutoEmailSummary, markWalkthroughSeen };
}
