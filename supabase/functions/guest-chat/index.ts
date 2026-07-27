// TALA — guest concierge chat.
//
// This is the *guest* agent. It is deliberately the only agent reachable from
// the public Guest Portal, and it must never be mounted in the back office:
// it carries the guest persona, guest FAQ memory, and no operational context.
// The back-office counterpart is `resort-operator`.
//
// Guest context (name, room, stay dates) is resolved **server-side** from the
// booking id rather than trusted from the request body, so a guest cannot
// rename themselves into another room by editing sessionStorage. The booking id
// itself still comes from the browser — see docs/security/guest-session.md for
// the remaining gap and the signed-session plan that closes it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callModel, resolveModelConfig } from "../_shared/modelGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const GUEST_SYSTEM_PROMPT = `# KAPWA Guest Concierge

You are the guest concierge for BAIA Beachfront Boutique Lodge in San Vicente, Palawan.

## Primary rule
Never invent facts. If a fact is not in the Approved Q&A below or in the confirmed property information, say: "I don't have that confirmed. Please ask the BAIA staff and I can help pass the request along."

## Response style
- Warm, direct, and concise. Taglish "po" is welcome.
- 1 to 3 short sentences unless the guest asks for detail.
- Do not claim a request, booking, order, or reservation is confirmed unless the system confirms it.

## Confirmed property information
- BAIA Beachfront Boutique Lodge, Sitio Panindigan, Poblacion, San Vicente, Palawan.
- Free Wi-Fi and free private parking on site.
- San Vicente Airport is approximately 4.4 km away.

## Safety
For medical emergencies, fire, dangerous weather, water danger, security incidents, lost passports, or police matters, tell the guest to contact on-site staff immediately and local emergency services when appropriate.`;

interface FaqEntry {
  question?: string;
  answer?: string;
  keywords?: string;
  active?: boolean;
}

interface GuestContext {
  guest_name: string;
  room_name: string;
  check_in: string | null;
  check_out: string | null;
}

/**
 * Resolve the guest's own stay from their booking id, using the service role.
 * Returns null when the booking is missing or no longer active, so an expired
 * or invented booking id simply yields an anonymous concierge session rather
 * than leaking another guest's stay.
 */
async function loadGuestContext(supabase: any, bookingId: unknown): Promise<GuestContext | null> {
  if (typeof bookingId !== "string" || !bookingId.trim()) return null;
  try {
    const { data, error } = await supabase
      .from("resort_ops_bookings")
      .select("id, status, check_in, check_out, resort_ops_guests(full_name), units(unit_name)")
      .eq("id", bookingId.trim())
      .maybeSingle();
    if (error || !data) return null;
    if (["cancelled", "checked_out", "no_show"].includes(String(data.status))) return null;

    return {
      guest_name: data.resort_ops_guests?.full_name ?? "",
      room_name: data.units?.unit_name ?? "",
      check_in: data.check_in ?? null,
      check_out: data.check_out ?? null,
    };
  } catch (error) {
    console.error("[guest-chat] guest context lookup failed", error);
    return null;
  }
}

function buildSystemPrompt(memory: FaqEntry[] | undefined, guest: GuestContext | null): string {
  const parts: string[] = [GUEST_SYSTEM_PROMPT];
  if (guest) {
    const stay = [
      guest.guest_name && `Guest name: ${guest.guest_name}`,
      guest.room_name && `Room: ${guest.room_name}`,
      guest.check_in && `Check-in: ${guest.check_in}`,
      guest.check_out && `Check-out: ${guest.check_out}`,
    ].filter(Boolean).join("\n");
    if (stay) {
      parts.push(
        `## This guest's stay (verified from the booking system)\n${stay}\n\nUse these details when the guest asks about their own room or dates. You have no information about any other guest, booking, room, staff member, or resort operations — if asked, say you can only help with this stay.`,
      );
    }
  }
  if (Array.isArray(memory) && memory.length) {
    const approved = memory
      .filter((e) => e && e.active !== false && typeof e.question === "string" && typeof e.answer === "string")
      .map((e) => {
        const kw = typeof e.keywords === "string" && e.keywords.trim() ? ` (keywords: ${e.keywords.trim()})` : "";
        return `Q: ${e.question!.trim()}${kw}\nA: ${e.answer!.trim()}`;
      })
      .join("\n\n");
    if (approved) {
      parts.push(
        `## Approved Q&A (staff-verified)\nIf the guest's question matches one of these entries by meaning or keywords, answer using the corresponding approved answer verbatim. Otherwise follow the rules above.\n\n${approved}`,
      );
    }
  }
  return parts.join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const memory = body?.memory as FaqEntry[] | undefined;
    const history = Array.isArray(body?.history) ? body.history : [];
    if (!message) return jsonRes({ error: "message is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const guest = await loadGuestContext(supabase, body?.booking_id);

    const { data: settings } = await supabase
      .from("settings")
      .select("bot_enabled")
      .limit(1)
      .maybeSingle();

    if (settings?.bot_enabled === false) {
      return jsonRes({ error: "Guest concierge is disabled." }, 503);
    }

    // One shared resolver for every agent — see ../_shared/modelGateway.ts.
    const config = await resolveModelConfig(supabase, "guest", { maxTokens: 500 });
    if (config.provider === "openrouter" && !config.apiKey) {
      return jsonRes({ error: "OpenRouter API key not configured in Admin → Agent Settings." }, 400);
    }

    const messages = [
      { role: "system", content: buildSystemPrompt(memory, guest) },
      ...history
        .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
        .slice(-10)
        .map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    let reply: string;
    try {
      reply = await callModel(config, messages);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[guest-chat] model error", detail);
      return jsonRes({ error: detail.slice(0, 300) }, 502);
    }

    return jsonRes({ reply, provider: config.provider, model: config.model, model_source: config.source });
  } catch (error) {
    console.error("[guest-chat] error", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
