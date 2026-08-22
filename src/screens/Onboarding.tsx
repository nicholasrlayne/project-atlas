import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LogoLockup } from '@/components/Logo';
import { OtpInput } from '@/components/OtpInput';
import type { User } from '@supabase/supabase-js';

interface OnboardingProps {
  user: User;
  loginEmail: string;
  onComplete: (profile: { full_name: string; business_name: string; summary_email: string | null }) => void;
}

type Step = 'email' | 'code-entry' | 'profile' | 'summary-email';

const USE_PASSWORD_AUTH = import.meta.env.VITE_SANDBOX_PASSWORD_AUTH === 'true';

export function Onboarding({ user, loginEmail, onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>(user ? 'profile' : 'email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (user && (step === 'email' || step === 'code-entry')) {
      setStep('profile');
    }
  }, [user, step]);

  async function sendCode() {
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    setResent(false);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      });
      if (error) throw error;
      setStep('code-entry');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send code');
    } finally {
      setSending(false);
    }
  }

  async function handleResend() {
    setSending(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      });
      if (error) throw error;
      setResent(true);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend code');
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(value: string) {
    setVerifying(true);
    setError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: value,
        type: 'email',
      });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code');
      setCode('');
    } finally {
      setVerifying(false);
    }
  }

  async function handlePasswordAuth() {
    if (!email.trim() || !password) return;
    setSending(true);
    setError(null);
    try {
      const { error } =
        authMode === 'signup'
          ? await supabase.auth.signUp({ email: email.trim(), password })
          : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in');
    } finally {
      setSending(false);
    }
  }

  async function handleSaveProfile() {
    if (!fullName.trim() || !businessName.trim()) return;
    setSavingProfile(true);
    setError(null);
    try {
      setStep('summary-email');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleFinish() {
    setSavingProfile(true);
    setError(null);
    try {
      const { data, error: insertErr } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          full_name: fullName.trim(),
          business_name: businessName.trim(),
          summary_email: loginEmail || null,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      onComplete(data as { full_name: string; business_name: string; summary_email: string | null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSavingProfile(false);
    }
  }

  if (step === 'email') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 no-scrollbar">
        <div className="mb-8 flex flex-col items-center gap-4">
          <LogoLockup size={56} />
          <h1 className="font-head text-[22px] font-bold text-chalk">Welcome</h1>
          <p className="text-center text-[13px] text-mist">
            {USE_PASSWORD_AUTH
              ? (authMode === 'signup' ? 'Create a sandbox account.' : 'Sign in to your sandbox account.')
              : "Sign in with your email and we'll send you a 6-digit code."}
          </p>
        </div>

        {error && (
          <div className="mb-3 w-full max-w-sm rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
            {error}
          </div>
        )}

        <div className="w-full max-w-sm">
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || sending) return;
              if (USE_PASSWORD_AUTH) { if (email.trim() && password) handlePasswordAuth(); }
              else if (email.trim()) sendCode();
            }}
            placeholder="you@example.com"
            className="w-full rounded-[10px] border border-border bg-cell px-3 py-2.5 text-[14px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
          />

          {USE_PASSWORD_AUTH ? (
            <>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && email.trim() && password && !sending) handlePasswordAuth(); }}
                placeholder="Password"
                className="mt-2.5 w-full rounded-[10px] border border-border bg-cell px-3 py-2.5 text-[14px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
              />
              <button
                onClick={handlePasswordAuth}
                disabled={!email.trim() || !password || sending}
                className="mt-3 w-full rounded-[10px] bg-amber py-3 text-center font-head text-[14px] font-semibold text-amber-ink disabled:opacity-50"
              >
                {sending ? 'Working…' : authMode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
              <button
                onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setError(null); }}
                className="mt-3 w-full text-center text-[12.5px] text-mist underline underline-offset-2"
              >
                {authMode === 'signup' ? 'Already have an account? Sign in' : "New here? Create an account"}
              </button>
            </>
          ) : (
            <button
              onClick={sendCode}
              disabled={!email.trim() || sending}
              className="mt-3 w-full rounded-[10px] bg-amber py-3 text-center font-head text-[14px] font-semibold text-amber-ink disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send code'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (step === 'code-entry') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 no-scrollbar">
        <div className="mb-8 flex flex-col items-center gap-4">
          <LogoLockup size={48} />
          <h1 className="font-head text-[22px] font-bold text-chalk">Enter your code</h1>
          <p className="text-center text-[13px] text-mist">
            We sent a 6-digit code to<br />
            <span className="text-chalk">{email.trim()}</span>
          </p>
        </div>

        {error && (
          <div className="mb-3 w-full max-w-sm rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
            {error}
          </div>
        )}

        {resent && !error && (
          <div className="mb-3 w-full max-w-sm rounded-[10px] border border-dusk/30 bg-dusk/10 px-3 py-2 text-[12px] text-dusk">
            Code resent — check your inbox.
          </div>
        )}

        <div className="w-full max-w-sm">
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (v.length === 6) {
                void verifyCode(v);
              }
            }}
            autoFocus
            disabled={verifying}
          />
          {verifying && (
            <p className="mt-3 text-center text-[12px] text-mist">Verifying…</p>
          )}
          <button
            onClick={handleResend}
            disabled={sending || verifying}
            className="mt-4 w-full text-center text-[13px] text-amber underline underline-offset-2 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Resend code'}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'profile') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 no-scrollbar">
        <div className="mb-6 flex flex-col items-center gap-3">
          <h1 className="font-head text-[22px] font-bold text-chalk">Tell us about you</h1>
          <p className="text-center text-[13px] text-mist">This personalizes your ServiceShadow experience.</p>
        </div>

        {error && (
          <div className="mb-3 w-full max-w-sm rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
            {error}
          </div>
        )}

        <div className="w-full max-w-sm space-y-4">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              Your name *
            </label>
            <input
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Sam Rivera"
              className="w-full rounded-[10px] border border-border bg-cell px-3 py-2.5 text-[14px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              Business name *
            </label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Rivera Field Services"
              className="w-full rounded-[10px] border border-border bg-cell px-3 py-2.5 text-[14px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none"
            />
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={!fullName.trim() || !businessName.trim() || savingProfile}
            className="w-full rounded-[10px] bg-amber py-3 text-center font-head text-[14px] font-semibold text-amber-ink disabled:opacity-50"
          >
            {savingProfile ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 no-scrollbar">
      <div className="mb-6 flex flex-col items-center gap-3">
        <h1 className="font-head text-[22px] font-bold text-chalk">Summary routing</h1>
        <p className="text-center text-[13px] text-mist">
          Visit summaries and proposals will be emailed to your login email.<br />
          <span className="text-mist-dim">You can change your login email anytime in Settings — summaries will always follow it.</span>
        </p>
      </div>

      {error && (
        <div className="mb-3 w-full max-w-sm rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
          {error}
        </div>
      )}

      <div className="w-full max-w-sm space-y-4">
        <div className="w-full rounded-[10px] border border-border bg-cell-2 px-3 py-2.5 text-[14px] text-mist">
          {loginEmail}
        </div>
        <button
          onClick={handleFinish}
          disabled={savingProfile}
          className="w-full rounded-[10px] bg-amber py-3 text-center font-head text-[14px] font-semibold text-amber-ink disabled:opacity-50"
        >
          {savingProfile ? 'Saving…' : 'Finish'}
        </button>
      </div>
    </div>
  );
}
