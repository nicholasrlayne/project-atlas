import { useState } from 'react';
import { LogoLockup } from '@/components/Logo';
import { Mail, ArrowRight } from 'lucide-react';
import { OtpInput } from '@/components/OtpInput';

interface AdminLoginProps {
  onSignIn: (email: string, otp: string) => Promise<void>;
  onSendCode: (email: string) => Promise<void>;
}

export function AdminLogin({ onSignIn, onSendCode }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    try {
      await onSendCode(email.trim());
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code');
    } finally {
      setSending(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || code.length !== 6) return;
    setSigningIn(true);
    setError(null);
    try {
      await onSignIn(email.trim(), code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-ink px-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <LogoLockup size={48} />
        </div>

        <div className="mb-6 text-center">
          <h1 className="font-head text-[22px] font-bold text-chalk">Admin Sign In</h1>
          <p className="mt-1.5 text-[13px] text-mist">
            Enter your email to receive a verification code.
          </p>
        </div>

        <div className="rounded-[20px] border border-border bg-cell p-6">
          {!codeSent ? (
            <form onSubmit={handleSendCode}>
              <label className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
                <Mail size={12} />
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-[12px] border border-border-strong bg-cell-2 px-4 py-3 text-[14px] text-chalk outline-none transition-colors focus:border-amber"
                autoFocus
              />
              {error && <p className="mt-3 text-[13px] text-coral">{error}</p>}
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-[12px] bg-amber py-3 font-head text-[14px] font-semibold text-amber-ink transition-transform hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send verification code'}
                {!sending && <ArrowRight size={16} />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignIn}>
              <p className="mb-4 text-[13px] text-mist">
                We sent a 6-digit code to <span className="font-semibold text-chalk">{email}</span>
              </p>
              <OtpInput value={code} onChange={setCode} length={6} />
              {error && <p className="mt-3 text-[13px] text-coral">{error}</p>}
              <button
                type="submit"
                disabled={signingIn || code.length !== 6}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-[12px] bg-amber py-3 font-head text-[14px] font-semibold text-amber-ink transition-transform hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                {signingIn ? 'Signing in…' : 'Sign in'}
                {!signingIn && <ArrowRight size={16} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeSent(false);
                  setCode('');
                  setError(null);
                }}
                className="mt-3 w-full text-center text-[12.5px] text-mist transition-colors hover:text-chalk"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-[11px] text-mist-dim">
          ServiceShadow Admin · Authorized personnel only
        </p>
      </div>
    </div>
  );
}
