import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const respond = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Admin authorization is signature-verified in ../_shared/auth.ts. This used to
// trust an unverified base64 decode of the JWT payload.

async function invokeInternal(supabase: any, name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { "x-internal-secret": Deno.env.get("INTERNAL_FN_SECRET") ?? "" },
  });
  if (error) throw new Error(`${name}: ${error.message}`);
  if (data?.ok === false) throw new Error(`${name}: ${data.error || "failed"}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  try {
    const body = await req.json().catch(() => ({}));
    const type = ["morning", "evening", "daily"].includes(body.type) ? body.type : "morning";
    const question = typeof body.question === "string" ? body.question : "What needs management attention now?";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const operations = await invokeInternal(supabase, "ops-coordinator", {
      type,
      question,
      delivery: "preview",
    });

    const [conciergeRun, reservationsRun, operatorRun] = await Promise.allSettled([
      invokeInternal(supabase, "concierge-ai", {}),
      invokeInternal(supabase, "reservations-ai", {}),
      invokeInternal(supabase, "resort-operator", { action: "cycle" }),
    ]);

    const concierge = conciergeRun.status === "fulfilled"
      ? conciergeRun.value
      : { ok: false, error: conciergeRun.reason instanceof Error ? conciergeRun.reason.message : String(conciergeRun.reason) };
    const reservations = reservationsRun.status === "fulfilled"
      ? reservationsRun.value
      : { ok: false, error: reservationsRun.reason instanceof Error ? reservationsRun.reason.message : String(reservationsRun.reason) };
    const operator = operatorRun.status === "fulfilled"
      ? operatorRun.value
      : { ok: false, error: operatorRun.reason instanceof Error ? operatorRun.reason.message : String(operatorRun.reason) };

    return respond({
      ok: true,
      operations,
      concierge,
      reservations,
      operator,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[resort-agent-loop]", error);
    return respond({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
