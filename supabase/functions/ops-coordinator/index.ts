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

// ── Manila helpers ────────────────────────────────────────────────────────────

function manilaDate(offsetDays = 0): string {
  return new Date(Date.now() + (8 + offsetDays * 24) * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function manilaRangeStart(date: string) { return `${date}T00:00:00+08:00`; }
function manilaRangeEnd(date: string)   { return `${date}T23:59:59+08:00`; }

// ── Shared DB helpers ─────────────────────────────────────────────────────────

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function sendTelegram(supabase: any, group: string, message: string) {
  await supabase.functions.invoke("send-telegram", {
    body: { group, message },
    headers: {
      "x-internal-secret": Deno.env.get("INTERNAL_FN_SECRET") ?? "",
    },
  });
}

async function createTask(supabase: any, opts: {
  title: string;
  description: string;
  category: string;
  priority: "low" | "medium" | "high";
  due_date: string;
}) {
  await supabase.from("resort_ops_tasks").insert({
    title: opts.title,
    description: opts.description,
    category: opts.category,
    priority: opts.priority,
    due_date: opts.due_date,
    status: "pending",
  });
}

// ── Data fetcher ──────────────────────────────────────────────────────────────

async function fetchBriefData(supabase: any, type: string) {
  const today     = manilaDate(0);
  const yesterday = manilaDate(-1);
  const tomorrow  = manilaDate(1);

  const [
    activeRes,
    unitsRes,
    requestsRes,
    hkRes,
    overdueTasksRes,
    toursTodayRes,
    arrivalsRes,
    departuresRes,
    fbYestRes,
    fbTodayRes,
    openTabsRes,
    tomorrowArrivalsRes,
    expensesRes,
  ] = await Promise.all([
    // Active stays
    supabase
      .from("resort_ops_bookings")
      .select("id, check_in, check_out, room_rate, paid_amount, addons_total, checked_in_at, checked_out_at, platform, resort_ops_guests(full_name), resort_ops_units(name)")
      .lte("check_in", today)
      .gte("check_out", today)
      .is("checked_out_at", null),

    // Total units
    supabase.from("resort_ops_units").select("id", { count: "exact", head: true }),

    // Open guest requests
    supabase
      .from("guest_requests")
      .select("id, guest_name, request_type, details, status, created_at")
      .neq("status", "completed")
      .order("created_at", { ascending: true }),

    // Housekeeping queue
    supabase
      .from("housekeeping_orders")
      .select("id, unit_name, status, damage_notes, accepted_by_name, cleaning_by_name, created_at")
      .not("status", "in", "(completed,cancelled)"),

    // Overdue tasks
    supabase
      .from("resort_ops_tasks")
      .select("id, title, category, due_date, priority")
      .neq("status", "done")
      .lt("due_date", today)
      .order("due_date", { ascending: true }),

    // Tours today
    supabase
      .from("guest_tours")
      .select("tour_name, pax, price, status, pickup_time")
      .eq("tour_date", today),

    // Today arrivals
    supabase
      .from("resort_ops_bookings")
      .select("checked_in_at, room_rate, paid_amount, addons_total, platform, resort_ops_guests(full_name), resort_ops_units(name)")
      .eq("check_in", today)
      .is("checked_out_at", null),

    // Today departures
    supabase
      .from("resort_ops_bookings")
      .select("checked_out_at, room_rate, paid_amount, addons_total, resort_ops_guests(full_name), resort_ops_units(name)")
      .eq("check_out", today),

    // Yesterday F&B
    supabase
      .from("orders")
      .select("total")
      .eq("status", "Closed")
      .gte("closed_at", manilaRangeStart(yesterday))
      .lt("closed_at", manilaRangeStart(today)),

    // Today F&B
    supabase
      .from("orders")
      .select("total")
      .eq("status", "Closed")
      .gte("closed_at", manilaRangeStart(today))
      .lte("closed_at", manilaRangeEnd(today)),

    // Open tabs
    supabase.from("tabs").select("id, guest_name, location_detail").eq("status", "Open"),

    // Tomorrow arrivals
    supabase
      .from("resort_ops_bookings")
      .select("platform, resort_ops_guests(full_name), resort_ops_units(name)")
      .eq("check_in", tomorrow),

    // Today expenses
    supabase
      .from("resort_ops_expenses")
      .select("amount, category")
      .eq("expense_date", today),
  ]);

  const now = Date.now();
  const TWO_HOURS = 2 * 3_600_000;

  const active = (activeRes.data ?? []).map((b: any) => ({
    guest:      b.resort_ops_guests?.full_name ?? "Unknown",
    unit:       b.resort_ops_units?.name ?? "—",
    check_in:   b.check_in,
    check_out:  b.check_out,
    platform:   b.platform ?? "Direct",
    checked_in: !!b.checked_in_at,
    balance:    Math.max(0, (b.room_rate ?? 0) + (b.addons_total ?? 0) - (b.paid_amount ?? 0)),
  }));

  const totalUnits = unitsRes.count ?? 0;

  const requests = (requestsRes.data ?? []);
  const overdueRequests = requests.filter((r: any) =>
    r.status === "pending" && (now - new Date(r.created_at).getTime()) > TWO_HOURS
  );

  const hkQueue = (hkRes.data ?? []);
  const damageNotes = hkQueue
    .filter((h: any) => h.damage_notes)
    .map((h: any) => `${h.unit_name}: ${h.damage_notes}`);

  const arrivals    = (arrivalsRes.data ?? []);
  const departures  = (departuresRes.data ?? []);
  const fbYest      = (fbYestRes.data ?? []).reduce((s: number, o: any) => s + (o.total ?? 0), 0);
  const fbToday     = (fbTodayRes.data ?? []).reduce((s: number, o: any) => s + (o.total ?? 0), 0);
  const openTabs    = (openTabsRes.data ?? []);
  const tomorrowArr = (tomorrowArrivalsRes.data ?? []);
  const expenses    = (expensesRes.data ?? []);
  const expTotal    = expenses.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);

  const departingWithBalance = departures.filter((b: any) =>
    Math.max(0, (b.room_rate ?? 0) + (b.addons_total ?? 0) - (b.paid_amount ?? 0)) > 0
  );

  return {
    brief_type:   type,
    date:         today,
    occupancy: {
      active:      active.length,
      total:       totalUnits,
      pct:         totalUnits > 0 ? Math.round(active.length / totalUnits * 100) : 0,
    },
    active_bookings:         active,
    total_unpaid:            Math.round(active.reduce((s: number, b: any) => s + b.balance, 0)),
    departing_with_balance:  departingWithBalance.map((b: any) => ({
      guest:   b.resort_ops_guests?.full_name ?? "Unknown",
      unit:    b.resort_ops_units?.name ?? "—",
      balance: Math.max(0, (b.room_rate ?? 0) + (b.addons_total ?? 0) - (b.paid_amount ?? 0)),
    })),
    arrivals: {
      expected:    arrivals.length,
      checked_in:  arrivals.filter((b: any) => b.checked_in_at).length,
      pending:     arrivals.filter((b: any) => !b.checked_in_at).length,
    },
    departures: {
      expected:    departures.length,
      checked_out: departures.filter((b: any) => b.checked_out_at).length,
    },
    housekeeping: {
      pending:     hkQueue.filter((h: any) => ["pending", "assigned"].includes(h.status)).length,
      cleaning:    hkQueue.filter((h: any) => ["accepted", "in_progress", "cleaning"].includes(h.status)).length,
      damage_notes: damageNotes,
    },
    requests: {
      open:    requests.length,
      overdue: overdueRequests.length,
      overdue_items: overdueRequests.map((r: any) => ({
        type: r.request_type ?? "request",
        age_hours: Math.floor((now - new Date(r.created_at).getTime()) / 3_600_000),
      })),
    },
    overdue_tasks: (overdueTasksRes.data ?? []).map((t: any) => ({
      title:       t.title,
      days_late:   Math.floor((new Date(today).getTime() - new Date(t.due_date).getTime()) / 86_400_000),
      priority:    t.priority,
    })),
    tours_today:  (toursTodayRes.data ?? []).map((t: any) => ({
      name: t.tour_name, pax: t.pax ?? 0, pickup: t.pickup_time ?? "TBD", status: t.status,
    })),
    fb_yesterday: Math.round(fbYest),
    fb_today:     Math.round(fbToday),
    open_tabs:    openTabs.map((t: any) => ({ guest: t.guest_name, location: t.location_detail })),
    tomorrow_arrivals: tomorrowArr.map((b: any) => ({
      guest:    b.resort_ops_guests?.full_name ?? "Unknown",
      unit:     b.resort_ops_units?.name ?? "—",
      platform: b.platform ?? "Direct",
    })),
    expenses_today: { total: Math.round(expTotal), count: expenses.length },
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(data: Record<string, any>): string {
  const labels: Record<string, string> = {
    morning: "🌅 MORNING BRIEF",
    evening: "🌙 EVENING BRIEF",
    daily:   "📊 DAILY SUMMARY",
  };

  const instructions: Record<string, string> = {
    morning: `Focus on: arrivals/departures for today, unpaid departing guests, housekeeping readiness, overdue tasks, tour pickups. End with "Ready for morning briefing." or a top action item.`,
    evening: `Focus on: arrival completion (did all guests check in?), F&B revenue, open tabs, unresolved guest requests, tomorrow's preview. Flag anything unresolved.`,
    daily:   `Focus on: revenue totals (F&B + unpaid balance overview), occupancy achieved, tasks completed vs open, expenses recorded, open items carried to tomorrow.`,
  };

  return `Generate a ${labels[data.brief_type]} for KAPWA Hospitality OS on ${data.date}.

Operational data:
${JSON.stringify(data, null, 2)}

Instructions:
- Plain text only. No markdown. No asterisks.
- Bullets use "•". Section headers in ALL CAPS.
- ${instructions[data.brief_type]}
- Maximum 320 words. Cut anything not actionable.
- Flag ALERTS prominently. Departing guests with balance = urgent.
- Currency: Philippine Peso (₱), whole numbers.
- If no issues: say "No issues flagged."
- Tone: direct, helpful to a resort owner.`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("INTERNAL_FN_SECRET");
  if (secret && req.headers.get("x-internal-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { type = "morning" } = await req.json().catch(() => ({}));
    if (!["morning", "evening", "daily"].includes(type)) {
      return new Response(JSON.stringify({ error: "type must be morning | evening | daily" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = sb();
    const data     = await fetchBriefData(supabase, type);

    const brief = await callClaude(buildPrompt(data), 700);

    await sendTelegram(supabase, "managers", brief);

    return new Response(
      JSON.stringify({ ok: true, type, chars: brief.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[ops-coordinator]", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
