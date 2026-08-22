import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEEPGRAM_URL =
  "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true";

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

  const apiKey = Deno.env.get("DEEPGRAM_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Deepgram API key not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let audioBytes: ArrayBuffer;
    let mimeType: string;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      if (!body.audio || typeof body.audio !== "string") {
        return new Response(
          JSON.stringify({ error: "Missing base64 'audio' field in JSON body" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      audioBytes = decodeBase64(body.audio);
      mimeType = body.mimetype ?? "audio/webm";
    } else {
      audioBytes = await req.arrayBuffer();
      mimeType = contentType || "audio/webm";
    }

    if (audioBytes.byteLength === 0) {
      return new Response(
        JSON.stringify({ error: "Empty audio payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dgResponse = await fetch(DEEPGRAM_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": mimeType,
      },
      body: audioBytes,
    });

    const dgStatus = dgResponse.status;
    const dgText = await dgResponse.text();
    let dgData: unknown = null;
    try {
      dgData = JSON.parse(dgText);
    } catch {
      dgData = dgText;
    }

    if (!dgResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Deepgram error (${dgStatus}): ${dgText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = typeof dgData === "object" && dgData !== null
      ? (dgData as Record<string, unknown>)
      : {};

    const transcript: string =
      (data?.results as Record<string, unknown> | undefined)?.channels
        ?.[0]?.alternatives?.[0]?.transcript ?? "";
    const confidence: number | null =
      (data?.results as Record<string, unknown> | undefined)?.channels
        ?.[0]?.alternatives?.[0]?.confidence ?? null;

    return new Response(
      JSON.stringify({ transcript: transcript.trim(), confidence }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Transcription failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function decodeBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
