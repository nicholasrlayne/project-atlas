import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { Suggestion } from '@/lib/types';
import { dismissSuggestion, acceptSuggestionAsTask, createProjectFromSuggestion } from '@/lib/api';

interface SuggestionCardProps {
  suggestions: Suggestion[];
  onDismissed: (id: string) => void;
}

export function SuggestionCard({ suggestions, onDismissed }: SuggestionCardProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {suggestions.map((s) => (
        <SuggestionRow key={s.id} suggestion={s} onDismissed={onDismissed} />
      ))}
    </div>
  );
}

function SuggestionRow({ suggestion, onDismissed }: { suggestion: Suggestion; onDismissed: (id: string) => void }) {
  const [dismissing, setDismissing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDismiss = async () => {
    setDismissing(true);
    setError(null);
    try {
      await dismissSuggestion(suggestion.id);
      onDismissed(suggestion.id);
    } catch (e) {
      console.error('[SuggestionCard] dismiss failed:', e);
      setError(e instanceof Error ? e.message : 'Could not dismiss');
      setDismissing(false);
    }
  };

  const handleAccept = async () => {
    if (suggestion.type === 'group_into_project') {
      setAccepting(true);
      setError(null);
      try {
        await createProjectFromSuggestion(suggestion);
        onDismissed(suggestion.id);
      } catch (e) {
        console.error('[SuggestionCard] project creation failed:', e);
        setError(e instanceof Error ? e.message : 'Could not create project');
        setAccepting(false);
      }
      return;
    }

    const payload = suggestion.payload as { customer_name?: string } | null;
    const customerName = payload?.customer_name ?? 'this customer';
    const title =
      suggestion.type === 're_engage'
        ? `Reach out to ${customerName}`
        : suggestion.type === 'stale_proposal'
          ? `Follow up on proposal with ${customerName}`
          : suggestion.type === 'not_yet_sent'
            ? `Send ready-to-bill to ${customerName}`
            : suggestion.type === 'payment_follow_up'
              ? `Follow up on payment from ${customerName}`
              : null;
    if (!title) return;

    setAccepting(true);
    setError(null);
    try {
      await acceptSuggestionAsTask(suggestion, title);
      onDismissed(suggestion.id);
    } catch (e) {
      console.error('[SuggestionCard] accept-as-task failed:', e);
      setError(e instanceof Error ? e.message : 'Could not save task');
      setAccepting(false);
    }
  };

  return (
    <div>
      {renderSuggestion(suggestion, handleAccept, handleDismiss, dismissing || accepting)}
      {error && (
        <div className="mt-1.5 text-[11px] text-coral">{error}</div>
      )}
    </div>
  );
}

function renderSuggestion(
  suggestion: Suggestion,
  onAccept: () => void,
  onDismiss: () => void,
  dismissing: boolean,
): React.ReactNode {
  switch (suggestion.type) {
    case 'group_into_project':
      return (
        <GroupIntoProjectCard
          suggestion={suggestion}
          onAccept={onAccept}
          onDismiss={onDismiss}
          dismissing={dismissing}
        />
      );
    case 're_engage':
    case 'stale_proposal':
    case 'not_yet_sent':
    case 'payment_follow_up':
      return (
        <GenericSuggestionCard
          suggestion={suggestion}
          onAccept={onAccept}
          onDismiss={onDismiss}
          dismissing={dismissing}
        />
      );
    default:
      return null;
  }
}

function GroupIntoProjectCard({
  suggestion,
  onAccept,
  onDismiss,
  dismissing,
}: {
  suggestion: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const payload = suggestion.payload as { headline?: string; context?: string } | null;
  const headline = payload?.headline ?? 'Group visits into a project';
  const context = payload?.context ?? '';

  return (
    <div className="rounded-[16px] border border-amber/20 bg-cell p-3.5">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-amber" />
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-amber">
          ServiceShadow suggests
        </span>
      </div>
      <div className="mt-2 text-[13px] font-medium leading-snug text-chalk">
        {headline}
      </div>
      {context && (
        <div className="mt-1 text-[11.5px] leading-snug text-mist">
          {context}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onAccept}
          disabled={dismissing}
          className="flex-1 rounded-[10px] bg-amber py-2 text-center text-[12px] font-semibold text-amber-ink transition-colors hover:bg-amber-dim active:scale-[0.98] disabled:opacity-50"
        >
          {dismissing ? 'Working…' : 'Group into project'}
        </button>
        <button
          onClick={onDismiss}
          disabled={dismissing}
          className="flex items-center justify-center gap-1 rounded-[10px] border border-border px-3 py-2 text-[12px] text-mist transition-colors hover:border-border-strong hover:text-chalk disabled:opacity-50"
        >
          <X size={13} />
          Dismiss
        </button>
      </div>
    </div>
  );
}

function GenericSuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
  dismissing,
}: {
  suggestion: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const payload = suggestion.payload as { headline?: string; context?: string } | null;
  const headline = payload?.headline ?? 'ServiceShadow noticed something';
  const context = payload?.context ?? '';

  return (
    <div className="rounded-[16px] border border-amber/20 bg-cell p-3.5">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-amber" />
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-amber">
          ServiceShadow suggests
        </span>
      </div>
      <div className="mt-2 text-[13px] font-medium leading-snug text-chalk">
        {headline}
      </div>
      {context && (
        <div className="mt-1 text-[11.5px] leading-snug text-mist">
          {context}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onAccept}
          disabled={dismissing}
          className="flex-1 rounded-[10px] bg-amber py-2 text-center text-[12px] font-semibold text-amber-ink transition-colors hover:bg-amber-dim active:scale-[0.98] disabled:opacity-50"
        >
          Add as task
        </button>
        <button
          onClick={onDismiss}
          disabled={dismissing}
          className="flex items-center justify-center gap-1 rounded-[10px] border border-border px-3 py-2 text-[12px] text-mist transition-colors hover:border-border-strong hover:text-chalk disabled:opacity-50"
        >
          <X size={13} />
          Dismiss
        </button>
      </div>
    </div>
  );
}
