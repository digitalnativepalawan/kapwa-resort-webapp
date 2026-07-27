import { requireStaffOrInternal } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-internal-secret",
};

const CHAT_IDS: Record<string, number> = {
  kitchen: -1003894576626,
  bar: -5135701418,
  tours: -5211088675,
  housekeeping: -5127212920,
  reception: -4812951231,
  managers: -5233537962,
  waitstaff: -5220831375,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // This endpoint writes into the resort's staff Telegram groups. It had no
  // handler-level guard at all, relying entirely on the gateway — which cannot
  // check an opaque publishable key. Staff JWT or the internal secret, both
  // verified. Callers: the back office (staff token) and ops-coordinator /
  // concierge-ai (internal secret).
  const auth = await requireStaffOrInternal(req);
  if (!auth.ok) return auth.response;

  try {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { group, message, reply_markup, disable_notification = false } = await req.json();
    if (!group || !message) {
      return new Response(JSON.stringify({ error: "group and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const groups = String(group).split(",").map((value) => value.trim()).filter(Boolean);
    const results: Record<string, unknown>[] = [];

    for (const groupKey of groups) {
      const chatId = CHAT_IDS[groupKey];
      if (!chatId) {
        results.push({ group: groupKey, ok: false, error: "unknown group" });
        continue;
      }

      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_notification,
          ...(reply_markup ? { reply_markup } : {}),
        }),
      });
      const data = await response.json();
      results.push({
        group: groupKey,
        chat_id: chatId,
        ok: Boolean(data.ok),
        message_id: data.result?.message_id ?? null,
        error: data.ok ? null : data.description ?? "Telegram send failed",
      });
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
