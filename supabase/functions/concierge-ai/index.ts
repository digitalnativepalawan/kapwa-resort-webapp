import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function sb() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function manilaDate() {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

const ROUTING_RULES = [
  { keywords: ["food", "drink", "room service", "breakfast", "lunch", "dinner", "coffee", "water", "meal", "order"], group: "kitchen", label: "F&B" },
  { keywords: ["towel", "linen", "sheet", "pillow", "blanket", "clean", "housekeeping", "laundry", "amenity", "shampoo", "soap", "toilet paper"], group: "housekeeping", label: "Housekeeping" },
  { keywords: ["maintenance", "repair", "broken", "leaking", "air con", "wifi", "internet", "door", "lock", "shower", "plumbing", "electricity"], group: "housekeeping", label: "Maintenance" },
  { keywords: ["tour", "trip", "island", "snorkel", "dive", "boat", "kayak", "activity", "excursion"], group: "tours", label: "Tours" },
  { keywords: ["transport", "van", "pickup", "transfer", "airport", "tricycle", "motorcycle"], group: "tours", label: "Transport" },
  { keywords: ["complaint", "unhappy", "unacceptable", "refund", "wrong", "bad", "poor", "terrible", "disgusting"], group: "managers", label: "Complaint" },
  { keywords: ["checkout", "check out", "bill", "invoice", "payment", "receipt", "late", "early check"], group: "reception", label: "Front Desk" },
];

function routeRequest(requestType: string, details: string) {
  const text = `${requestType} ${details}`.toLowerCase();
  return ROUTING_RULES.find((rule) => rule.keywords.some((keyword) => text.includes(keyword))) ?? { group: "reception", label: "General" };
}

async function sendRequestTelegram(supabase: any, request: any, route: { group: string; label: string }) {
  const message = [
    `<b>📍 ${route.label} Request — ${request.units?.unit_name ?? "Unknown Room"}</b>`,
    `Guest: ${request.guest_name ?? "Unknown Guest"}`,
    `Request: ${request.request_type ?? "General"}${request.details ? ` — ${request.details}` : ""}`,
    `Age: ${Math.max(0, Math.floor((Date.now() - new Date(request.created_at).getTime()) / 3_600_000))}h`,
  ].join("\n");

  const { data, error } = await supabase.functions.invoke("send-telegram", {
    body: {
      group: route.group,
      message,
      reply_markup: {
        inline_keyboard: [[
          { text: "👤 Accept", callback_data: `guest_request:accept:${request.id}` },
          { text: "✅ Complete", callback_data: `guest_request:complete:${request.id}` },
        ]],
      },
    },
    headers: { "x-internal-secret": Deno.env.get("INTERNAL_FN_SECRET") ?? "" },
  });
  if (error) throw error;
  const sent = data?.results?.find((result: any) => result.group === route.group && result.ok);
  if (!sent) throw new Error(data?.results?.[0]?.error || "Telegram routing failed");
  return sent;
}

async function createEscalationTask(supabase: any, request: any, priority: "medium" | "high") {
  const title = `GUEST REQUEST ${request.id}: ${request.request_type} — ${request.units?.unit_name ?? "Unknown Room"}`;
  const { count } = await supabase.from("resort_ops_tasks").select("id", { count: "exact", head: true }).eq("category", "concierge-ai").eq("title", title);
  if ((count ?? 0) > 0) return false;
  const { error } = await supabase.from("resort_ops_tasks").insert({
    title,
    description: `Guest: ${request.guest_name}\nDetails: ${request.details}\nRequest ID: ${request.id}`,
    category: "concierge-ai",
    priority,
    due_date: manilaDate(),
    status: "pending",
  });
  if (error) throw error;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const secret = Deno.env.get("INTERNAL_FN_SECRET");
  if (secret && req.headers.get("x-internal-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: jsonHeaders });
  }

  try {
    const supabase = sb();
    const { data: requests, error } = await supabase
      .from("guest_requests")
      .select("id,guest_name,request_type,details,status,created_at,updated_at,routed_group,assigned_to,escalated_at,room_id,units(unit_name)")
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: true });
    if (error) throw error;

    let routed = 0;
    let escalated = 0;
    let complaints = 0;
    const now = Date.now();

    for (const request of requests ?? []) {
      const route = routeRequest(request.request_type ?? "", request.details ?? "");
      const ageMs = now - new Date(request.created_at).getTime();
      const isComplaint = route.label === "Complaint";

      if (request.status === "pending" && !request.routed_group) {
        const sent = await sendRequestTelegram(supabase, request, route);
        const { error: updateError } = await supabase.from("guest_requests").update({
          status: "routed",
          routed_group: route.group,
          telegram_chat_id: sent.chat_id,
          telegram_message_id: sent.message_id,
          updated_at: new Date().toISOString(),
        }).eq("id", request.id);
        if (updateError) throw updateError;
        routed += 1;
      }

      if (isComplaint) {
        complaints += 1;
        const created = await createEscalationTask(supabase, request, "high");
        if (created) {
          await supabase.functions.invoke("send-telegram", {
            body: { group: "managers", message: `<b>🔴 GUEST COMPLAINT</b>\n${request.units?.unit_name ?? "Room"} — ${request.guest_name}\n${request.request_type}: ${request.details}` },
            headers: { "x-internal-secret": secret ?? "" },
          });
        }
      }

      if (ageMs > 2 * 3_600_000 && !request.assigned_to && !request.escalated_at) {
        const created = await createEscalationTask(supabase, request, isComplaint ? "high" : "medium");
        await supabase.from("guest_requests").update({
          status: "escalated",
          escalated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", request.id);
        await supabase.functions.invoke("send-telegram", {
          body: { group: isComplaint ? "managers" : `${route.group},managers`, message: `<b>⏰ OVERDUE GUEST REQUEST</b>\n${request.units?.unit_name ?? "Room"} — ${request.guest_name}\n${request.request_type}: ${request.details}\nUnaccepted for ${Math.floor(ageMs / 3_600_000)} hours.` },
          headers: { "x-internal-secret": secret ?? "" },
        });
        if (created) escalated += 1;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      total: requests?.length ?? 0,
      routed,
      escalated,
      complaints,
      unresolved: (requests ?? []).filter((request: any) => !request.assigned_to).length,
    }), { headers: jsonHeaders });
  } catch (error) {
    console.error("[concierge-ai]", error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: jsonHeaders });
  }
});
