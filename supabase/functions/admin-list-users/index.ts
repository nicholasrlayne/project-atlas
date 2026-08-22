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

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("user_id, full_name, business_name, summary_email, created_at, is_admin, stripe_customer_id")
      .order("created_at", { ascending: false });

    if (profErr) throw profErr;

    const { data: subscriptions } = await supabase
      .from("subscriptions")
      .select("user_id, plan_name, status, monthly_amount_cents, current_period_end");

    const subMap = new Map<string, typeof subscriptions>();
    (subscriptions ?? []).forEach((s) => {
      const arr = subMap.get(s.user_id as string) ?? [];
      arr.push(s);
      subMap.set(s.user_id as string, arr);
    });

    const userIds = (profiles ?? []).map((p) => p.user_id);
    const { data: authUsers } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    const emailMap = new Map<string, { email: string; last_sign_in_at: string | null }>();
    (authUsers?.users ?? []).forEach((u) => {
      emailMap.set(u.id, { email: u.email ?? "", last_sign_in_at: u.last_sign_in_at ?? null });
    });

    const visitCounts = new Map<string, number>();
    if (userIds.length > 0) {
      const { data: visits } = await supabase
        .from("visits")
        .select("user_id");
      (visits ?? []).forEach((v) => {
        const uid = v.user_id as string;
        visitCounts.set(uid, (visitCounts.get(uid) ?? 0) + 1);
      });
    }

    const users = (profiles ?? []).map((p) => {
      const auth = emailMap.get(p.user_id as string);
      const subs = subMap.get(p.user_id as string) ?? [];
      return {
        user_id: p.user_id,
        email: auth?.email ?? "",
        full_name: p.full_name,
        business_name: p.business_name,
        summary_email: p.summary_email,
        created_at: p.created_at,
        is_admin: p.is_admin,
        last_sign_in_at: auth?.last_sign_in_at ?? null,
        visit_count: visitCounts.get(p.user_id as string) ?? 0,
        stripe_customer_id: p.stripe_customer_id,
        subscription: subs.length > 0 ? subs[0] : null,
      };
    });

    return new Response(JSON.stringify({ users }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
