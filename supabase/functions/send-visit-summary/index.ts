import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RESEND_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "summaries@getserviceshadow.com";

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

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "Resend API key not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const request = await req.json();
    const { visit_id, recipient = "owner", preview = false, subject: subjectOverride, body_text: bodyTextOverride, body_html: bodyHtmlOverride } = request;
    if (!visit_id || typeof visit_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid visit_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the caller's JWT for all reads so RLS enforces ownership.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    // Verify the requesting user owns this visit (RLS returns null otherwise).
    if (recipient !== "owner" && recipient !== "customer") {
      return new Response(JSON.stringify({ error: "Invalid recipient" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: visit, error: visitErr } = await supabase
      .from("visits")
      .select(`
        id, user_id, summary, started_at,
        customer:customers ( name, contact_email ),
        property:properties ( name )
      `)
      .eq("id", visit_id)
      .maybeSingle();

    if (visitErr) throw new Error(`Failed to load visit: ${visitErr.message}`);
    if (!visit) {
      return new Response(JSON.stringify({ error: "Visit not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = visit.user_id as string;

    // Fetch the user's profile for summary_email.
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("summary_email, business_name, full_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) throw new Error(`Failed to load profile: ${profileErr.message}`);

    const customer = (visit as unknown as { customer?: { name?: string; contact_email?: string | null } | null }).customer;
    const customerEmail = customer?.contact_email?.trim();
    const summaryEmail = profile?.summary_email?.trim();
    if (recipient === "customer" && !customerEmail) {
      return new Response(JSON.stringify({ error: "NO_CONTACT_EMAIL", code: "NO_CONTACT_EMAIL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (recipient === "owner" && !summaryEmail) {
      return new Response(JSON.stringify({ error: "NO_SUMMARY_EMAIL", code: "NO_SUMMARY_EMAIL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch proposal and photos in parallel. Tasks are internal-facing and excluded from customer emails.
    const [proposalRes, photosRes] = await Promise.all([
      supabase.from("proposals").select("title, price_text, description").eq("visit_id", visit_id).order("created_at").limit(1).maybeSingle(),
      supabase.from("photos").select("id, storage_path, caption").eq("visit_id", visit_id).order("created_at"),
    ]);

    if (proposalRes.error) throw new Error(`Failed to load proposal: ${proposalRes.error.message}`);
    if (photosRes.error) throw new Error(`Failed to load photos: ${photosRes.error.message}`);

    const proposal = proposalRes.data as { title: string | null; price_text: string | null; description: string | null } | null;
    const photos = (photosRes.data ?? []) as { id: string; storage_path: string | null; caption: string | null }[];

    // Generate signed URLs for photos that have a storage path.
    const photoLinks: { caption: string | null; url: string }[] = [];
    for (const p of photos) {
      if (p.storage_path) {
        const { data: urlData } = await supabase
          .storage
          .from("visit-photos")
          .createSignedUrl(p.storage_path, 60 * 60 * 24 * 7);
        if (urlData?.signedUrl) {
          photoLinks.push({ caption: p.caption ?? null, url: urlData.signedUrl });
        }
      }
    }

    const customerName = customer?.name ?? "Customer";
    const propertyName = (visit as unknown as { property?: { name?: string } | null })?.property?.name;
    const visitDate = new Date(visit.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const businessName = profile?.business_name?.trim() || profile?.full_name?.trim() || "ServiceShadow";
    const customerBusinessName = businessName;

    const generatedSubject = recipient === "customer"
      ? `Visit summary from ${customerBusinessName} — ${propertyName ?? customerName}`
      : `${customerName} — visit summary, ${visitDate}`;

    // Build plain-text body.
    const lines: string[] = [];
    lines.push(`${customerName}${propertyName ? ` · ${propertyName}` : ""}`);
    lines.push(visitDate);
    lines.push("");
    lines.push(visit.summary ?? "No summary was generated for this visit.");
    lines.push("");

    if (proposal && proposal.title) {
      lines.push("PROPOSAL");
      lines.push(proposal.title);
      if (proposal.price_text) lines.push(`Price: ${proposal.price_text}`);
      if (proposal.description) {
        proposal.description.split("\n").forEach((line) => {
          const trimmed = line.trim();
          if (trimmed) lines.push(`  • ${trimmed}`);
        });
      }
      lines.push("");
    }

    if (photoLinks.length > 0) {
      lines.push("PHOTOS");
      photoLinks.forEach((p, i) => {
        const label = p.caption ?? `View photo ${i + 1}`;
        lines.push(`${label}: ${p.url}`);
      });
      lines.push("");
    }

    lines.push(`Sent from ${businessName} via ServiceShadow`);

    const plainText = lines.join("\n");

    // Build HTML body.
    const htmlParts: string[] = [];
    htmlParts.push(`<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 24px;">`);
    htmlParts.push(`<h2 style="margin: 0 0 4px; font-size: 18px;">${escapeHtml(customerName)}${propertyName ? ` · ${escapeHtml(propertyName)}` : ""}</h2>`);
    htmlParts.push(`<p style="margin: 0 0 16px; color: #666; font-size: 13px;">${escapeHtml(visitDate)}</p>`);
    htmlParts.push(`<p style="font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(visit.summary ?? "No summary was generated for this visit.")}</p>`);

    if (proposal && proposal.title) {
      htmlParts.push(`<h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin: 24px 0 8px;">Proposal</h3>`);
      htmlParts.push(`<div style="background: #f5f5f5; border-radius: 8px; padding: 16px;">`);
      htmlParts.push(`<div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">${escapeHtml(proposal.title)}</div>`);
      if (proposal.price_text) {
        htmlParts.push(`<div style="font-size: 18px; font-weight: 700; color: #c47a1a; margin-bottom: 12px;">${escapeHtml(proposal.price_text)}</div>`);
      }
      if (proposal.description) {
        htmlParts.push(`<ul style="padding-left: 20px; margin: 0; font-size: 13px; line-height: 1.6;">`);
        proposal.description.split("\n").forEach((line) => {
          const trimmed = line.trim();
          if (trimmed) htmlParts.push(`<li>${escapeHtml(trimmed)}</li>`);
        });
        htmlParts.push(`</ul>`);
      }
      htmlParts.push(`</div>`);
    }

    if (photoLinks.length > 0) {
      htmlParts.push(`<h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin: 24px 0 8px;">Photos</h3>`);
      htmlParts.push(`<ul style="padding-left: 20px; margin: 0; font-size: 14px; line-height: 1.8;">`);
      photoLinks.forEach((p, i) => {
        const label = p.caption ?? `View photo ${i + 1}`;
        htmlParts.push(`<li><a href="${escapeHtml(p.url)}" style="color: #c47a1a;">${escapeHtml(label)}</a></li>`);
      });
      htmlParts.push(`</ul>`);
    }

    htmlParts.push(`<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">`);
    htmlParts.push(`<p style="font-size: 12px; color: #999; margin: 0;">Sent from ${escapeHtml(businessName)} via ServiceShadow</p>`);
    htmlParts.push(`</div>`);

    const html = htmlParts.join("");
    const subject = typeof subjectOverride === "string" && subjectOverride.trim() ? subjectOverride : generatedSubject;
    const plainTextToSend = typeof bodyTextOverride === "string" ? bodyTextOverride : plainText;
    const htmlToSend = typeof bodyHtmlOverride === "string" ? bodyHtmlOverride : html;

    if (preview === true) {
      return new Response(JSON.stringify({ subject: generatedSubject, plainText, html }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUserResult = recipient === "customer" ? await supabase.auth.getUser(token) : null;
    const replyTo = authUserResult?.data.user?.email ?? "no-reply@getserviceshadow.com";
    const recipientEmail = recipient === "customer" ? customerEmail! : summaryEmail!;
    const fromName = recipient === "customer" ? `${customerBusinessName} via ServiceShadow` : "ServiceShadow";

    // Send via Resend.
    const sendRes = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${FROM_ADDRESS}>`,
        to: [recipientEmail],
        ...(recipient === "customer" ? { reply_to: replyTo } : {}),
        subject,
        text: plainTextToSend,
        html: htmlToSend,
      }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`Resend API error (${sendRes.status}): ${errText}`);
    }

    // Log the export. Use service role to insert (bypasses RLS) with explicit user_id.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: logErr } = await adminClient.from("export_log").insert({
      user_id: userId,
      visit_id,
      artifact_type: proposal ? "proposal" : "visit_summary",
      export_method: recipient === "customer" ? "direct_email_customer" : "email",
      destination: recipientEmail,
    });

    if (logErr) {
      console.error(`Failed to log export: ${logErr.message}`);
    }

    return new Response(JSON.stringify({ success: true, sent_to: recipientEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Failed to send summary" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
