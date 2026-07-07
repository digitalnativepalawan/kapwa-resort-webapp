import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, service: "integration-webhook", ts: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Signature verification placeholder
    const signature = req.headers.get("x-webhook-signature");
    if (!signature) {
      console.warn("[integration-webhook] No signature header present — accepting in dev mode");
    }

    const payload = await req.json();

    // Validate required fields
    const eventType = payload.event_type || payload.event || "unknown";
    const source = payload.source || "unknown";
    const eventId =
      payload.event_id ||
      payload.id ||
      `${source}-${eventType}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.from("webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      source,
      payload,
      status: "pending",
    });

    if (error) {
      // Duplicate event_id — idempotent, return 202 anyway
      if (error.code === "23505") {
        return new Response(
          JSON.stringify({ ok: true, message: "Duplicate event, already queued" }),
          { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("[integration-webhook] Insert error:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, event_id: eventId, status: "queued" }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[integration-webhook] Unexpected error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
