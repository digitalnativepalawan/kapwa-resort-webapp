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
import { detectIntent, executeTool } from "../_shared/guest-tools.ts";

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

const GUEST_SYSTEM_PROMPT = `# KAPWA Guest Concierge — TALA

You are TALA, the AI guest concierge for BAIA Beachfront Boutique Lodge in San Vicente, Palawan. You run the resort from the guest's perspective — bookings, orders, tours, requests, bills. You are the single point of contact.

## Primary rule
Never invent facts. If a fact is not in the Approved Q&A below, in the confirmed property information, or in the live system data provided, say: "I don't have that confirmed. Please ask the BAIA staff and I can help pass the request along."

## What you can do (full resort operations)
You are connected to the live resort system. When system data confirms success, confirm it clearly.

### Bookings & Billing
- **Extend stay**: Add nights. Confirm new checkout date and charge added to bill.
- **Check bill**: Show room charges, food/drink orders, extras, total owed, and payment status.
- **Room status**: Check if room is ready, housekeeping state, when it will be clean.

### Orders (Food & Drink)
- **Order food**: Send orders to kitchen/bar. Confirm items, total (incl. 10% SC), and that it's charged to room.
- **Check order status**: Is the food ready? How long has it been? Kitchen/bar preparation status.

### Tours & Activities
- **Book tours**: Reserve tours (Honda Bay, island hopping, etc.). Confirm tour name, date, pax, and price. Status is "pending" until staff confirms.
- **Check tour status**: Is the tour confirmed? Captain/guide confirmation status.

### Requests & Services
- **Request transport**: Airport transfers, tricycle, van rides. Creates a request for staff.
- **Request rental**: Motorcycles, bikes, kayaks, snorkel gear. Creates a request for staff.
- **General requests**: Towels, pillows, maintenance, housekeeping.
- **Check request status**: See if staff has responded to your request.

### Information
- **Availability**: Check available rooms for dates.
- **Weather**: Current conditions in San Vicente.
- **Tours & activities**: What's available, prices, schedules.
- **Housekeeping**: Room cleaning status.

When a system action succeeds, confirm it clearly with all details (confirmation numbers, amounts, dates). When it fails, explain why and suggest alternatives.

## Response style
- Warm, direct, and concise. Taglish "po" is welcome.
- 1 to 3 short sentences unless the guest asks for detail.
- Do not claim a request, booking, order, or reservation is confirmed unless the system confirms it.
- When live data is provided, use it directly. Never make up data that isn't provided.
- Be proactive — if a guest asks about their room, check status. If they ask about food, check if it's ready.

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
  booking_id: string;
  room_id: string;
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
      .select("id, status, check_in, check_out, room_id, resort_ops_guests(full_name), units(unit_name)")
      .eq("id", bookingId.trim())
      .maybeSingle();
    if (error || !data) return null;
    if (["cancelled", "checked_out", "no_show"].includes(String(data.status))) return null;

    return {
      guest_name: data.resort_ops_guests?.full_name ?? "",
      room_name: data.units?.unit_name ?? "",
      check_in: data.check_in ?? null,
      check_out: data.check_out ?? null,
      booking_id: data.id,
      room_id: data.room_id ?? "",
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

    // ── Tool detection & execution ──────────────────────────────────────────
    // Before hitting the LLM, check if the guest's message triggers a resort tool.
    // This grounds the LLM in real data instead of letting it guess.
    let toolContext = "";
    const detected = detectIntent(message);
    if (detected) {
      try {
        const toolResult = await executeTool(supabase, detected, guest ? {
          booking_id: guest.booking_id,
          room_id: guest.room_id,
          guest_name: guest.guest_name,
          room_name: guest.room_name,
        } : undefined);

        if (toolResult.ok && toolResult.data !== undefined && toolResult.data !== null) {
          const dataStr = typeof toolResult.data === "string" ? toolResult.data : JSON.stringify(toolResult.data, null, 2);
          const isWriteTool = ["extend_booking", "book_tour", "order_food", "request_transport", "request_rental", "create_guest_request"].includes(detected.tool);
          if (isWriteTool) {
            toolContext = `\n\n## Action completed (${detected.tool})\n${dataStr}\n\nThis action was successfully completed. Confirm it to the guest warmly. Include all relevant details from the data (confirmation number, amounts, dates, etc.). If the action requires staff follow-up, mention that.`;
          } else {
            toolContext = `\n\n## Live system data (${detected.tool})\n${dataStr}\n\nUse this real-time data to answer the guest. If the data shows empty results, say so honestly.`;
          }
        } else if (!toolResult.ok && toolResult.error) {
          console.error(`[guest-chat] tool ${detected.tool} failed:`, toolResult.error);
          toolContext = `\n\n## Action failed (${detected.tool})\nError: ${toolResult.error}\n\nExplain the issue to the guest and suggest what they can do next.`;
        }
      } catch (toolErr) {
        console.error(`[guest-chat] tool ${detected.tool} error:`, toolErr);
      }
    }

    // ── One shared resolver for every agent ─────────────────────────────────
    const config = await resolveModelConfig(supabase, "guest", { maxTokens: 500 });
    if (config.provider === "openrouter" && !config.apiKey) {
      return jsonRes({ error: "OpenRouter API key not configured in Admin → Agent Settings." }, 400);
    }

    const systemPrompt = buildSystemPrompt(memory, guest) + toolContext;

    const messages = [
      { role: "system", content: systemPrompt },
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

    return jsonRes({
      reply,
      provider: config.provider,
      model: config.model,
      model_source: config.source,
      tool_used: detected?.tool || null,
    });
  } catch (error) {
    console.error("[guest-chat] error", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
