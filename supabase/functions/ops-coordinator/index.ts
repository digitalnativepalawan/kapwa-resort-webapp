import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function manilaDate(offsetDays = 0): string {
  return new Date(Date.now() + (8 + offsetDays * 24) * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function manilaRangeStart(date: string) {
  return `${date}T00:00:00+08:00`;
}

function manilaRangeEnd(date: string) {
  return `${date}T23:59:59+08:00`;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

function isAdminRequest(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const payload = token ? decodeJwtPayload(token) : null;
  return payload?.is_admin === true ||
    (Array.isArray(payload?.permissions) && payload.permissions.includes("admin"));
}

async function callModel(prompt: string, maxTokens = 700): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("model_unavailable"); // handled by caller -> deterministic fallback

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("APP_URL") ?? "https://kapwa.local",
      "X-Title": "KAPWA Hospitality OS",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPS_COORDINATOR_MODEL") ?? "anthropic/claude-haiku-4-5",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("OpenRouter returned an empty operations brief");
  return reply;
}


async function sendTelegram(supabase: any, group: string, message: string) {
  const { error } = await supabase.functions.invoke("send-telegram", {
    body: { group, message },
    headers: { "x-internal-secret": Deno.env.get("INTERNAL_FN_SECRET") ?? "" },
  });
  if (error) throw error;
}

async function fetchBriefData(supabase: any, type: string) {
  const today = manilaDate();
  const yesterday = manilaDate(-1);
  const tomorrow = manilaDate(1);

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
    supabase
      .from("resort_ops_bookings")
      .select("id,check_in,check_out,room_rate,paid_amount,addons_total,checked_in_at,checked_out_at,platform,resort_ops_guests(full_name),resort_ops_units(name)")
      .lte("check_in", today)
      .gte("check_out", today)
      .is("checked_out_at", null),
    supabase.from("resort_ops_units").select("id,name"),
    supabase
      .from("guest_requests")
      .select("id,guest_name,request_type,details,status,priority,created_at")
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: true }),
    supabase
      .from("housekeeping_orders")
      .select("id,unit_name,status,damage_notes,accepted_by_name,cleaning_by_name,created_at")
      .not("status", "in", "(completed,cancelled)"),
    supabase
      .from("resort_ops_tasks")
      .select("id,title,category,due_date,priority,status")
      .neq("status", "done")
      .lt("due_date", today)
      .order("due_date", { ascending: true }),
    supabase.from("guest_tours").select("tour_name,pax,price,status,pickup_time").eq("tour_date", today),
    supabase
      .from("resort_ops_bookings")
      .select("checked_in_at,room_rate,paid_amount,addons_total,platform,resort_ops_guests(full_name),resort_ops_units(name)")
      .eq("check_in", today)
      .is("checked_out_at", null),
    supabase
      .from("resort_ops_bookings")
      .select("checked_out_at,room_rate,paid_amount,addons_total,resort_ops_guests(full_name),resort_ops_units(name)")
      .eq("check_out", today),
    supabase.from("orders").select("total").eq("status", "Closed").gte("closed_at", manilaRangeStart(yesterday)).lt("closed_at", manilaRangeStart(today)),
    supabase.from("orders").select("total").eq("status", "Closed").gte("closed_at", manilaRangeStart(today)).lte("closed_at", manilaRangeEnd(today)),
    supabase.from("tabs").select("id,guest_name,location_detail").eq("status", "Open"),
    supabase
      .from("resort_ops_bookings")
      .select("platform,resort_ops_guests(full_name),resort_ops_units(name)")
      .eq("check_in", tomorrow),
    supabase.from("resort_ops_expenses").select("amount,category").eq("expense_date", today),
  ]);

  const results = [activeRes, unitsRes, requestsRes, hkRes, overdueTasksRes, toursTodayRes, arrivalsRes, departuresRes, fbYestRes, fbTodayRes, openTabsRes, tomorrowArrivalsRes, expensesRes];
  const failed = results.find((result: any) => result.error);
  if (failed?.error) throw failed.error;

  const now = Date.now();
  const twoHours = 2 * 3_600_000;
  const active = (activeRes.data ?? []).map((booking: any) => ({
    guest: booking.resort_ops_guests?.full_name ?? "Unknown",
    unit: booking.resort_ops_units?.name ?? "—",
    check_in: booking.check_in,
    check_out: booking.check_out,
    platform: booking.platform ?? "Direct",
    checked_in: Boolean(booking.checked_in_at),
    balance: Math.max(0, (booking.room_rate ?? 0) + (booking.addons_total ?? 0) - (booking.paid_amount ?? 0)),
  }));
  const units = unitsRes.data ?? [];
  const requests = requestsRes.data ?? [];
  const housekeeping = hkRes.data ?? [];
  const arrivals = arrivalsRes.data ?? [];
  const departures = departuresRes.data ?? [];
  const overdueRequests = requests.filter((request: any) =>
    request.status === "pending" && now - new Date(request.created_at).getTime() > twoHours
  );
  const urgentRequests = requests.filter((request: any) => ["urgent", "high"].includes(String(request.priority).toLowerCase()));
  const dirtyUnits = units.filter((unit: any) => ["dirty", "to_clean"].includes(String(unit.status).toLowerCase()));
  const missingHousekeeping = dirtyUnits.filter((unit: any) =>
    !housekeeping.some((order: any) => order.unit_name === unit.name)
  );
  const fbYesterday = (fbYestRes.data ?? []).reduce((sum: number, order: any) => sum + (order.total ?? 0), 0);
  const fbToday = (fbTodayRes.data ?? []).reduce((sum: number, order: any) => sum + (order.total ?? 0), 0);
  const expenses = expensesRes.data ?? [];

  return {
    brief_type: type,
    date: today,
    occupancy: {
      active: active.length,
      total: units.length,
      pct: units.length ? Math.round(active.length / units.length * 100) : 0,
    },
    active_bookings: active,
    total_unpaid: Math.round(active.reduce((sum: number, booking: any) => sum + booking.balance, 0)),
    arrivals: {
      expected: arrivals.length,
      checked_in: arrivals.filter((booking: any) => booking.checked_in_at).length,
      pending: arrivals.filter((booking: any) => !booking.checked_in_at).length,
    },
    departures: {
      expected: departures.length,
      checked_out: departures.filter((booking: any) => booking.checked_out_at).length,
    },
    housekeeping: {
      open: housekeeping.length,
      dirty_units: dirtyUnits.map((unit: any) => ({ id: unit.id, name: unit.name })),
      missing_orders: missingHousekeeping.map((unit: any) => ({ id: unit.id, name: unit.name })),
      damage_notes: housekeeping.filter((order: any) => order.damage_notes).map((order: any) => `${order.unit_name}: ${order.damage_notes}`),
    },
    requests: {
      open: requests.length,
      overdue: overdueRequests.length,
      urgent: urgentRequests.map((request: any) => ({
        id: request.id,
        guest_name: request.guest_name,
        request_type: request.request_type,
        details: request.details,
        priority: request.priority,
      })),
    },
    overdue_tasks: overdueTasksRes.data ?? [],
    tours_today: toursTodayRes.data ?? [],
    fb_yesterday: Math.round(fbYesterday),
    fb_today: Math.round(fbToday),
    open_tabs: openTabsRes.data ?? [],
    tomorrow_arrivals: tomorrowArrivalsRes.data ?? [],
    expenses_today: {
      total: Math.round(expenses.reduce((sum: number, expense: any) => sum + (expense.amount ?? 0), 0)),
      count: expenses.length,
    },
  };
}

function buildPrompt(data: Record<string, any>, question?: string): string {
  const labels: Record<string, string> = {
    morning: "MORNING BRIEF",
    evening: "EVENING BRIEF",
    daily: "DAILY SUMMARY",
  };
  const focus: Record<string, string> = {
    morning: "arrivals, departures, balances, room readiness, overdue tasks, guest requests and tour pickups",
    evening: "arrival completion, F&B revenue, open tabs, unresolved requests and tomorrow's arrivals",
    daily: "occupancy, revenue, expenses, unresolved work and the highest-priority management actions",
  };

  return `You are the KAPWA Resort Operations Coordinator. Generate the ${labels[data.brief_type]} for ${data.date}.
Manager question: ${question?.trim() || "What needs management attention now?"}
Operational data: ${JSON.stringify(data)}
Rules:
- Use only supplied data. Never invent a guest, amount, room status or completed action.
- Put urgent risks first, then today's priorities, then recommended next actions.
- Focus on ${focus[data.brief_type]}.
- Plain text, maximum 320 words, direct resort-owner tone.
- Currency is Philippine Peso (₱), whole numbers.
- Never claim an action was executed.`;
}

function buildActionProposals(data: Record<string, any>) {
  const actions: Record<string, unknown>[] = [];
  for (const unit of data.housekeeping.missing_orders ?? []) {
    actions.push({
      id: crypto.randomUUID(),
      action_type: "create_housekeeping_task",
      title: `Create cleaning task for ${unit.name}`,
      description: "Room needs cleaning and has no active housekeeping order.",
      target_id: unit.id,
      payload: { unit_name: unit.name },
      risk_level: "low",
      status: "proposed",
      created_at: new Date().toISOString(),
    });
  }
  for (const request of data.requests.urgent ?? []) {
    actions.push({
      id: crypto.randomUUID(),
      action_type: "escalate_guest_request",
      title: `Escalate ${request.request_type ?? "guest request"}${request.guest_name ? ` for ${request.guest_name}` : ""}`,
      description: request.details || "Urgent guest request needs staff attention.",
      target_id: request.id,
      payload: { guest_request_id: request.id, status: "escalated" },
      risk_level: "medium",
      status: "proposed",
      created_at: new Date().toISOString(),
    });
  }
  // Recap overdue maintenance/ops tasks that still have no follow-up task.
  const seenTitles = new Set<string>();
  for (const t of (data.overdue_tasks ?? []).slice(0, 5)) {
    const followUpTitle = `Follow up: ${t.title}`;
    if (seenTitles.has(followUpTitle)) continue;
    seenTitles.add(followUpTitle);
    actions.push({
      id: crypto.randomUUID(),
      action_type: "create_task",
      title: followUpTitle,
      description: `Overdue ${t.category || "task"} (was due ${t.due_date}). Create a follow-up task so this is not lost.`,
      target_id: t.id,
      payload: {
        title: followUpTitle,
        description: `Auto-created follow-up for overdue task ${t.id} (${t.title}).`,
        category: t.category || "operations",
        priority: t.priority || "high",
      },
      risk_level: "low",
      status: "proposed",
      created_at: new Date().toISOString(),
    });
  }
  return actions;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const internalSecret = Deno.env.get("INTERNAL_FN_SECRET");
  const internalAuthorized = Boolean(internalSecret) && req.headers.get("x-internal-secret") === internalSecret;
  const adminAuthorized = isAdminRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const type = body.type ?? "morning";
    const delivery = body.delivery ?? "preview";
    const question = typeof body.question === "string" ? body.question : undefined;

    if (!["morning", "evening", "daily"].includes(type)) {
      return jsonResponse({ error: "type must be morning | evening | daily" }, 400);
    }
    if (!["preview", "telegram"].includes(delivery)) {
      return jsonResponse({ error: "delivery must be preview | telegram" }, 400);
    }
    if (delivery === "telegram" && !internalAuthorized && !adminAuthorized) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    if (delivery === "preview" && !adminAuthorized && !internalAuthorized) {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    const supabase = sb();
    const data = await fetchBriefData(supabase, type);
    let brief: string;
    let provider = "deterministic";
    let model: string | null = null;

    try {
      brief = await callModel(buildPrompt(data, question));
      provider = "openrouter";
      model = Deno.env.get("OPS_COORDINATOR_MODEL") ?? "anthropic/claude-haiku-4-5";
    } catch (error) {
      console.error("[ops-coordinator] model fallback", error);
      brief = `${data.arrivals.expected} arrivals, ${data.departures.expected} departures, ${data.housekeeping.open} open housekeeping orders, ${data.requests.open} open guest requests, ${data.overdue_tasks.length} overdue tasks, and ₱${data.total_unpaid} unpaid across active stays. Review urgent requests, missing room-cleaning orders, departing balances and overdue work first.`;
    }

    if (delivery === "telegram") {
      await sendTelegram(supabase, body.group ?? "managers", brief);
    }

    return jsonResponse({
      ok: true,
      type,
      delivery,
      brief,
      data,
      actions: buildActionProposals(data),
      provider,
      model,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ops-coordinator]", error);
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});