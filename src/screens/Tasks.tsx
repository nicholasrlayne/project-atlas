import { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, X, Check, Calendar, User, Download } from 'lucide-react';
import { fetchTasks, toggleTask, updateTaskTitle, searchCustomers, emailCsv, type OpenTask } from '@/lib/api';
import type { Task, Customer } from '@/lib/types';

interface TasksProps {
  onOpenVisit: (visitId: string) => void;
  initialStatus?: 'open' | 'done';
}

const DAY_MS = 1000 * 60 * 60 * 24;

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type StatusTab = 'open' | 'done';

export function Tasks({ onOpenVisit, initialStatus }: TasksProps) {
  const [allTasks, setAllTasks] = useState<OpenTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>(initialStatus ?? 'open');
  const [customerFilter, setCustomerFilter] = useState<{ id: string; name: string } | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tasks = await fetchTasks('open');
        if (!alive) return;
        setAllTasks(tasks);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load tasks');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const loadTasks = useCallback(async (status: StatusTab) => {
    setLoading(true);
    setError(null);
    try {
      const tasks = await fetchTasks(status);
      setAllTasks(tasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  function handleTabChange(tab: StatusTab) {
    if (tab === statusTab) return;
    setStatusTab(tab);
    setCustomerFilter(null);
    loadTasks(tab);
  }

  const filtered = useMemo(
    () => customerFilter ? allTasks.filter((t) => t.customer_id === customerFilter.id) : allTasks,
    [allTasks, customerFilter],
  );

  const openTiers = useMemo(() => {
    const overdue: OpenTask[] = [];
    const dueSoon: OpenTask[] = [];
    const noDate: OpenTask[] = [];
    const dueLater: OpenTask[] = [];

    for (const t of filtered) {
      if (!t.due_date) {
        noDate.push(t);
      } else {
        const days = daysUntil(t.due_date);
        if (days < 0) overdue.push(t);
        else if (days <= 30) dueSoon.push(t);
        else dueLater.push(t);
      }
    }

    overdue.sort((a, b) => daysUntil(a.due_date!) - daysUntil(b.due_date!));
    dueSoon.sort((a, b) => daysUntil(a.due_date!) - daysUntil(b.due_date!));
    noDate.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    dueLater.sort((a, b) => daysUntil(a.due_date!) - daysUntil(b.due_date!));

    const result: { label: string; tasks: OpenTask[] }[] = [];
    if (overdue.length > 0 || dueSoon.length > 0) {
      result.push({ label: 'Overdue & due soon', tasks: [...overdue, ...dueSoon] });
    }
    if (noDate.length > 0) result.push({ label: 'No due date', tasks: noDate });
    if (dueLater.length > 0) result.push({ label: 'Due later', tasks: dueLater });
    return result;
  }, [filtered]);

  const doneTasks = useMemo(
    () => [...filtered].sort((a, b) =>
      new Date(b.completed_at ?? b.created_at).getTime() - new Date(a.completed_at ?? a.created_at).getTime()
    ),
    [filtered],
  );

  async function handleToggle(task: Task) {
    setCompletingId(task.id);
    try {
      await toggleTask(task);
      setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update task');
    } finally {
      setCompletingId(null);
    }
  }
  async function handleTitleSave(taskId: string, title: string) {
    await updateTaskTitle(taskId, title);
    setAllTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title, edited: true } : t)),
    );
  }

  if (loading && allTasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
      </div>
    );
  }

  if (error && allTasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col px-[18px] pt-6">
        <div className="rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-3 text-[12px] text-coral">
          {error}
        </div>
      </div>
    );
  }

  const visibleTasks = statusTab === 'open' ? openTiers.flatMap((t) => t.tasks) : doneTasks;

  async function handleExport() {
    const rows = visibleTasks.map((t) => [
      t.title,
      t.customer_name ?? '',
      t.property_name ?? '',
      t.due_date ?? '',
      t.priority ?? '',
      t.status,
    ]);

    setExportState('sending');
    setExportError(null);
    try {
      await emailCsv(
        `servicshadow-tasks-${statusTab}.csv`,
        ['Task', 'Customer', 'Property', 'Due Date', 'Priority', 'Status'],
        rows,
        'task_list',
      );
      setExportState('sent');
      setTimeout(() => setExportState('idle'), 3000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Could not email export');
      setExportState('idle');
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-[18px] pt-6 no-scrollbar min-h-0">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-head text-[22px] font-bold leading-tight text-chalk">Tasks</h1>
          <p className="mt-0.5 text-[13px] text-mist">
            {allTasks.length} {statusTab === 'open' ? 'open' : 'completed'} {customerFilter ? `· ${customerFilter.name}` : ''}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exportState === 'sending'}
          title="Email CSV export"
          aria-label="Email CSV export"
          className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] bg-cell-2 text-mist transition-colors hover:bg-cell active:scale-95 disabled:opacity-50"
        >
          {exportState === 'sending' ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
          ) : exportState === 'sent' ? (
            <Check size={16} className="text-dusk" />
          ) : (
            <Download size={16} />
          )}
        </button>
      </div>

      {exportError && (
        <div className="mt-3 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[11.5px] text-coral">
          {exportError}
        </div>
      )}

      <div className="mt-4 flex gap-0 rounded-[10px] border border-border bg-cell p-0.5">
        <button
          onClick={() => handleTabChange('open')}
          className={`flex-1 rounded-[10px] py-2 text-center text-[12.5px] font-medium transition-colors ${
            statusTab === 'open' ? 'bg-amber-dim text-amber' : 'text-mist'
          }`}
        >
          Open
        </button>
        <button
          onClick={() => handleTabChange('done')}
          className={`flex-1 rounded-[10px] py-2 text-center text-[12.5px] font-medium transition-colors ${
            statusTab === 'done' ? 'bg-amber-dim text-amber' : 'text-mist'
          }`}
        >
          Completed
        </button>
      </div>

      <div className="mt-3">
        {customerFilter ? (
          <div className="inline-flex items-center gap-1.5 rounded-[20px] border border-amber bg-amber-dim px-3 py-1.5 text-[12px] text-amber">
            <User size={12} className="shrink-0" />
            <span className="max-w-[180px] truncate">{customerFilter.name}</span>
            <button
              onClick={() => setCustomerFilter(null)}
              className="ml-0.5 shrink-0 rounded-full p-0.5 hover:bg-amber/20"
              aria-label="Clear customer filter"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSheetOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-[20px] border border-border bg-cell px-3 py-1.5 text-[12px] text-mist transition-colors hover:border-border-strong"
          >
            <Search size={12} className="shrink-0" />
            <span>Filter by customer</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[11.5px] text-coral">
          {error}
        </div>
      )}

      {allTasks.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-12">
          <div className="text-[14px] font-medium text-chalk">
            {statusTab === 'open' ? 'No open tasks' : 'No completed tasks'}
          </div>
          <div className="text-[12px] text-mist-dim">
            {statusTab === 'open' ? 'Tasks from visit summaries will appear here.' : 'Completed tasks will appear here.'}
          </div>
        </div>
      )}

      {allTasks.length > 0 && customerFilter && filtered.length === 0 && (
        <div className="py-8 text-center text-[12px] text-mist-dim">
          No {statusTab === 'open' ? 'open' : 'completed'} tasks for {customerFilter.name}
        </div>
      )}

      {statusTab === 'open' && openTiers.map((tier) => (
        <div key={tier.label}>
          <div className="mb-1.5 mt-5 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
            {tier.label}
          </div>
          {tier.tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              isCompleting={completingId === t.id}
              onToggle={() => handleToggle(t)}
              onOpenVisit={() => { if (t.visit_id) onOpenVisit(t.visit_id); }}
              onTitleSave={(title) => handleTitleSave(t.id, title)}
              showDue
            />
          ))}
        </div>
      ))}

      {statusTab === 'done' && doneTasks.length > 0 && (
        <div>
          <div className="mb-1.5 mt-5 text-[11px] font-medium uppercase tracking-[0.06em] text-mist-dim">
            Completed
          </div>
          {doneTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              isCompleting={completingId === t.id}
              onToggle={() => handleToggle(t)}
              onOpenVisit={() => { if (t.visit_id) onOpenVisit(t.visit_id); }}
              onTitleSave={(title) => handleTitleSave(t.id, title)}
              showCompleted
            />
          ))}
        </div>
      )}

      {sheetOpen && (
        <CustomerFilterSheet
          onSelect={(c) => {
            setCustomerFilter({ id: c.id, name: c.name });
            setSheetOpen(false);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

function TaskRow({
  task,
  isCompleting,
  onToggle,
  onOpenVisit,
  onTitleSave,
  showDue,
  showCompleted,
}: {
  task: OpenTask;
  isCompleting: boolean;
  onToggle: () => void;
  onOpenVisit: () => void;
  onTitleSave: (title: string) => Promise<void>;
  showDue?: boolean;
  showCompleted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const days = task.due_date ? daysUntil(task.due_date) : null;
  const isOverdue = days !== null && days < 0;
  const custLabel = [task.customer_name, task.property_name].filter(Boolean).join(' · ');

  return (
    <div
      className={`flex items-start gap-2.5 border-b border-border py-2.5 transition-opacity ${
        isCompleting ? 'opacity-40' : 'opacity-100'
      }`}
    >
      <button
        onClick={onToggle}
        className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-border-strong transition-colors active:scale-90"
        aria-label={showCompleted ? 'Reopen task' : 'Complete task'}
      >
        {showCompleted && (
          <Check size={12} className="text-dusk" strokeWidth={2.5} />
        )}
      </button>
      <div className="flex flex-1 flex-col items-start text-left">
        {editing ? (
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 500))}
            onBlur={async () => {
              setEditing(false);
              if (draft.trim() === task.title.trim()) return;
              try {
                await onTitleSave(draft);
              } catch {
                setDraft(task.title);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-full rounded border border-border-strong bg-cell px-1.5 py-0.5 text-[12.5px] text-chalk focus:outline-none"
          />
        ) : (
          <div
            onClick={() => { setDraft(task.title); setEditing(true); }}
            className="flex w-full items-center justify-between gap-2"
          >
            <div className={`text-[12.5px] ${showCompleted ? 'text-mist line-through' : 'text-chalk'}`}>
              {task.title}
            </div>
            {showDue && days === null && (
              <span className="shrink-0 text-[11px] text-mist-dim">—</span>
            )}
            {showDue && isOverdue && (
              <span className="shrink-0 rounded bg-coral/15 px-1.5 py-0.5 text-[10px] font-medium text-coral">
                {Math.abs(days!)}d overdue
              </span>
            )}
            {showDue && days !== null && !isOverdue && (
              <span className="shrink-0 text-[11px] text-mist">
                Due in {days} {days === 1 ? 'day' : 'days'}
              </span>
            )}
            {showCompleted && task.completed_at && (
              <span className="shrink-0 flex items-center gap-1 text-[11px] text-mist-dim">
                <Calendar size={10} />
                {formatDate(task.completed_at)}
              </span>
            )}
          </div>
        )}
        {custLabel && !editing && (
          <div className="mt-0.5 text-[11.5px] text-mist">{custLabel}</div>
        )}
      </div>
    </div>
  );
}

function CustomerFilterSheet({
  onSelect,
  onClose,
}: {
  onSelect: (customer: Customer) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const results = await searchCustomers('');
        if (alive) setCustomers(results);
      } catch {
        // keep empty
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const results = await searchCustomers(query);
        if (alive) setCustomers(results);
      } catch {
        // keep previous
      }
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[70dvh] w-full max-w-md flex-col rounded-t-[20px] border-t border-border-strong bg-ink pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-head text-[15px] font-bold text-chalk">Filter by customer</h2>
          <button onClick={onClose} aria-label="Close" className="text-mist hover:text-chalk">
            <X size={18} />
          </button>
        </div>

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
          {loading && customers.length === 0 && (
            <div className="py-3 text-[12px] text-mist">Loading…</div>
          )}
          {!loading && customers.length === 0 && (
            <div className="py-3 text-[12px] text-mist-dim">No customers found.</div>
          )}
          {customers.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="flex w-full items-center gap-2.5 border-b border-border py-2.5 text-left"
            >
              <div className="flex-1">
                <div className="text-[13px] font-medium text-chalk">{c.name}</div>
                {c.contact_phone && <div className="text-[11px] text-mist">{c.contact_phone}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
