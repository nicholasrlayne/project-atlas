import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

interface ExtractionResult {
  summary: string;
  tasks: { title: string; priority: string; due_date: string | null }[];
  proposal: {
    title: string;
    price_estimate: number;
    description: string;
  } | null;
  customer_facts: { type: string; value: string }[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return new Response(
      JSON.stringify({ error: "Anthropic API key not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { visit_id } = await req.json();
    if (!visit_id || typeof visit_id !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid visit_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the visit's user_id so we can stamp it onto all rows we insert.
    // The service role key bypasses RLS, so user_id must be set explicitly on
    // every insert — RLS won't enforce it here. visitUserId is passed as a
    // parameter into persistExtraction so it is strictly scoped to this request
    // and cannot bleed across concurrent invocations (module-level functions do
    // not close over handler-local variables).
    const { data: visitRow, error: visitFetchErr } = await supabase
      .from("visits")
      .select("user_id, started_at")
      .eq("id", visit_id)
      .maybeSingle();
    if (visitFetchErr) throw new Error(`Failed to load visit: ${visitFetchErr.message}`);
    const visitUserId = visitRow?.user_id as string | null;
    const visitDate = visitRow?.started_at
      ? new Date(visitRow.started_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    console.log(`extract-visit: visit=${visit_id} user=${visitUserId ?? "null"}`);

    const [voiceRes, typedRes] = await Promise.all([
      supabase.from("voice_recordings").select("transcript, created_at").eq("visit_id", visit_id),
      supabase.from("typed_entries").select("body, created_at").eq("visit_id", visit_id).order("created_at"),
    ]);

    if (voiceRes.error) throw new Error(`Failed to load voice recordings: ${voiceRes.error.message}`);
    if (typedRes.error) throw new Error(`Failed to load typed entries: ${typedRes.error.message}`);

    type TranscriptEntry = { source: "Voice" | "Typed"; text: string; at: string };

    const voiceEntries: TranscriptEntry[] = (voiceRes.data ?? [])
      .filter((r: { transcript?: string | null }) =>
        Boolean(r.transcript && r.transcript.trim() && r.transcript !== "[transcription unavailable]"))
      .map((r: { transcript?: string | null; created_at: string }) => ({
        source: "Voice" as const,
        text: r.transcript!.trim(),
        at: r.created_at,
      }));

    const typedEntries: TranscriptEntry[] = (typedRes.data ?? [])
      .filter((r: { body?: string }) => Boolean(r.body && r.body.trim()))
      .map((r: { body?: string; created_at: string }) => ({
        source: "Typed" as const,
        text: r.body!.trim(),
        at: r.created_at,
      }));

    const combinedTranscript = [...voiceEntries, ...typedEntries]
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .map((e) => `[${e.source}] ${e.text}`)
      .join("\n\n");

    if (!combinedTranscript.trim()) {
      const empty: ExtractionResult = { summary: "", tasks: [], proposal: null, customer_facts: [] };
      await persistExtraction(supabase, visit_id, visitUserId, empty);
      return new Response(
        JSON.stringify({ summary: "", tasks: [], proposal: null, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const extraction = await callClaude(anthropicKey, combinedTranscript, visitDate);
    await persistExtraction(supabase, visit_id, visitUserId, extraction);

    // Fetch customer_id for fact persistence
    let customerId: string | null = null;
    if (extraction.customer_facts.length > 0) {
      const { data: visitForCustomer } = await supabase
        .from("visits")
        .select("customer_id")
        .eq("id", visit_id)
        .maybeSingle();
      customerId = visitForCustomer?.customer_id as string | null;
    }
    if (customerId && extraction.customer_facts.length > 0) {
      await persistCustomerFacts(supabase, customerId, visitUserId!, visit_id, extraction.customer_facts);
    }

    return new Response(
      JSON.stringify(extraction),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function callClaude(apiKey: string, transcript: string, visitDate: string): Promise<ExtractionResult> {
  const systemPrompt =
    "You are an assistant for field-service businesses. Read the visit transcript and notes, " +
    "then extract a concise summary, actionable tasks, and an optional proposal draft. " +
    "Use the extract_visit tool to return structured data. If there is not enough information " +
    "for a proposal, set proposal to null. " +
    "Task priority must be exactly one of: low, medium, high. " +
    "Visit status after extraction must be exactly one of: active, summarized, saved. " +
    "The proposal.description field must be a newline-separated list of 3-6 short bullet points, " +
    "each describing a specific scope-of-work item grounded in what was observed or discussed " +
    "in the transcript (e.g. 'Clear debris from vent line', 'Inspect exterior exhaust cap for " +
    "damage', 'Reconnect and test airflow'). Do not write generic boilerplate. " +
    "If the transcript mentions a specific cost for a specific item, append it to that bullet " +
    "with an em dash and the dollar amount (e.g. 'Replace damaged exterior vent cap — $80'). " +
    "Only include a per-item cost when the transcript actually states one for that specific " +
    "item — never invent a price. Do not prefix bullets with dashes or asterisks; the rendering " +
    "layer adds bullet markers. price_estimate remains a single total figure for the whole proposal. " +
    "For each task, if the transcript mentions a date connected to that task (e.g. 'follow up on " +
    "August 15th', 'due next Tuesday', 'in two weeks', 'before the end of the month'), extract it " +
    "into the due_date field as an ISO 8601 date string (YYYY-MM-DD). Resolve relative dates " +
    "(e.g. 'next Tuesday', 'in two weeks') relative to the visit date provided below, NOT today's " +
    "date, since visits are often logged after the fact. If a date is vague or cannot be resolved " +
    "to a specific calendar date (e.g. 'next visit', 'sometime soon'), set due_date to null — " +
    "never guess or approximate. If no date is mentioned for a task, set due_date to null. " +
    "The visit date is: " + visitDate + "." +
    "\n\nAdditionally, extract key facts about this customer account when clearly stated in the transcript. " +
    "There are four fact types:\n" +
    "- decision_maker: who has authority to approve work or spending at this account (name and role if mentioned, e.g. 'Property manager, direct line 615-555-0148').\n" +
    "- process: a standing instruction or workflow detail specific to this customer (e.g. 'always call ahead 24 hours', 'gate code required', 'invoice goes to the HOA board, not the on-site manager').\n" +
    "- renewal_timing: any mention of contract or service renewal timing (e.g. 'renews every March', 'budget season is Q4'). Include the month or time period if stated.\n" +
    "- upsell_opportunity: a specific, concrete opportunity mentioned or observed (e.g. 'asked about quarterly service', 'mentioned they are expanding to Building D next year') — not vague sentiment, only concrete signals.\n\n" +
    "Be conservative: only extract a fact when there is a clear, specific statement in the transcript. Do not infer or guess. It is fine for a visit to produce zero facts. " +
    "Output facts in the customer_facts array, each with a type (one of the four above) and a value (the fact text).";

  const tools = [
    {
      name: "extract_visit",
      description: "Extract structured visit data from a field-service transcript.",
      input_schema: {
        type: "object" as const,
        properties: {
          summary: {
            type: "string",
            description: "A concise 1-3 sentence summary of what happened during the visit.",
          },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short action item title." },
                priority: { type: "string", enum: ["low", "medium", "high"] },
                due_date: {
                  type: ["string", "null"],
                  description: "ISO 8601 date (YYYY-MM-DD) if a specific date is mentioned for this task. Resolve relative dates against the visit date, not today. null if no date or date is vague.",
                },
              },
              required: ["title", "priority", "due_date"],
            },
          },
          proposal: {
            type: ["object", "null"],
            properties: {
              title: { type: "string" },
              price_estimate: { type: "number", description: "Estimated dollar amount." },
              description: { type: "string", description: "3-6 newline-separated bullet points, each a specific scope-of-work item. Append ' — $N' to a bullet only if the transcript states that specific item's cost. No bullet markers." },
            },
            required: ["title", "price_estimate", "description"],
          },
          customer_facts: {
            type: "array",
            description: "Key facts about this customer account. Empty array if none found.",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["decision_maker", "process", "renewal_timing", "upsell_opportunity"] },
                value: { type: "string", description: "The fact content, grounded in the transcript." },
              },
              required: ["type", "value"],
            },
          },
        },
        required: ["summary", "tasks", "proposal", "customer_facts"],
      },
    },
  ];

  const response = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the transcript and notes from a field-service visit:\n\n${transcript}\n\nPlease extract the visit data using the extract_visit tool.`,
        },
      ],
      tools,
      tool_choice: { type: "tool", name: "extract_visit" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const toolUseBlock = (data.content ?? []).find(
    (b: { type: string }) => b.type === "tool_use",
  );

  if (!toolUseBlock) {
    throw new Error("Claude did not return a tool_use block");
  }

  const input = toolUseBlock.input as ExtractionResult;
  return {
    summary: typeof input.summary === "string" ? input.summary : "",
    tasks: Array.isArray(input.tasks)
      ? input.tasks
          .filter((t) => t && typeof t.title === "string")
          .map((t) => ({
            title: t.title,
            priority: typeof t.priority === "string" ? t.priority : "medium",
            due_date: typeof t.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
          }))
      : [],
    proposal:
      input.proposal && typeof input.proposal === "object" && input.proposal.title
        ? {
            title: input.proposal.title,
            price_estimate: typeof input.proposal.price_estimate === "number" ? input.proposal.price_estimate : 0,
            description: typeof input.proposal.description === "string" ? input.proposal.description : "",
          }
        : null,
    customer_facts: Array.isArray(input.customer_facts)
      ? input.customer_facts
          .filter((f) => f && typeof f.type === "string" && typeof f.value === "string" && f.value.trim())
          .filter((f) => ["decision_maker", "process", "renewal_timing", "upsell_opportunity"].includes(f.type))
          .map((f) => ({ type: f.type, value: f.value.trim() }))
      : [],
  };
}

// visitUserId is passed explicitly — not captured from the outer handler scope.
// Module-level functions do not close over handler-local variables; relying on
// the outer closure would produce undefined on cold starts and a stale value
// from a prior request on warm invocations, both of which are incorrect.
async function persistExtraction(
  supabase: ReturnType<typeof createClient>,
  visitId: string,
  userId: string | null,
  extraction: ExtractionResult,
): Promise<void> {
  const summaryText = extraction.summary || "Visit recorded. No AI summary available.";
  const { error: visitErr } = await supabase
    .from("visits")
    .update({ summary: summaryText, status: "summarized" })
    .eq("id", visitId);
  if (visitErr) throw new Error(`Failed to update visit: ${visitErr.message}`);

  if (extraction.tasks.length > 0) {
    const { error: tasksErr } = await supabase
      .from("tasks")
      .insert(extraction.tasks.map((t) => ({ visit_id: visitId, title: t.title, priority: t.priority, due_date: t.due_date, user_id: userId })));
    if (tasksErr) throw new Error(`Failed to insert tasks: ${tasksErr.message}`);
  }

  if (extraction.proposal) {
    const priceText = extraction.proposal.price_estimate > 0
      ? `$${extraction.proposal.price_estimate.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
      : null;
    const { error: propErr } = await supabase
      .from("proposals")
      .insert({
        visit_id: visitId,
        title: extraction.proposal.title,
        price_text: priceText,
        price_estimate: extraction.proposal.price_estimate,
        description: extraction.proposal.description,
        user_id: userId,
      });
    if (propErr) throw new Error(`Failed to insert proposal: ${propErr.message}`);
  }
}

const FACT_TYPES = ["decision_maker", "process", "renewal_timing", "upsell_opportunity"] as const;

async function persistCustomerFacts(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
  userId: string,
  visitId: string,
  facts: { type: string; value: string }[],
): Promise<void> {
  for (const fact of facts) {
    if (!FACT_TYPES.includes(fact.type as typeof FACT_TYPES[number])) continue;

    const { data: existing } = await supabase
      .from("customer_facts")
      .select("id, value")
      .eq("customer_id", customerId)
      .eq("type", fact.type)
      .maybeSingle();

    if (!existing) {
      await supabase.from("customer_facts").insert({
        customer_id: customerId,
        user_id: userId,
        type: fact.type,
        value: fact.value,
        source_visit_id: visitId,
        is_manual: false,
        acknowledged: true,
      });
    } else {
      const oldValue = (existing as { value: string }).value;
      const normalizedOld = oldValue.trim().toLowerCase();
      const normalizedNew = fact.value.trim().toLowerCase();
      if (normalizedOld === normalizedNew) continue;

      await supabase
        .from("customer_facts")
        .update({
          value: fact.value,
          previous_value: oldValue,
          source_visit_id: visitId,
          acknowledged: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existing as { id: string }).id);
    }

    if (fact.type === "renewal_timing") {
      const month = parseRenewalMonth(fact.value);
      await upsertRenewalReminder(supabase, customerId, userId, fact.value, month);
    }
  }
}

function parseRenewalMonth(text: string): number | null {
  const months: Record<string, number> = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
    april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
    august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9,
    november: 10, nov: 10, december: 11, dec: 11,
  };
  const lower = text.toLowerCase();
  for (const [name, num] of Object.entries(months)) {
    if (lower.includes(name)) return num;
  }
  // Q1-Q4 mapping
  if (/\bq1\b/.test(lower)) return 2;
  if (/\bq2\b/.test(lower)) return 5;
  if (/\bq3\b/.test(lower)) return 8;
  if (/\bq4\b/.test(lower)) return 11;
  return null;
}

async function upsertRenewalReminder(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
  userId: string,
  factValue: string,
  month: number | null,
): Promise<void> {
  const now = new Date();
  let dueDate: string;
  let detail: string;

  if (month !== null) {
    let year = now.getFullYear();
    if (month <= now.getMonth()) year++;
    dueDate = new Date(year, month, 1).toISOString().slice(0, 10);
    detail = factValue;
  } else {
    // No specific month/quarter could be parsed from the fact text (e.g.
    // "renews annually", "sometime around budget season"). Still create a
    // reminder rather than silently dropping it — a vague reminder that
    // prompts the owner to confirm the real date beats no reminder at all.
    const fallback = new Date(now);
    fallback.setDate(fallback.getDate() + 180);
    dueDate = fallback.toISOString().slice(0, 10);
    detail = `${factValue} (exact timing unclear — confirm with customer)`;
  }

  const { data: existing } = await supabase
    .from("reminders")
    .select("id")
    .eq("customer_id", customerId)
    .eq("title", "Contract renewal")
    .maybeSingle();

  if (existing) {
    await supabase
      .from("reminders")
      .update({ detail, due_date: dueDate, done: false })
      .eq("id", (existing as { id: string }).id);
  } else {
    await supabase.from("reminders").insert({
      customer_id: customerId,
      user_id: userId,
      title: "Contract renewal",
      detail,
      urgency: "high",
      done: false,
      due_date: dueDate,
    });
  }
}
