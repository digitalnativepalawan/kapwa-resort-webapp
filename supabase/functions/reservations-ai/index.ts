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

function manilaDate(offsetDays = 0): string {
  return new Date(Date.now() + (8 + offsetDays * 24) * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
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
  category: string;
  priority: "low" | "medium" | "high";
  due_date: string;
}) {
  // Dedup: skip if identical title already exists for today (prevents daily respam on unresolved issues)
  const { count } = await supabase
    .from("resort_ops_tasks")
    .select("id", { count: "exact", head: true })
    .eq("category", opts.category)
    .eq("title", opts.title)
    .eq("due_date", opts.due_date);

  if ((count ?? 0) > 0) {
    console.log(`[reservations-ai] task already exists today, skipping: ${opts.title}`);
    return;
  }

  const { error } = await supabase.from("resort_ops_tasks").insert({
    title:       opts.title,
    description: opts.description,
    category:    opts.category,
    priority:    opts.priority,
    due_date:    opts.due_date,
    status:      "pending",
  });
  if (error) console.error("[reservations-ai] task insert error:", error.message);
}

// ── Issue detectors ───────────────────────────────────────────────────────────

interface Issue {
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  telegram_group?: string; // if set, send immediate alert
}

async function detectIssues(supabase: any): Promise<Issue[]> {
  const today    = manilaDate(0);
  const tomorrow = manilaDate(1);
  const in7days  = manilaDate(7);
  const issues: Issue[] = [];

  const [
    activeRes,
    arrivalsRes,
    nullUnitRes,
    duplicateSirvoyRes,
    noContactRes,
    upcomingRes,
    stuckQueueRes,
  ] = await Promise.all([

    // All active / upcoming bookings with guest and unit info
    supabase
      .from("resort_ops_bookings")
      .select("id, check_in, check_out, room_rate, paid_amount, addons_total, checked_in_at, sirvoy_booking_id, resort_ops_guests(full_name, email, phone), resort_ops_units(name)")
      .lte("check_in", in7days)
      .gte("check_out", today)
      .is("checked_out_at", null),

    // Today's arrivals
    supabase
      .from("resort_ops_bookings")
      .select("id, checked_in_at, room_rate, paid_amount, addons_total, resort_ops_guests(full_name), resort_ops_units(name)")
      .eq("check_in", today)
      .is("checked_out_at", null),

    // Bookings with null unit_id (phantom or unresolved room)
    supabase
      .from("resort_ops_bookings")
      .select("id, check_in, check_out, resort_ops_guests(full_name)")
      .is("unit_id", null)
      .gte("check_out", today),

    // Detect duplicate sirvoy_booking_id (same Sirvoy ID, multiple rows)
    supabase
      .from("resort_ops_bookings")
      .select("sirvoy_booking_id")
      .not("sirvoy_booking_id", "is", null)
      .gte("check_out", today),

    // Guests with no email AND no phone on upcoming bookings
    supabase
      .from("resort_ops_bookings")
      .select("id, check_in, resort_ops_guests(id, full_name, email, phone), resort_ops_units(name)")
      .gte("check_in", today)
      .lte("check_in", in7days),

    // Upcoming 7 days with $0 paid (no deposit)
    supabase
      .from("resort_ops_bookings")
      .select("id, check_in, room_rate, paid_amount, platform, resort_ops_guests(full_name), resort_ops_units(name)")
      .gte("check_in", today)
      .lte("check_in", in7days)
      .eq("paid_amount", 0)
      .gt("room_rate", 0),

    // Stalled webhook_events (pending > 1 hour)
    supabase
      .from("webhook_events")
      .select("id, event_type, source, created_at", { count: "exact", head: false })
      .in("status", ["pending", "retry"])
      .lt("created_at", new Date(Date.now() - 3_600_000).toISOString()),
  ]);

  // ── 1. Arrivals not checked in (raised at 15:00 Manila — caller handles timing)
  const arrivals = arrivalsRes.data ?? [];
  const uncheckedArrivals = arrivals.filter((b: any) => !b.checked_in_at);
  for (const b of uncheckedArrivals) {
    issues.push({
      severity: "high",
      title: `No check-in: ${b.resort_ops_guests?.full_name ?? "Unknown"} — ${b.resort_ops_units?.name ?? "?"}`,
      description: `Booking check-in date is today (${today}). Guest has not been checked in. Room rate: ₱${b.room_rate ?? 0}.`,
      telegram_group: "reception",
    });
  }

  // ── 2. Departing today with outstanding balance
  const active = activeRes.data ?? [];
  const departingToday = active.filter((b: any) => b.check_out === today);
  for (const b of departingToday) {
    const balance = (b.room_rate ?? 0) + (b.addons_total ?? 0) - (b.paid_amount ?? 0);
    if (balance > 0) {
      issues.push({
        severity: "high",
        title: `Departing guest owes ₱${Math.round(balance)}: ${b.resort_ops_guests?.full_name ?? "Unknown"} — ${b.resort_ops_units?.name ?? "?"}`,
        description: `Guest checks out today (${today}). Outstanding balance ₱${Math.round(balance)}. Room rate ₱${b.room_rate}, paid ₱${b.paid_amount}.`,
        telegram_group: "reception",
      });
    }
  }

  // ── 3. Bookings with no unit assigned
  const nullUnits = nullUnitRes.data ?? [];
  if (nullUnits.length > 0) {
    issues.push({
      severity: "high",
      title: `${nullUnits.length} booking(s) have no room assigned`,
      description: nullUnits.map((b: any) =>
        `• ${b.resort_ops_guests?.full_name ?? "?"} — check-in ${b.check_in} to ${b.check_out}`
      ).join("\n"),
      telegram_group: "managers",
    });
  }

  // ── 4. Duplicate Sirvoy booking IDs
  const sirvoyRows = (duplicateSirvoyRes.data ?? []) as Array<{ sirvoy_booking_id: number }>;
  const sirvoyCount: Record<number, number> = {};
  for (const r of sirvoyRows) {
    if (r.sirvoy_booking_id) sirvoyCount[r.sirvoy_booking_id] = (sirvoyCount[r.sirvoy_booking_id] ?? 0) + 1;
  }
  const dupes = Object.entries(sirvoyCount).filter(([, count]) => count > 1);
  if (dupes.length > 0) {
    issues.push({
      severity: "high",
      title: `${dupes.length} duplicate Sirvoy booking ID(s) detected`,
      description: dupes.map(([id, count]) => `Sirvoy ID ${id} appears ${count} times`).join("\n") +
        "\nManually review and remove duplicate rows.",
      telegram_group: "managers",
    });
  }

  // ── 5. No guest contact on upcoming bookings
  const upcoming = upcomingRes.data ?? [];
  const noContact = upcoming.filter((b: any) => {
    const g = b.resort_ops_guests;
    return !g?.email && !g?.phone;
  });
  for (const b of noContact) {
    issues.push({
      severity: "medium",
      title: `No contact info: ${b.resort_ops_guests?.full_name ?? "?"} arriving ${b.check_in}`,
      description: `Booking for ${b.resort_ops_units?.name ?? "?"} on ${b.check_in}. Guest has no email or phone on record. Verify via Sirvoy.`,
    });
  }

  // ── 6. Zero-deposit OTA bookings (separate query — upcomingRes used for no-contact check)
  const { data: zeroPaidData } = await supabase
    .from("resort_ops_bookings")
    .select("id, check_in, room_rate, platform, resort_ops_guests(full_name), resort_ops_units(name)")
    .gte("check_in", today)
    .lte("check_in", in7days)
    .eq("paid_amount", 0)
    .gt("room_rate", 0)
    .not("platform", "in", "(Direct,direct)");

  for (const b of (zeroPaidData ?? [])) {
    issues.push({
      severity: "medium",
      title: `No deposit: ${b.resort_ops_guests?.full_name ?? "?"} — ${b.resort_ops_units?.name ?? "?"} (${b.platform}, arriving ${b.check_in})`,
      description: `Room rate ₱${b.room_rate}. Zero payment recorded. OTA platform: ${b.platform}. Confirm deposit status with Sirvoy.`,
    });
  }

  // ── 7. Stalled webhook queue (from index 6 = stuckQueueRes)
  const stuckEvents = stuckQueueRes.data ?? [];
  if (stuckEvents.length > 0) {
    issues.push({
      severity: "medium",
      title: `${stuckEvents.length} booking sync event(s) stuck in queue`,
      description: `Webhook events pending >1 hour. Booking data from PMS may be stale. Manually POST to /functions/v1/process-webhook-queue to drain.`,
      telegram_group: "managers",
    });
  }

  return issues;
}

// ── Claude summary ────────────────────────────────────────────────────────────

async function generateSummary(issues: Issue[]): Promise<string> {
  if (issues.length === 0) return "✅ Reservations healthy. No issues detected.";

  return await callClaude(`You are the reservations coordinator for KAPWA Hospitality OS.

Summarize these booking issues for the resort owner. Plain text only. No markdown.
Bullets use "•". Be direct. Maximum 200 words. Group by severity.
Start with "📋 RESERVATIONS CHECK" on the first line.

Issues:
${JSON.stringify(issues, null, 2)}`, 400);
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
    const supabase = sb();
    const today    = manilaDate(0);
    const issues   = await detectIssues(supabase);

    // Create tasks for each issue
    for (const issue of issues) {
      await createTask(supabase, {
        title:       issue.title,
        description: issue.description,
        category:    "reservations-ai",
        priority:    issue.severity,
        due_date:    today,
      });
    }

    // Immediate Telegram alerts for high-severity issues
    const highIssues = issues.filter(i => i.severity === "high" && i.telegram_group);
    for (const issue of highIssues) {
      await sendTelegram(supabase, issue.telegram_group!, `⚠️ ${issue.title}\n${issue.description}`);
    }

    // Send summary to managers (Claude-generated if issues exist)
    const summary = await generateSummary(issues);
    await sendTelegram(supabase, "managers", summary);

    return new Response(
      JSON.stringify({ ok: true, issues_found: issues.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[reservations-ai]", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
