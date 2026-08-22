import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Search, ChevronRight, MessageCircle } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { Hex } from '@/components/Hex';
import { FormattedText } from '@/components/FormattedText';
import {
  buildCustomerContext,
  askAtlas,
  fetchCustomersWithStats,
  type Citation,
  type CustomerContext,
  type CustomerWithStats,
} from '@/lib/api';

interface AskAtlasProps {
  scopeCustomerId?: string;
  scopeCustomerName?: string;
  onBack: () => void;
  onOpenVisit: (visitId: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
}

const SUGGESTED_QUESTIONS = [
  'When was our last visit?',
  'Who is the decision maker?',
  'What do I need to know before my next visit?',
  'Are there any overdue tasks?',
];

const RECENT_LIMIT = 5;

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function AskAtlas({ scopeCustomerId, scopeCustomerName, onBack, onOpenVisit }: AskAtlasProps) {
  const [localCustomerId, setLocalCustomerId] = useState<string | null>(null);
  const [localCustomerName, setLocalCustomerName] = useState<string | null>(null);

  const effectiveCustomerId = scopeCustomerId ?? localCustomerId ?? undefined;
  const effectiveCustomerName = scopeCustomerName ?? localCustomerName ?? undefined;
  const isScoped = Boolean(effectiveCustomerId);
  const isLocallyScoped = Boolean(localCustomerId) && !scopeCustomerId;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contextCache = useRef<CustomerContext[] | null>(null);

  useEffect(() => {
    setMessages([]);
    setInput('');
    setError(null);
    contextCache.current = null;
  }, [effectiveCustomerId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function getContext(): Promise<CustomerContext[]> {
    if (contextCache.current) return contextCache.current;
    const ids = effectiveCustomerId ? [effectiveCustomerId] : [];
    const ctx = await buildCustomerContext(ids);
    contextCache.current = ctx;
    return ctx;
  }

  async function handleSend(question: string) {
    if (!question.trim() || loading || !isScoped) return;
    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    try {
      const contexts = await getContext();
      const result = await askAtlas(question, contexts);
      setMessages((prev) => [...prev, { role: 'assistant', text: result.answer, citations: result.citations }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get an answer');
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Sorry, I could not answer that. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (isLocallyScoped) {
      setLocalCustomerId(null);
      setLocalCustomerName(null);
    } else {
      onBack();
    }
  }

  function handleSelectCustomer(id: string, name: string) {
    setLocalCustomerId(id);
    setLocalCustomerName(name);
  }

  if (!isScoped) {
    return <CustomerPicker onSelect={handleSelectCustomer} onBack={onBack} />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-[18px] pt-6">
      <TopBar onBack={handleBack} title="Ask ServiceShadow" />

      {isScoped && (
        <div className="mb-3 mt-1 inline-flex items-center gap-1.5 self-start rounded-[20px] border border-dusk/30 bg-dusk-dim px-3 py-1.5 text-[12px] text-dusk">
          <User size={12} className="shrink-0" />
          <span className="font-medium">Asking about: {effectiveCustomerName}</span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar min-h-0">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-amber-dim">
              <Sparkles size={20} className="text-amber" />
            </div>
            <div className="text-center">
              <div className="text-[14px] font-medium text-chalk">
                Ask about {effectiveCustomerName}
              </div>
              <div className="mt-1 text-[12px] text-mist-dim">
                Answers are grounded in this customer's visit history.
              </div>
            </div>
            <div className="mt-2 flex w-full flex-col gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="rounded-[10px] border border-border bg-cell px-3 py-2.5 text-left text-[12.5px] text-mist transition-colors hover:border-border-strong hover:text-chalk"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="mb-3">
            <div
              className={`rounded-[16px] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'ml-8 bg-amber-dim text-chalk'
                  : 'mr-8 bg-cell text-chalk'
              }`}
            >
              {msg.role === 'user' ? msg.text : <FormattedText text={msg.text} />}
            </div>
            {msg.citations && msg.citations.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {msg.citations.map((c, j) => (
                  <button
                    key={j}
                    onClick={() => {
                      if (c.artifact_type === 'visit') onOpenVisit(c.artifact_id);
                    }}
                    disabled={c.artifact_type !== 'visit'}
                    title={c.artifact_type === 'visit' ? undefined : 'Source detail — not yet linkable'}
                    className={`inline-flex items-center gap-1 rounded-[20px] border px-2 py-1 text-[10.5px] font-medium transition-colors ${
                      c.artifact_type === 'visit'
                        ? 'border-dusk/30 bg-dusk-dim text-dusk hover:border-dusk/50'
                        : 'cursor-default border-border/60 bg-cell/60 text-mist-dim opacity-60'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="mb-3">
            <div className="mr-8 inline-flex items-center gap-2 rounded-[16px] bg-cell px-3.5 py-2.5">
              <div className="h-2 w-2 animate-bounce rounded-full bg-mist-dim" style={{ animationDelay: '0ms' }} />
              <div className="h-2 w-2 animate-bounce rounded-full bg-mist-dim" style={{ animationDelay: '150ms' }} />
              <div className="h-2 w-2 animate-bounce rounded-full bg-mist-dim" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[11.5px] text-coral">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-3 pb-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(input);
            }
          }}
          placeholder={`Ask about ${effectiveCustomerName}…`}
          disabled={loading}
          className="flex-1 rounded-[10px] border border-border bg-cell px-3 py-2.5 text-[13px] text-chalk placeholder:text-mist-dim focus:border-amber focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={() => handleSend(input)}
          disabled={!input.trim() || loading}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-amber text-amber-ink disabled:opacity-50"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function CustomerPicker({
  onSelect,
  onBack,
}: {
  onSelect: (id: string, name: string) => void;
  onBack: () => void;
}) {
  const [allCustomers, setAllCustomers] = useState<CustomerWithStats[]>([]);
  const [recent, setRecent] = useState<CustomerWithStats[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerWithStats[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasCustomers, setHasCustomers] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await fetchCustomersWithStats();
        if (!alive) return;
        setAllCustomers(all);
        setHasCustomers(all.length > 0);
        const sorted = [...all]
          .sort((a, b) => {
            const aT = a.last_visit_at ? new Date(a.last_visit_at).getTime() : 0;
            const bT = b.last_visit_at ? new Date(b.last_visit_at).getTime() : 0;
            return bT - aT;
          })
          .slice(0, RECENT_LIMIT);
        setRecent(sorted);
      } catch {
        // keep empty state
      } finally {
        if (alive) setLoadingRecent(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      setSearchResults(allCustomers.filter((c) => c.name.toLowerCase().includes(q)));
      setSearching(false);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, allCustomers]);

  const showSearch = query.trim().length > 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-[18px] pt-6">
      <TopBar onBack={onBack} title="Ask ServiceShadow" />

      <h2 className="mt-2 text-[18px] font-head font-bold text-chalk">
        Who do you want to ask about?
      </h2>

      <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-border bg-cell px-3 py-2">
        <Search size={14} className="text-mist-dim" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers…"
          className="flex-1 bg-transparent text-[13px] text-chalk placeholder:text-mist-dim focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar mt-4">
        {!hasCustomers && !loadingRecent ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-dusk-dim">
              <MessageCircle size={20} className="text-dusk" />
            </div>
            <div className="text-center max-w-[260px]">
              <div className="text-[14px] font-medium text-chalk">No customers yet</div>
              <div className="mt-1 text-[12px] text-mist-dim">
                Log your first visit to start asking ServiceShadow about your customers.
              </div>
            </div>
          </div>
        ) : showSearch ? (
          <div>
            <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
              {searching ? 'Searching…' : searchResults.length > 0 ? 'Search results' : 'No matches'}
            </div>
            {searchResults.map((c) => (
              <CustomerRow key={c.id} customer={c} onSelect={onSelect} />
            ))}
            {!searching && searchResults.length === 0 && (
              <div className="py-3 text-[12px] text-mist-dim">No customers found.</div>
            )}
          </div>
        ) : (
          <div>
            {loadingRecent ? (
              <div className="py-3 text-[12px] text-mist">Loading…</div>
            ) : recent.length > 0 ? (
              <>
                <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.06em] text-mist-dim">
                  Recent
                </div>
                {recent.map((c) => (
                  <CustomerRow key={c.id} customer={c} onSelect={onSelect} />
                ))}
              </>
            ) : (
              <div className="py-3 text-[12px] text-mist-dim">No recent customers.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerRow({
  customer,
  onSelect,
}: {
  customer: CustomerWithStats;
  onSelect: (id: string, name: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(customer.id, customer.name)}
      className="flex w-full items-center gap-3 border-b border-border py-3 text-left"
    >
      <Hex variant="avatar-sm">
        <span className="font-head font-extrabold text-amber-ink">{initials(customer.name)}</span>
      </Hex>
      <div className="flex-1 min-w-0">
        <div className="truncate text-[13.5px] font-semibold text-chalk">{customer.name}</div>
        <div className="mt-0.5 text-[11.5px] text-mist">
          {customer.property_count} {customer.property_count === 1 ? 'property' : 'properties'} · {customer.visit_count} {customer.visit_count === 1 ? 'visit' : 'visits'}
        </div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-mist-dim" />
    </button>
  );
}
