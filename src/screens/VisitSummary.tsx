import { useEffect, useState } from 'react';
import { Folder, Copy, Check, Share2, MoreHorizontal, X, Mail, Trash2 } from 'lucide-react';
import { Hex } from '@/components/Hex';
import { TopBar } from '@/components/TopBar';
import { CustomerSheet } from '@/components/CustomerSheet';
import { extractVisit, fetchVisit, getPhotoUrl, previewVisitSummaryEmail, saveVisitSummary, sendVisitSummary, toggleTask, updatePhotoCaption, updateVisitSummaryText, updateTaskTitle, formatVisitSummaryText, shareVisitSummary, updatePaymentStatus, logHandoffExport, discardEmptyVisit, deleteVisit } from '@/lib/api';
import { ProjectSheet } from '@/components/ProjectSheet';
import type { Photo, Task, VisitWithRelations, PaymentStatus } from '@/lib/types';

interface VisitSummaryProps {
  visitId: string;
  onBack: () => void;
  onSaved: () => void;
  onOpenCustomer: (customerId: string) => void;
  readOnly?: boolean;
  autoEmailSummary?: boolean;
}

export function VisitSummary({ visitId, onBack, onSaved, onOpenCustomer, readOnly = false, autoEmailSummary = false }: VisitSummaryProps) {
  const [visit, setVisit] = useState<VisitWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteVisit(visitId);
      setDeleteConfirmOpen(false);
      onBack();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete visit');
      setDeleting(false);
    }
  }
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [paymentStatusSaving, setPaymentStatusSaving] = useState(false);

  async function handlePaymentStatus(id: string, status: PaymentStatus) {
    setPaymentStatusSaving(true);
    try {
      await updatePaymentStatus(id, status);
      setVisit((prev) =>
        prev
          ? {
              ...prev,
              ready_to_bill: (prev.ready_to_bill ?? []).map((r) =>
                r.id === id ? { ...r, payment_status: status } : r,
              ),
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update payment status');
    } finally {
      setPaymentStatusSaving(false);
    }
  }

  async function handleCopy() {
    if (!visit) return;
    try {
      await navigator.clipboard.writeText(formatVisitSummaryText(visit, tasks));
      setCopyState('copied');
      setTimeout(() => { setCopyState('idle'); setMoreOpen(false); }, 2000);
    } catch {
      setError('Could not copy to clipboard');
      return;
    }
    logHandoffExport(proposal ? 'proposal' : 'visit_summary', visit.id, 'copy').catch(() => {});
  }

  const [sendingShare, setSendingShare] = useState(false);

  async function handleShare() {
    if (!visit) return;
    setSendingShare(true);
    try {
      const result = await shareVisitSummary(visit, tasks);
      if (result === 'unsupported') {
        setError('Sharing isn\'t supported on this device or browser');
      } else {
        setMoreOpen(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share');
    } finally {
      setSendingShare(false);
    }
  }
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [editingPhoto, setEditingPhoto] = useState<string | null>(null);
  const [photoDraft, setPhotoDraft] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState('');
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [customerComposeOpen, setCustomerComposeOpen] = useState(false);
  const [customerComposeLoading, setCustomerComposeLoading] = useState(false);
  const [customerSubject, setCustomerSubject] = useState('');
  const [customerBody, setCustomerBody] = useState('');
  const [customerHtml, setCustomerHtml] = useState('');
  const [bodyEdited, setBodyEdited] = useState(false);
  const [customerSendState, setCustomerSendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await fetchVisit(visitId);
        if (!alive) return;
        setVisit(v);
        setTasks(v?.tasks ?? []);
        setProjectId(v?.project_id ?? null);
        setProjectName(v?.project?.name ?? null);

        const photoPaths = (v?.photos ?? []).map((p) => p.storage_path).filter(Boolean) as string[];
        if (photoPaths.length > 0) {
          const urls = await Promise.all(photoPaths.map((path) => getPhotoUrl(path, 3600)));
          const urlMap: Record<string, string> = {};
          photoPaths.forEach((path, i) => { if (urls[i]) urlMap[path] = urls[i]!; });
          if (alive) setPhotoUrls(urlMap);
        }

        const hasSummary = Boolean(v?.summary);
        const hasTasks = (v?.tasks ?? []).length > 0;
        const hasProposal = (v?.proposals ?? []).length > 0;

        if (!hasSummary && !hasTasks && !hasProposal) {
          setExtracting(true);
          try {
            const result = await extractVisit(visitId);
            if (!alive) return;
            const refreshed = await fetchVisit(visitId);
            if (!alive) return;
            setVisit(refreshed);
            setTasks(refreshed?.tasks ?? []);
            setProjectId(refreshed?.project_id ?? null);
            setProjectName(refreshed?.project?.name ?? null);
            if (!result.summary && !result.tasks.length && !result.proposal) {
              setExtractionError('No transcript content found — summary is empty.');
            }
          } catch (e) {
            if (alive) {
              setExtractionError(
                e instanceof Error ? e.message : 'AI extraction failed — you can still save manually.',
              );
            }
          } finally {
            if (alive) setExtracting(false);
          }
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load summary');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [visitId]);

  async function handleToggle(task: Task) {
    try {
      const updated = await toggleTask(task);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update task');
    }
  }

  async function handleSend() {
    if (sendState === 'sending') return;
    setSendState('sending');
    setSendError(null);
    try {
      const result = await sendVisitSummary(visitId);
      setSentTo(result.sent_to);
      setSendState('sent');
      setTimeout(() => { setSendState('idle'); setMoreOpen(false); }, 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Couldn\u2019t send \u2014 try again';
      if (msg === 'NO_SUMMARY_EMAIL') {
        setSendError('NO_SUMMARY_EMAIL');
      } else {
        setSendError('Couldn\u2019t send \u2014 try again');
      }
      setSendState('idle');
    }
  }

  async function handleCustomerCompose() {
    if (!visit?.customer?.contact_email || customerComposeLoading) return;
    setCustomerComposeOpen(true);
    setCustomerComposeLoading(true);
    setSendError(null);
    try {
      const preview = await previewVisitSummaryEmail(visitId);
      setCustomerSubject(preview.subject);
      setCustomerBody(preview.plainText);
      setCustomerHtml(preview.html);
      setBodyEdited(false);
    } catch (e) {
      setCustomerComposeOpen(false);
      setSendError(e instanceof Error && e.message === 'NO_CONTACT_EMAIL' ? 'NO_CONTACT_EMAIL' : 'Couldn’t prepare email');
    } finally {
      setCustomerComposeLoading(false);
    }
  }

  async function handleCustomerSend() {
    if (customerSendState === 'sending') return;
    setCustomerSendState('sending');
    setSendError(null);
    try {
      const result = await sendVisitSummary(visitId, {
        recipient: 'customer',
        subject: customerSubject,
        body_text: customerBody,
        body_html: bodyEdited ? plainTextToHtml(customerBody) : customerHtml,
      });
      setSentTo(result.sent_to);
      setCustomerComposeOpen(false);
      setCustomerSendState('sent');
      setTimeout(() => setCustomerSendState('idle'), 2500);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setSendError(message === 'NO_CONTACT_EMAIL' ? 'NO_CONTACT_EMAIL' : 'Couldn’t send — try again');
      setCustomerSendState('idle');
    }
  }

  async function handleSave() {
    // Backstop for the same "nothing captured" case ActiveVisit already
    // guards on its own exits — covers any other path that could land here
    // with a blank visit (e.g. a manually-cleared summary with no other
    // content). If there's truly nothing — no summary text, no tasks, no
    // photos, no voice/typed entries, no proposal, no ready-to-bill —
    // discard instead of saving a blank record.
    const summaryText = (visit?.summary ?? '').trim();
    const hasContent =
      summaryText.length > 0 ||
      tasks.length > 0 ||
      (visit?.photos?.length ?? 0) > 0 ||
      (visit?.voice_recordings?.length ?? 0) > 0 ||
      (visit?.typed_entries?.length ?? 0) > 0 ||
      (visit?.proposals?.length ?? 0) > 0 ||
      (visit?.ready_to_bill?.length ?? 0) > 0;

    if (!hasContent) {
      discardEmptyVisit(visitId).catch(() => {});
      onSaved();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveVisitSummary(visitId, { status: 'saved', summary: visit?.summary ?? '' });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save visit');
    } finally {
      setSaving(false);
    }
  }

  if (loading || extracting) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-[18px] pt-6">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
        <div className="text-[13px] text-mist">Organizing your visit…</div>
        <div className="text-center text-[11.5px] leading-snug text-mist-dim">Pulling out tasks and matching it against past visits to this property.</div>
      </div>
    );
  }

  if (error || !visit) {
    return (
      <div className="flex flex-1 flex-col px-[18px] pt-6">
          <TopBar onBack={onBack} title="Visit summary" />
          <div className="mt-6 rounded-[16px] border border-coral/30 bg-coral/10 px-3 py-3 text-[12px] text-coral">
            {error ?? 'Visit not found'}
          </div>
        </div>
    );
  }

  const proposal = visit.proposals?.[0];
  const readyToBill = visit.ready_to_bill?.[0];
  const summary = visit.summary ?? '';

  return (
    <>
      <div className="flex flex-1 flex-col overflow-y-auto px-[18px] pt-6 no-scrollbar">
        <TopBar
          onBack={onBack}
          title="Visit summary"
          subtitle={`${visit.customer?.name ?? 'Visit'} · ${new Date(visit.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        />

        <button
          onClick={() => setSheetOpen(true)}
          className="mb-3.5 mt-1 flex items-center gap-1.5 text-[12px] text-amber"
        >
          <span>{visit.customer ? `Change customer (${visit.customer.name})` : 'Identify customer'}</span>
        </button>

        {readOnly && (
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            className="mb-3.5 -mt-1 flex items-center gap-1.5 text-[12px] text-coral"
          >
            <Trash2 size={13} />
            <span>Delete visit</span>
          </button>
        )}

        {/* TEMPORARY ROLLBACK (prod only): project assignment hidden while
            gauging organic demand before exposing it to test users. To
            restore, delete this comment and change `false &&` back to just
            `visit.customer_id &&` below. */}
        {false && visit?.customer_id && (
          <button
            onClick={() => setProjectSheetOpen(true)}
            className="mb-3.5 -mt-1 flex items-center gap-1.5 text-[12px] text-amber"
          >
            <Folder size={13} />
            <span>{projectName ? `Project: ${projectName}` : 'Assign project'}</span>
          </button>
        )}

        <div
          onClick={() => {
            if (editingSummary) return;
            setSummaryDraft(summary);
            setEditingSummary(true);
          }}
          className="mb-3.5 mt-1 rounded-[16px] border border-border bg-cell p-3.5 text-[12.5px] leading-relaxed text-mist"
        >
          {editingSummary ? (
            <textarea
              autoFocus
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value.slice(0, 5000))}
              onBlur={async () => {
                setEditingSummary(false);
                if (summaryDraft.trim() === summary.trim()) return;
                try {
                  await updateVisitSummaryText(visitId, summaryDraft);
                  setVisit((prev) => prev ? { ...prev, summary: summaryDraft.trim() || null, edited: true } : prev);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not update summary');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  (e.target as HTMLTextAreaElement).blur();
                }
              }}
              rows={5}
              placeholder="No summary was generated for this visit. You can still add details manually."
              className="w-full resize-none bg-transparent text-[12.5px] leading-relaxed text-chalk placeholder:text-mist-dim focus:outline-none"
            />
          ) : (
            summary || (
              <span className="text-mist-dim">No summary was generated for this visit. You can still save it and add details manually.</span>
            )
          )}
        </div>

        {extractionError && (
          <div className="mb-3.5 rounded-[10px] border border-amber/30 bg-amber/10 px-3 py-2 text-[11.5px] text-amber-ink">
            {extractionError}
          </div>
        )}

        <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
          Tasks ({tasks.length})
        </div>
        <div>
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex w-full items-start gap-2.5 py-2 text-left"
            >
              <button
                onClick={() => handleToggle(t)}
                className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-border-strong transition-colors active:scale-90"
                aria-label={t.status === 'done' ? 'Reopen task' : 'Complete task'}
              >
                {t.status === 'done' && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-dusk">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <div
                className="flex-1 min-w-0"
                onClick={() => {
                  if (editingTaskId === t.id) return;
                  setTaskDraft(t.title);
                  setEditingTaskId(t.id);
                }}
              >
                {editingTaskId === t.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={taskDraft}
                    onChange={(e) => setTaskDraft(e.target.value.slice(0, 500))}
                    onBlur={async () => {
                      setEditingTaskId(null);
                      if (taskDraft.trim() === t.title.trim()) return;
                      try {
                        await updateTaskTitle(t.id, taskDraft);
                        setTasks((prev) => prev.map((tk) => tk.id === t.id ? { ...tk, title: taskDraft.trim(), edited: true } : tk));
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Could not update task');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className="w-full rounded border border-border-strong bg-cell px-1.5 py-0.5 text-[12.5px] text-chalk focus:outline-none"
                  />
                ) : (
                  <>
                    <div
                      className={`text-[12.5px] ${t.status === 'done' ? 'text-mist line-through' : 'text-chalk'}`}
                    >
                      {t.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      {t.priority && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          t.priority === 'high' ? 'bg-coral/15 text-coral' :
                          t.priority === 'medium' ? 'bg-amber/15 text-amber' :
                          'bg-dusk/15 text-dusk'
                        }`}>
                          {t.priority}
                        </span>
                      )}
                      {t.due_context && <span className="text-[11px] text-mist">{t.due_context}</span>}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {proposal && (
          <>
            <div className="mb-2.5 mt-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              Proposal draft
            </div>
            <div className="mb-3.5 rounded-[16px] border border-border-strong bg-cell p-3.5">
              <div className="flex items-baseline justify-between">
                <div className="text-[13px] font-semibold text-chalk">{proposal.title}</div>
                <div className="font-head text-[17px] font-bold text-amber">{proposal.price_text}</div>
              </div>
              {proposal.description && (
                <ul className="mt-2 space-y-1">
                  {proposal.description.split('\n').map((line, i) => (
                    <li key={i} className="flex gap-1.5 text-[11.5px] leading-relaxed text-mist">
                      <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-mist-dim" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {readyToBill && (
          <>
            <div className="mb-2.5 mt-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              Ready to bill
            </div>
            <div className="mb-3.5 rounded-[16px] border border-dusk/25 bg-dusk-dim/40 p-3.5">
              <div className="flex items-baseline justify-between">
                <div className="text-[13px] font-semibold text-chalk">{readyToBill.title}</div>
                {readyToBill.amount != null && (
                  <div className="font-head text-[17px] font-bold text-dusk">
                    ${readyToBill.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </div>
                )}
              </div>
              {readyToBill.description && (
                <ul className="mt-2 space-y-1">
                  {readyToBill.description.split('\n').map((line, i) => (
                    <li key={i} className="flex gap-1.5 text-[11.5px] leading-relaxed text-mist">
                      <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-mist-dim" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex gap-1.5">
                {(['unreported', 'waiting', 'paid'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handlePaymentStatus(readyToBill.id, s)}
                    disabled={paymentStatusSaving}
                    className={`flex-1 rounded-[10px] border py-1.5 text-[11px] font-medium capitalize transition-colors disabled:opacity-50 ${
                      readyToBill.payment_status === s
                        ? s === 'paid'
                          ? 'border-dusk bg-dusk/20 text-dusk'
                          : 'border-amber bg-amber-dim text-amber'
                        : 'border-border-strong bg-cell-2 text-mist'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {visit.photos && visit.photos.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {visit.photos.map((p) => (
              <div key={p.id} className="w-[110px] shrink-0">
                <button
                  onClick={() => {
                    setEditingPhoto(p.id);
                    setPhotoDraft(p.caption ?? '');
                  }}
                  className="aspect-square w-full overflow-hidden rounded-[10px] border border-border bg-cell-2"
                >
                  {p.storage_path && photoUrls[p.storage_path] ? (
                    <img
                      src={photoUrls[p.storage_path]}
                      alt="Site photo"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </button>
                {editingPhoto === p.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={photoDraft}
                    onChange={(e) => setPhotoDraft(e.target.value.slice(0, 140))}
                    onBlur={async () => {
                      const updated = await updatePhotoCaption(p.id, photoDraft);
                      setVisit((prev) => prev ? { ...prev, photos: (prev.photos ?? []).map((ph) => ph.id === p.id ? updated : ph) } : prev);
                      setEditingPhoto(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    placeholder="Add a caption"
                    className="mt-1 w-full rounded border border-border-strong bg-cell px-1.5 py-1 text-[11px] text-chalk placeholder:text-mist-dim focus:outline-none"
                  />
                ) : (
                  <p className="mt-1 truncate text-[11px] text-mist">{p.caption ?? ''}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2.5 border-t border-border px-[18px] pt-3.5 pb-5">
        {!readOnly && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-[10px] bg-amber py-3 text-center font-head text-[13px] font-semibold text-amber-ink disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save visit'}
          </button>
        )}
        <button
          onClick={handleSend}
          disabled={sendState === 'sending'}
          className="min-w-0 flex-1 rounded-[10px] border border-amber/40 bg-amber/10 py-3 text-center font-head text-[13px] font-semibold text-amber disabled:opacity-50"
        >
          <span className="block truncate px-1">
            {sendState === 'sending' ? 'Sending…' : sendState === 'sent' ? `Sent to ${sentTo}` : 'Email me a summary'}
          </span>
        </button>
        <button
          onClick={() => setMoreOpen(true)}
          title="More options"
          aria-label="More options"
          className="flex shrink-0 items-center justify-center rounded-[10px] border border-border-strong bg-cell-2 px-3.5 py-3 text-chalk"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {sendState === 'sent' && (
        <div className="px-[18px] pb-3 text-[11.5px] text-dusk">Sent to {sentTo}</div>
      )}

      {customerSendState === 'sent' && (
        <div className="px-[18px] pb-3 text-[11.5px] text-dusk">Sent to customer at {sentTo}</div>
      )}

      {moreOpen && (
        <MoreOptionsSheet
          onClose={() => setMoreOpen(false)}
          onCopy={handleCopy}
          copyState={copyState}
          hasCustomerEmail={Boolean(visit.customer?.contact_email)}
          customerName={visit.customer?.name ?? 'customer'}
          onSendToCustomer={() => {
            setMoreOpen(false);
            handleCustomerCompose();
          }}
          onIdentifyCustomer={() => {
            setMoreOpen(false);
            if (visit.customer_id) onOpenCustomer(visit.customer_id);
          }}
          customerComposeLoading={customerComposeLoading}
          customerSendState={customerSendState}
          sentTo={sentTo}
          onShare={handleShare}
          sendingShare={sendingShare}
        />
      )}

      {sendError === 'NO_SUMMARY_EMAIL' && (
        <div className="flex items-center justify-between gap-2 px-[18px] pb-3 text-[11.5px] text-amber">
          <span>Add a summary email in your profile to use this</span>
          <button
            onClick={() => setSheetOpen(true)}
            className="shrink-0 underline"
          >
            Update profile
          </button>
        </div>
      )}

      {sendError && sendError !== 'NO_SUMMARY_EMAIL' && (
        <div className="px-[18px] pb-3 text-[11.5px] text-coral">
          {sendError}
        </div>
      )}

      {customerComposeOpen && (
        <CustomerEmailCompose
          email={visit.customer?.contact_email ?? ''}
          subject={customerSubject}
          body={customerBody}
          loading={customerComposeLoading}
          sending={customerSendState === 'sending'}
          onSubjectChange={setCustomerSubject}
          onBodyChange={(v) => { setCustomerBody(v); setBodyEdited(true); }}
          onSend={handleCustomerSend}
          onClose={() => setCustomerComposeOpen(false)}
        />
      )}

      {sheetOpen && (
        <CustomerSheet
          visitId={visitId}
          gps={null}
          onAttached={() => {
            setSheetOpen(false);
            (async () => {
              const refreshed = await fetchVisit(visitId);
              setVisit(refreshed);
              setTasks(refreshed?.tasks ?? []);
              setProjectId(refreshed?.project_id ?? null);
              setProjectName(refreshed?.project?.name ?? null);
            })();
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {projectSheetOpen && visit.customer_id && (
        <ProjectSheet
          visitId={visitId}
          customerId={visit.customer_id}
          currentProjectId={projectId}
          onSelected={(newId, newName) => {
            setProjectId(newId);
            setProjectName(newName);
            setProjectSheetOpen(false);
          }}
          onClose={() => setProjectSheetOpen(false)}
        />
      )}

      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => !deleting && setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-[400px] rounded-t-[20px] bg-ink-2 p-5 pb-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-center text-[14px] font-semibold text-chalk">
              Delete this visit?
            </div>
            <div className="mb-5 text-center text-[12.5px] leading-relaxed text-mist">
              This permanently removes the visit and everything on it — summary, tasks, photos, and any proposal. This can't be undone.
            </div>
            {deleteError && (
              <div className="mb-3 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-center text-[12px] text-coral">
                {deleteError}
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full rounded-[10px] bg-coral py-3 text-center font-head text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete visit'}
              </button>
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="w-full rounded-[10px] border border-border-strong bg-cell py-3 text-center font-head text-[13px] font-semibold text-chalk disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function plainTextToHtml(value: string): string {
  const blocks = value.split(/\n\s*\n/);
  const parts: string[] = [];
  const wrapper = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;">`;
  parts.push(wrapper);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const escaped = escapeHtmlLite(trimmed);
    const isHeading = /^[A-Z][A-Z\s]{2,}$/.test(trimmed) && trimmed.length < 24;
    if (isHeading) {
      parts.push(`<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin:24px 0 8px;">${escaped}</h3>`);
    } else if (/^[•\-*]\s/.test(trimmed)) {
      const items = trimmed.split(/\n/).filter((l) => l.trim());
      parts.push(`<ul style="padding-left:20px;margin:0 0 16px;font-size:14px;line-height:1.6;">`);
      for (const item of items) {
        const clean = item.replace(/^[•\-*]\s*/, '').trim();
        parts.push(`<li>${escapeHtmlLite(clean)}</li>`);
      }
      parts.push(`</ul>`);
    } else {
      const withBreaks = escaped.replace(/\n/g, '<br>');
      parts.push(`<p style="font-size:14px;line-height:1.6;margin:0 0 16px;white-space:pre-wrap;">${withBreaks}</p>`);
    }
  }

  parts.push(`<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">`);
  parts.push(`<p style="font-size:12px;color:#999;margin:0;">Sent via Atlas</p>`);
  parts.push(`</div>`);
  return parts.join('');
}

function escapeHtmlLite(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function CustomerEmailCompose({
  email,
  subject,
  body,
  loading,
  sending,
  onSubjectChange,
  onBodyChange,
  onSend,
  onClose,
}: {
  email: string;
  subject: string;
  body: string;
  loading: boolean;
  sending: boolean;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSend: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-[520px] flex-col rounded-t-[20px] bg-ink-2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-[15px] font-semibold text-chalk">Email to customer</div>
        <div className="mb-4 text-[11.5px] text-mist">To: {email}</div>
        <label className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">Subject</label>
        <input value={subject} onChange={(e) => onSubjectChange(e.target.value)} disabled={loading || sending} className="mb-3 rounded-[10px] border border-border-strong bg-cell px-3 py-2.5 text-[13px] text-chalk focus:outline-none" />
        <label className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">Body</label>
        <textarea value={body} onChange={(e) => { onBodyChange(e.target.value); }} disabled={loading || sending} rows={12} className="mb-4 min-h-[180px] resize-none rounded-[10px] border border-border-strong bg-cell px-3 py-2.5 text-[12.5px] leading-relaxed text-chalk focus:outline-none" />
        <div className="flex gap-2.5">
          <button onClick={onClose} disabled={sending} className="flex-1 rounded-[10px] border border-border-strong bg-cell py-3 text-[13px] font-semibold text-chalk disabled:opacity-50">Cancel</button>
          <button onClick={onSend} disabled={loading || sending || !subject.trim() || !body.trim()} className="flex-1 rounded-[10px] bg-amber py-3 text-[13px] font-semibold text-amber-ink disabled:opacity-50">{sending ? 'Sending…' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}

function MoreOptionsSheet({
  onClose,
  onCopy,
  copyState,
  hasCustomerEmail,
  customerName,
  onSendToCustomer,
  onIdentifyCustomer,
  customerComposeLoading,
  customerSendState,
  sentTo,
  onShare,
  sendingShare,
}: {
  onClose: () => void;
  onCopy: () => void;
  copyState: 'idle' | 'copied';
  hasCustomerEmail: boolean;
  customerName: string;
  onSendToCustomer: () => void;
  onIdentifyCustomer: () => void;
  customerComposeLoading: boolean;
  customerSendState: 'idle' | 'sending' | 'sent';
  sentTo: string;
  onShare: () => void;
  sendingShare: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-t-[20px] bg-ink-2 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[15px] font-semibold text-chalk">More options</div>
          <button onClick={onClose} aria-label="Close" className="text-mist">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onCopy}
            className="flex items-center gap-3 rounded-[10px] border border-border-strong bg-cell px-3.5 py-3 text-left text-[13px] text-chalk"
          >
            {copyState === 'copied' ? <Check size={17} className="text-dusk" /> : <Copy size={17} />}
            <span>{copyState === 'copied' ? 'Copied' : 'Copy visit summary'}</span>
          </button>

          <button
            onClick={hasCustomerEmail ? onSendToCustomer : onIdentifyCustomer}
            disabled={customerComposeLoading || customerSendState === 'sending'}
            className="flex items-center gap-3 rounded-[10px] border border-border-strong bg-cell px-3.5 py-3 text-left text-[13px] text-chalk disabled:opacity-50"
          >
            {customerComposeLoading || customerSendState === 'sending' ? (
              <div className="h-[17px] w-[17px] animate-spin rounded-full border-2 border-border-strong border-t-amber" />
            ) : customerSendState === 'sent' ? (
              <Check size={17} className="text-dusk" />
            ) : (
              <Mail size={17} />
            )}
            <span className={customerSendState === 'sent' ? 'text-dusk' : ''}>
              {customerComposeLoading
                ? 'Preparing…'
                : customerSendState === 'sent'
                  ? `Sent to ${sentTo}`
                  : hasCustomerEmail
                    ? `Send to ${customerName}`
                    : 'Add customer email to send'}
            </span>
          </button>

          <button
            onClick={onShare}
            disabled={sendingShare}
            className="flex items-center gap-3 rounded-[10px] border border-border-strong bg-cell px-3.5 py-3 text-left text-[13px] text-chalk disabled:opacity-50"
          >
            {sendingShare ? (
              <div className="h-[17px] w-[17px] animate-spin rounded-full border-2 border-border-strong border-t-amber" />
            ) : (
              <Share2 size={17} />
            )}
            <span>{sendingShare ? 'Preparing…' : 'Send via…'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
