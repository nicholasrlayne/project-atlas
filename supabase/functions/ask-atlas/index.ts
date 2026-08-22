import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

interface CustomerContext {
  customer_id: string;
  customer_name: string;
  properties: { id: string; name: string | null; address: string | null }[];
  visits: {
    id: string;
    date: string;
    summary: string | null;
    service_type: string | null;
    property_name: string | null;
  }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    due_date: string | null;
    visit_id: string;
  }[];
  proposals: {
    id: string;
    title: string | null;
    price_text: string | null;
    description: string | null;
    status: string;
    visit_id: string;
  }[];
  facts: {
    id: string;
    type: string;
    value: string;
    source_visit_id: string | null;
  }[];
  photo_captions: string[];
}

interface Citation {
  customer_id: string;
  artifact_type: "visit" | "task" | "proposal" | "fact";
  artifact_id: string;
  label: string;
}

interface AskResult {
  answer: string;
  citations: Citation[];
}

Deno.serve(async (req: Request) => {
  console.log(`ask-atlas: invoked, method=${req.method}`);
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
    const body = await req.json();
    const question = body.question;
    const contexts = body.contexts;

    if (!question || typeof question !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid question" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!Array.isArray(contexts) || contexts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing contexts array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`ask-atlas: question length=${question.length}, contexts=${contexts.length}`);

    const result = await generateAnswer(anthropicKey, question, contexts);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(`ask-atlas error: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Answer generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function buildContextBlock(contexts: CustomerContext[]): string {
  return contexts.map((ctx) => {
    const props = ctx.properties.length > 0
      ? ctx.properties.map((p) => `  - ${p.name ?? "Unnamed"} (${p.address ?? "no address"})`).join("\n")
      : "  (no properties)";

    const visits = ctx.visits.length > 0
      ? ctx.visits.map((v) => {
          const date = v.date ? v.date.slice(0, 10) : "unknown date";
          const parts = [`Visit ${v.id} (${date})`];
          if (v.service_type) parts.push(`type: ${v.service_type}`);
          if (v.property_name) parts.push(`property: ${v.property_name}`);
          if (v.summary) parts.push(`summary: ${v.summary}`);
          return `  - ${parts.join(", ")}`;
        }).join("\n")
      : "  (no visits)";

    const tasks = ctx.tasks.length > 0
      ? ctx.tasks.map((t) => {
          const parts = [`Task ${t.id}: ${t.title}`];
          parts.push(`status: ${t.status}`);
          if (t.due_date) parts.push(`due: ${t.due_date}`);
          return `  - ${parts.join(", ")}`;
        }).join("\n")
      : "  (no tasks)";

    const proposals = ctx.proposals.length > 0
      ? ctx.proposals.map((p) => {
          const parts = [`Proposal ${p.id}: ${p.title ?? "Untitled"}`];
          if (p.price_text) parts.push(`price: ${p.price_text}`);
          parts.push(`status: ${p.status}`);
          if (p.description) parts.push(`scope: ${p.description.replace(/\n/g, "; ")}`);
          return `  - ${parts.join(", ")}`;
        }).join("\n")
      : "  (no proposals)";

    const facts = ctx.facts.length > 0
      ? ctx.facts.map((f) => `  - ${f.type}: ${f.value}`).join("\n")
      : "  (no facts)";

    const captions = ctx.photo_captions.length > 0
      ? ctx.photo_captions.map((c) => `  - ${c}`).join("\n")
      : "  (no photo captions)";

    return `CUSTOMER: ${ctx.customer_name} (ID: ${ctx.customer_id})\n` +
      `Properties:\n${props}\n` +
      `Visits:\n${visits}\n` +
      `Tasks:\n${tasks}\n` +
      `Proposals:\n${proposals}\n` +
      `Key facts:\n${facts}\n` +
      `Photo captions:\n${captions}`;
  }).join("\n\n---\n\n");
}

async function generateAnswer(
  apiKey: string,
  question: string,
  contexts: CustomerContext[],
): Promise<AskResult> {
  const contextText = buildContextBlock(contexts);

  const systemPrompt =
    "You are Atlas, an assistant for field-service businesses. " +
    "Answer the user's question using ONLY the provided customer context. " +
    "Do not use outside business advice, general knowledge, or assumptions not grounded in the customer's actual history.\n\n" +
    "Two answer modes are supported:\n" +
    "- Recall: direct factual lookup from the context (e.g. 'when was our last visit', 'what is the decision maker's name').\n" +
    "- Recommendation: a judgment call that synthesizes a pattern across the provided history (e.g. 'this customer's lint buildup rate suggests a quarterly upsell'). " +
    "Only make a recommendation when the context actually supports it. If there is not enough history to support a recommendation, say so rather than speculating.\n\n" +
    "EVERY factual claim or recommendation in your answer MUST include a citation to the specific visit, task, proposal, or fact it is grounded in. " +
    "If a claim draws on multiple artifacts, cite each one separately. " +
    "If you cannot find a grounded answer in the context, say so explicitly.\n\n" +
    "Use the answer_atlas tool to return your answer. The citations array must contain one entry per artifact referenced. " +
    "Each citation needs: customer_id (from the context), artifact_type ('visit', 'task', 'proposal', or 'fact'), " +
    "artifact_id (the actual ID from the context), and a short human-readable label (e.g. 'Jul 27 visit', 'Quarterly proposal', 'Decision maker fact').\n\n" +
    "Formatting: the answer field supports light markdown — use **bold** for names, dates, and key figures, " +
    "and a '- ' bulleted list when the answer covers multiple items (e.g. multiple customers or tasks). " +
    "Keep individual answers concise; don't force structure onto a simple one-fact answer.";

  const tools = [
    {
      name: "answer_atlas",
      description: "Answer a question about customer history using provided context.",
      input_schema: {
        type: "object" as const,
        properties: {
          answer: {
            type: "string",
            description: "The answer to the user's question, grounded in the provided context.",
          },
          citations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                customer_id: { type: "string", description: "The customer ID from the context." },
                artifact_type: { type: "string", enum: ["visit", "task", "proposal", "fact"] },
                artifact_id: { type: "string", description: "The actual artifact ID from the context." },
                label: { type: "string", description: "Short human-readable label for display as a chip." },
              },
              required: ["customer_id", "artifact_type", "artifact_id", "label"],
            },
          },
        },
        required: ["answer", "citations"],
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
          content: `Here is the context for the customer(s):\n\n${contextText}\n\nQuestion: ${question}`,
        },
      ],
      tools,
      tool_choice: { type: "tool", name: "answer_atlas" },
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

  const input = toolUseBlock.input as { answer: string; citations: Citation[] };

  const validArtifactIds = new Set<string>();
  for (const ctx of contexts) {
    ctx.visits.forEach((v) => validArtifactIds.add(v.id));
    ctx.tasks.forEach((t) => validArtifactIds.add(t.id));
    ctx.proposals.forEach((p) => validArtifactIds.add(p.id));
    ctx.facts.forEach((f) => validArtifactIds.add(f.id));
  }

  const citations: Citation[] = (Array.isArray(input.citations) ? input.citations : [])
    .filter((c) => c && typeof c.customer_id === "string" && typeof c.artifact_id === "string")
    .filter((c) => validArtifactIds.has(c.artifact_id))
    .filter((c) => ["visit", "task", "proposal", "fact"].includes(c.artifact_type))
    .map((c) => ({
      customer_id: c.customer_id,
      artifact_type: c.artifact_type as Citation["artifact_type"],
      artifact_id: c.artifact_id,
      label: typeof c.label === "string" ? c.label : c.artifact_id,
    }));

  return {
    answer: typeof input.answer === "string" ? input.answer : "",
    citations,
  };
}
