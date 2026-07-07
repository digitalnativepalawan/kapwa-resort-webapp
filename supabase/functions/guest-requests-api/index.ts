import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Fail-closed authorization: this endpoint runs with the service-role key and
  // returns guest PII, so it must never be publicly callable. Callers must
  // present the shared internal secret.
  const secret = Deno.env.get("INTERNAL_FN_SECRET");
  if (!secret || req.headers.get("x-internal-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const sb = getSupabaseAdmin();

    const { data: requests } = await sb
      .from("guest_requests")
      .select("id, guest_name, request_type, details, status, confirmed_by, created_at, room_id, units(unit_name)")
      .neq("status", "completed");

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const result = {
      requests: (requests || []).map((r: any) => {
        const isOldPending = r.status === "pending" && r.created_at < twoHoursAgo;
        return {
          room: r.units?.unit_name || r.guest_name || "—",
          request: [r.request_type, r.details].filter(Boolean).join(": "),
          priority: isOldPending ? "high" : "medium",
          status: r.status || "pending",
          assigned_staff: r.confirmed_by || "",
        };
      }),
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
