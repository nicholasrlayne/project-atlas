import { useState } from 'react';
import { LogOut, Mail, Download } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { emailAccountExport } from '@/lib/api';

interface SettingsProps {
  onBack: () => void;
  onSignOut: () => void;
  userEmail: string;
  onUpdateEmail: (newEmail: string) => Promise<void>;
  autoEmailSummary: boolean;
  onUpdateAutoEmailSummary: (value: boolean) => Promise<void>;
}

export function Settings({ onBack, onSignOut, userEmail, onUpdateEmail, autoEmailSummary, onUpdateAutoEmailSummary }: SettingsProps) {
  const [emailDraft, setEmailDraft] = useState(userEmail);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  const [autoSummarySaving, setAutoSummarySaving] = useState(false);
  const [autoSummaryError, setAutoSummaryError] = useState<string | null>(null);

  async function handleToggleAutoSummary() {
    setAutoSummarySaving(true);
    setAutoSummaryError(null);
    try {
      await onUpdateAutoEmailSummary(!autoEmailSummary);
    } catch (e) {
      setAutoSummaryError(e instanceof Error ? e.message : 'Could not update setting');
    } finally {
      setAutoSummarySaving(false);
    }
  }

  async function handleExportAccount() {
    setExportState('sending');
    setExportError(null);
    try {
      await emailAccountExport();
      setExportState('sent');
      setTimeout(() => setExportState('idle'), 4000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Could not export account data');
      setExportState('idle');
    }
  }

  const emailChanged = emailDraft.trim() !== userEmail && emailDraft.trim().length > 0;

  async function handleSaveEmail() {
    if (!emailChanged) return;
    setSavingEmail(true);
    setEmailError(null);
    setEmailSuccess(false);
    try {
      await onUpdateEmail(emailDraft.trim());
      setEmailSuccess(true);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : 'Could not update email');
    } finally {
      setSavingEmail(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-[18px] pt-6 no-scrollbar">
      <TopBar onBack={onBack} title="Settings" />

      <div className="mt-6">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          Account
        </div>

        <div className="rounded-[16px] border border-border bg-cell p-3.5">
          <label className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.05em] text-mist-dim">
            <Mail size={12} />
            Email
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
            placeholder="you@yourcompany.com"
          />

          {emailError && (
            <p className="mt-2 text-[12px] text-coral">{emailError}</p>
          )}
          {emailSuccess && (
            <p className="mt-2 text-[12px] text-dusk">
              Check your new inbox for a confirmation link — the change won't take effect until you confirm it.
            </p>
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
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between rounded-[10px] border border-border bg-cell px-3.5 py-3">
          <div className="min-w-0 pr-3">
            <div className="text-[13px] text-chalk">Always email me a copy of visit summaries</div>
            <div className="mt-0.5 text-[11px] text-mist">Sent automatically each time you save a visit</div>
          </div>
          <button
            onClick={handleToggleAutoSummary}
            disabled={autoSummarySaving}
            role="switch"
            aria-checked={autoEmailSummary}
            className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
              autoEmailSummary ? 'bg-amber' : 'bg-cell-2 border border-border-strong'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-chalk transition-transform ${
                autoEmailSummary ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {autoSummaryError && (
          <p className="mt-2 text-[12px] text-coral">{autoSummaryError}</p>
        )}
      </div>

      <div className="mt-6">
        <button
          onClick={handleExportAccount}
          disabled={exportState === 'sending'}
          className="flex w-full items-center gap-2.5 rounded-[10px] border border-border bg-cell px-3.5 py-3 text-left transition-colors hover:border-border-strong active:scale-[0.98] disabled:opacity-60"
        >
          <Download size={16} className="text-mist" />
          <span className="text-[13px] text-mist">
            {exportState === 'sending'
              ? 'Preparing your export…'
              : exportState === 'sent'
                ? 'Export sent — check your email'
                : 'Export all my data'}
          </span>
        </button>
        {exportError && (
          <div className="mt-2 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[11.5px] text-coral">
            {exportError}
          </div>
        )}
      </div>

      <div className="mt-6 mb-2">
        <button
          onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center gap-2.5 rounded-[10px] border border-border bg-cell px-3.5 py-3 text-left transition-colors hover:border-border-strong active:scale-[0.98]"
        >
          <LogOut size={16} className="text-mist" />
          <span className="text-[13px] text-mist">Log out</span>
        </button>
        <p className="mt-2 text-center text-[10px] text-mist-dim">ServiceShadow v1.0</p>
      </div>

      {confirmLogout && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setConfirmLogout(false)}
        >
          <div
            className="w-full max-w-[400px] rounded-t-[20px] bg-ink-2 p-5 pb-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-center text-[14px] font-semibold text-chalk">
              Log out?
            </div>
            <div className="mb-5 text-center text-[12.5px] leading-relaxed text-mist">
              Are you sure you want to log out of ServiceShadow?
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setConfirmLogout(false);
                  onSignOut();
                }}
                className="w-full rounded-[10px] bg-coral py-3 text-center font-head text-[13px] font-semibold text-white"
              >
                Log out
              </button>
              <button
                onClick={() => setConfirmLogout(false)}
                className="w-full rounded-[10px] border border-border-strong bg-cell py-3 text-center font-head text-[13px] font-semibold text-chalk"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
