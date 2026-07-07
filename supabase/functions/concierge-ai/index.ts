import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function callClaude(prompt: string, maxTokens = 700): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://paghxagqnaisxesmhnwj.supabase.co",
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4-5",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
  });
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function manilaDate(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

async function sendTelegram(supabase: any, group: string, message: string) {
  await supabase.functions.invoke("send-telegram", {
    body: { group, message },
    headers: { "x-internal-secret": Deno.env.get("INTERNAL_FN_SECRET") ?? "" },
  });
}

async function createTask(supabase: any, opts: {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  due_date: string;
}) {
  const { error } = await supabase.from("resort_ops_tasks").insert({
    title:       opts.title,
    description: opts.description,
    category:    "concierge-ai",
    priority:    opts.priority,
    due_date:    opts.due_date,
    status:      "pending",
  });
  if (error) console.error("[concierge-ai] task insert error:", error.message);
}

// ── Request routing ───────────────────────────────────────────────────────────

// Maps request_type keywords → Telegram group
const ROUTING_RULES: Array<{ keywords: string[]; group: string; label: string }> = [
  { keywords: ["food", "drink", "beverage", "room service", "breakfast", "lunch", "dinner", "coffee", "water", "meal", "order"], group: "kitchen", label: "F&B" },
  { keywords: ["towel", "linen", "sheet", "pillow", "blanket", "clean", "housekeeping", "maid", "laundry", "amenity", "shampoo", "soap", "toilet paper"], group: "housekeeping", label: "Housekeeping" },
  { keywords: ["maintenance", "repair", "broken", "leaking", "ac", "air con", "fan", "light", "bulb", "plumbing", "electricity", "wifi", "internet", "door", "lock", "shower"], group: "housekeeping", label: "Maintenance" },
  { keywords: ["tour", "trip", "island", "snorkel", "dive", "boat", "kayak", "activity", "excursion"], group: "tours", label: "Tours" },
  { keywords: ["transport", "van", "pickup", "transfer", "airport", "tricycle", "motorcycle"], group: "tours", label: "Transport" },
  { keywords: ["complaint", "unhappy", "unacceptable", "refund", "wrong", "bad", "poor", "terrible", "disgusting"], group: "managers", label: "Complaint" },
  { keywords: ["checkout", "check out", "bill", "invoice", "payment", "receipt", "late", "early checkin", "early check"], group: "reception", label: "Front Desk" },
];

function routeRequest(requestType: string, details: string): { group: string; label: string } {
  const text = `${requestType} ${details}`.toLowerCase();
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some(k => text.includes(k))) {
      return { group: rule.group, label: rule.label };
    }
  }
  return { group: "reception", label: "General" };
}

// ── Claude draft for complex requests ────────────────────────────────────────

async function draftResponse(request: any): Promise<string> {
  const prompt = `You are the guest concierge AI at KAPWA Hospitality OS in San Vicente, Palawan.

Draft a brief staff action note (not a guest-facing message) for handling this guest request.
Plain text. Maximum 60 words. Start with the action verb. Be specific.

Guest: ${request.guest_name ?? "unknown"}
Room: ${request.room ?? "unknown"}
Request type: ${request.request_type ?? "general"}
Details: ${request.details ?? "none"}
Age: ${request.age_hours ?? 0} hours old`;
  return await callClaude(prompt, 200);
}

// ── Main processor ────────────────────────────────────────────────────────────

interface ProcessedRequest {
  id: string;
  guest_name: string;
  room: string;
  request_type: string;
  details: string;
  status: string;
  age_hours: number;
  route: { group: string; label: string };
  is_overdue: boolean;
  is_complaint: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("INTERNAL_FN_SECRET");
  if (secret && req.headers.get("x-internal-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = sb();
    const today    = manilaDate();
    const now      = Date.now();
    const TWO_HOURS = 2 * 3_600_000;

    // Fetch all non-completed requests
    const { data: rawRequests, error } = await supabase
      .from("guest_requests")
      .select("id, guest_name, request_type, details, status, created_at, room_id, units(unit_name)")
      .neq("status", "completed")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const requests: ProcessedRequest[] = (rawRequests ?? []).map((r: any) => {
      const ageMs   = now - new Date(r.created_at).getTime();
      const ageHours = Math.floor(ageMs / 3_600_000);
      const isOverdue   = r.status === "pending" && ageMs > TWO_HOURS;
      const isComplaint = ROUTING_RULES
        .find(rule => rule.label === "Complaint")!
        .keywords.some(k => `${r.request_type} ${r.details ?? ""}`.toLowerCase().includes(k));

      return {
        id:           r.id,
        guest_name:   r.guest_name ?? "Unknown Guest",
        room:         r.units?.unit_name ?? "Unknown Room",
        request_type: r.request_type ?? "General",
        details:      r.details ?? "",
        status:       r.status ?? "pending",
        age_hours:    ageHours,
        route:        routeRequest(r.request_type ?? "", r.details ?? ""),
        is_overdue:   isOverdue,
        is_complaint: isComplaint,
      };
    });

    // Separate new (pending) from already-routed (in_progress)
    const newRequests      = requests.filter(r => r.status === "pending");
    const overdueRequests  = requests.filter(r => r.is_overdue);
    const complaints       = requests.filter(r => r.is_complaint);

    const routed:   string[] = [];
    const escalated: string[] = [];

    // ── Route new requests ────────────────────────────────────────────────────
    for (const r of newRequests) {
      const msg = [
        `📍 ${r.route.label} Request — ${r.room}`,
        `Guest: ${r.guest_name}`,
        `Request: ${r.request_type}${r.details ? ` — ${r.details}` : ""}`,
      ].join("\n");

      await sendTelegram(supabase, r.route.group, msg);

      // Mark as in_progress so we don't route again on next run
      await supabase
        .from("guest_requests")
        .update({ status: "in_progress" })
        .eq("id", r.id);

      routed.push(r.id);
    }

    // ── Escalate overdue requests ─────────────────────────────────────────────
    for (const r of overdueRequests) {
      // Only escalate if not already escalated (check via task existence)
      const { count } = await supabase
        .from("resort_ops_tasks")
        .select("id", { count: "exact", head: true })
        .eq("category", "concierge-ai")
        .ilike("title", `%${r.id}%`);

      if ((count ?? 0) > 0) continue; // already has a task

      const draft = await draftResponse(r);

      await createTask(supabase, {
        title:    `OVERDUE (${r.age_hours}h): ${r.request_type} — ${r.room} (${r.guest_name})`,
        description: `Request ID: ${r.id}\nDetails: ${r.details}\nStatus: ${r.status}\nAge: ${r.age_hours} hours\n\nSuggested action:\n${draft}`,
        priority: r.is_complaint ? "high" : "medium",
        due_date: today,
      });

      await sendTelegram(
        supabase,
        r.is_complaint ? "managers" : r.route.group,
        `⏰ OVERDUE REQUEST (${r.age_hours}h unresolved)\n${r.room} — ${r.guest_name}\n${r.request_type}: ${r.details}`
      );

      escalated.push(r.id);
    }

    // ── Escalate complaints immediately to managers ───────────────────────────
    for (const r of complaints.filter(r => r.status === "pending")) {
      await createTask(supabase, {
        title:    `COMPLAINT: ${r.room} — ${r.guest_name}: ${r.request_type}`,
        description: `Guest complaint requires manager attention.\nDetails: ${r.details}\nAge: ${r.age_hours} hours\nRequest ID: ${r.id}`,
        priority: "high",
        due_date: today,
      });

      await sendTelegram(
        supabase,
        "managers",
        `🔴 GUEST COMPLAINT\nRoom: ${r.room}\nGuest: ${r.guest_name}\nIssue: ${r.request_type} — ${r.details}`
      );
    }

    // ── Summary to managers only if there was real activity ─────────────────
    const totalOpen = requests.length;
    const hadActivity = routed.length > 0 || escalated.length > 0 || complaints.length > 0;
    if (totalOpen > 0 && hadActivity) {
      const summary = await callClaude(`You are the guest concierge coordinator for KAPWA Hospitality OS.

Summarize the current guest request status for the manager. Plain text only. No markdown. Bullets use "•".
Start with "🛎️ CONCIERGE STATUS" on line 1. Maximum 150 words.

Data:
- Total open requests: ${totalOpen}
- Newly routed this run: ${routed.length}
- Escalated (overdue): ${escalated.length}
- Active complaints: ${complaints.length}
- Requests by type: ${JSON.stringify(
  requests.reduce((acc: Record<string, number>, r) => {
    acc[r.route.label] = (acc[r.route.label] ?? 0) + 1;
    return acc;
  }, {})
)}
- Oldest unresolved: ${requests[0] ? `${requests[0].age_hours}h — ${requests[0].request_type} (${requests[0].room})` : "none"}`, 300);
      await sendTelegram(supabase, "managers", summary);
    }

    return new Response(
      JSON.stringify({
        ok:        true,
        total:     requests.length,
        routed:    routed.length,
        escalated: escalated.length,
        complaints: complaints.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[concierge-ai]", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
