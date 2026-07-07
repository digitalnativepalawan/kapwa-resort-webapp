import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  try {
    const sb = getSupabaseAdmin();

    const { data: tasks } = await sb
      .from("housekeeping_orders")
      .select("id, unit_name, status, accepted_by_name, cleaning_by_name, cleaning_notes, damage_notes")
      .not("status", "in", "(completed,cancelled)");

    const statusMap: Record<string, string> = {
      pending: "dirty",
      assigned: "dirty",
      accepted: "cleaning",
      in_progress: "cleaning",
      cleaning: "cleaning",
      inspection: "ready",
      ready: "ready",
    };

    const result = {
      tasks: (tasks || []).map((t: any) => {
        const staff = t.cleaning_by_name || t.accepted_by_name || "";
        const notes = [t.cleaning_notes, t.damage_notes].filter(Boolean).join("; ");
        return {
          room: t.unit_name || "—",
          status: statusMap[t.status] || t.status,
          assigned_staff: staff,
          notes,
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
