import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [profilesRes, visitsRes, tasksRes, proposalsRes, subsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, created_at"),
      supabase.from("visits").select("id, user_id, started_at"),
      supabase.from("tasks").select("id, user_id, status"),
      supabase.from("proposals").select("id, user_id, price_estimate, status"),
      supabase.from("subscriptions").select("user_id, status, monthly_amount_cents"),
    ]);

    const profiles = profilesRes.data ?? [];
    const visits = visitsRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const proposals = proposalsRes.data ?? [];
    const subs = subsRes.data ?? [];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffIso = thirtyDaysAgo.toISOString();

    const activeUserIds = new Set<string>();
    (visits as { user_id: string; started_at: string }[]).forEach((v) => {
      if (v.started_at >= cutoffIso) activeUserIds.add(v.user_id);
    });

    const totalProposedValue = (proposals as { price_estimate: number | null }[])
      .reduce((sum, p) => sum + (p.price_estimate ?? 0), 0);

    const activeSubs = (subs as { status: string; monthly_amount_cents: number }[])
      .filter((s) => s.status === "active");
    const mrr = activeSubs.reduce((sum, s) => sum + s.monthly_amount_cents, 0);

    const stats = {
      total_users: profiles.length,
      active_users_30d: activeUserIds.size,
      total_visits: visits.length,
      total_tasks: tasks.length,
      open_tasks: (tasks as { status: string }[]).filter((t) => t.status === "open").length,
      completed_tasks: (tasks as { status: string }[]).filter((t) => t.status === "done").length,
      total_proposals: proposals.length,
      total_proposed_value: totalProposedValue,
      active_subscriptions: activeSubs.length,
      total_subscriptions: subs.length,
      monthly_recurring_revenue_cents: mrr,
    };

    return new Response(JSON.stringify({ stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
