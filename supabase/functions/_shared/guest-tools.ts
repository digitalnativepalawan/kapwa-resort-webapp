// Guest-facing resort tools.
//
// These run inside the guest-chat edge function with the service role,
// so they can read live ops data. Write operations (create_task, create_request)
// are limited to guest-facing actions only — no payments, no deletions.
//
// Each tool returns { ok, data, empty? } — the guest-chat function injects
// the result into the LLM context so it can formulate a natural response.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function manilaToday(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

// ── check_availability ──────────────────────────────────────────────────────
export async function checkAvailability(
  sb: SupabaseClient,
  checkIn: string,
  checkOut: string,
  unitType?: string,
) {
  let unitsQ = sb.from("resort_ops_units").select("id, name, type, base_price, capacity").eq("active", true);
  if (unitType) unitsQ = unitsQ.ilike("type", `%${unitType}%`);
  const { data: units } = await unitsQ;
  if (!units?.length) return { ok: true as const, data: [], empty: true as const };

  const { data: bookings } = await sb
    .from("resort_ops_bookings")
    .select("unit_id")
    .lt("check_in", checkOut)
    .gt("check_out", checkIn);

  const bookedIds = new Set((bookings || []).map((b: any) => b.unit_id));
  const available = units.filter((u: any) => !bookedIds.has(u.id));
  return {
    ok: true as const,
    data: available.map((u: any) => ({ name: u.name, type: u.type, rate: u.base_price, capacity: u.capacity })),
    empty: available.length === 0,
  };
}

// ── today_arrivals ──────────────────────────────────────────────────────────
export async function todayArrivals(sb: SupabaseClient, targetDate?: string) {
  const d = targetDate || manilaToday();
  const { data } = await sb
    .from("resort_ops_bookings")
    .select("id, adults, children, special_requests, checked_in_at, resort_ops_guests(full_name), resort_ops_units(name)")
    .eq("check_in", d);

  const rows = (data || []).map((r: any) => ({
    guest: (r.resort_ops_guests?.full_name || "Guest").split(" ")[0],
    room: r.resort_ops_units?.name || "Unassigned",
    adults: r.adults,
    children: r.children,
    checked_in: !!r.checked_in_at,
    notes: r.special_requests || null,
  }));
  return { ok: true as const, data: rows, empty: rows.length === 0 };
}

// ── today_departures ────────────────────────────────────────────────────────
export async function todayDepartures(sb: SupabaseClient, targetDate?: string) {
  const d = targetDate || manilaToday();
  const { data } = await sb
    .from("resort_ops_bookings")
    .select("id, checked_out_at, payment_status, resort_ops_guests(full_name), resort_ops_units(name)")
    .eq("check_out", d);

  const rows = (data || []).map((r: any) => ({
    guest: (r.resort_ops_guests?.full_name || "Guest").split(" ")[0],
    room: r.resort_ops_units?.name || "Unassigned",
    checked_out: !!r.checked_out_at,
    payment: r.payment_status || "unknown",
  }));
  return { ok: true as const, data: rows, empty: rows.length === 0 };
}

// ── housekeeping_status ─────────────────────────────────────────────────────
export async function housekeepingStatus(sb: SupabaseClient, unitName: string) {
  const { data } = await sb
    .from("housekeeping_orders")
    .select("status, priority, cleaning_completed_at, inspection_completed_at, created_at")
    .eq("unit_name", unitName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { ok: true as const, data: null, empty: true as const };
  return { ok: true as const, data };
}

// ── find_events ─────────────────────────────────────────────────────────────
export async function findEvents(sb: SupabaseClient, daysAhead = 3) {
  const today = manilaToday();
  const endDate = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);

  const [toursRes, bookingsRes] = await Promise.all([
    sb.from("tours_config").select("name, description, duration, price, max_pax, schedule").eq("active", true),
    sb.from("tour_bookings").select("tour_name, tour_date, pax, status").gte("tour_date", today).lte("tour_date", endDate).neq("status", "cancelled").order("tour_date"),
  ]);

  return {
    ok: true as const,
    data: {
      available_tours: toursRes.data || [],
      upcoming: bookingsRes.data || [],
    },
    empty: !(toursRes.data?.length),
  };
}

// ── weather_lookup ──────────────────────────────────────────────────────────
export async function weatherLookup() {
  const apiKey = Deno.env.get("WEATHER_API_KEY");
  const lat = Deno.env.get("RESORT_LAT") || "10.5333";
  const lon = Deno.env.get("RESORT_LON") || "119.2500";

  if (!apiKey) return { ok: false as const, error: "Weather API not configured" };

  try {
    const resp = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`,
    );
    if (!resp.ok) throw new Error(`Weather API ${resp.status}`);
    const d = await resp.json();
    return {
      ok: true as const,
      data: {
        condition: d.weather?.[0]?.description || "unknown",
        temp_c: Math.round(d.main?.temp ?? 0),
        feels_like_c: Math.round(d.main?.feels_like ?? 0),
        rain: !!d.rain?.["1h"],
        wind_kph: Math.round((d.wind?.speed ?? 0) * 3.6),
      },
    };
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }
}

// ── faq_lookup ──────────────────────────────────────────────────────────────
export async function faqLookup(sb: SupabaseClient, question: string) {
  const { data: rows } = await sb
    .from("guest_faq_memory")
    .select("question, answer, keywords, active")
    .eq("active", true);

  if (!rows?.length) return { ok: true as const, data: null, empty: true as const };

  const q = question.toLowerCase();
  let bestScore = 0;
  let best: any = null;

  for (const row of rows) {
    let score = 0;
    const kws = String(row.keywords || "").split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
    for (const kw of kws) {
      if (q.includes(kw)) score += 3;
    }
    const qWords = new Set(q.split(/\s+/));
    const faqWords = new Set(row.question.toLowerCase().split(/\s+/));
    for (const w of faqWords) {
      if (qWords.has(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  if (!best || bestScore === 0) return { ok: true as const, data: null, empty: true as const };
  return { ok: true as const, data: { answer: best.answer, question: best.question } };
}

// ── guest_notes ─────────────────────────────────────────────────────────────
export async function guestNotes(sb: SupabaseClient, bookingId?: string, unitName?: string) {
  let q = sb.from("guest_notes").select("content, note_type, created_by, created_at").order("created_at", { ascending: false }).limit(10);
  if (bookingId) q = q.eq("booking_id", bookingId);
  if (unitName) q = q.eq("unit_name", unitName);
  const { data } = await q;
  return { ok: true as const, data: data || [], empty: !data?.length };
}

// ── create_guest_request ────────────────────────────────────────────────────
export async function createGuestRequest(
  sb: SupabaseClient,
  req: { booking_id: string; room_id: string; guest_name: string; request_type: string; details: string },
) {
  const { data, error } = await sb
    .from("guest_requests")
    .insert({ ...req, status: "pending" })
    .select("id")
    .single();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, data: { id: data.id, message: "Request submitted. Staff will assist shortly." } };
}

// ── Intent detection ────────────────────────────────────────────────────────
// Keyword-based: fast, reliable, no LLM tool-calling overhead.

interface DetectedTool {
  tool: string;
  params: Record<string, string>;
}

export function detectIntent(message: string): DetectedTool | null {
  const m = message.toLowerCase();

  // check_availability: "is room X available", "availability for dec 25", "available on"
  const availMatch = m.match(/(?:available|availability|vacant|free)\s*(?:on|for|room)?\s*(.+)/i)
    || m.match(/(?:is|are)\s+(?:room\s+)?(\S+)\s+(?:available|free|vacant)/i);
  if (availMatch) {
    const dateMatch = m.match(/(\d{4}-\d{2}-\d{2})/);
    return { tool: "check_availability", params: { check_in: dateMatch?.[1] || manilaToday(), check_out: dateMatch?.[1] || manilaToday() } };
  }

  // today_arrivals: "who's checking in", "arrivals today", "anyone arriving"
  if (/(?:checking\s+in|arrivals?|arriving|arrived)\s*(?:today)?/i.test(m)) {
    return { tool: "today_arrivals", params: {} };
  }

  // today_departures: "who's checking out", "departures today"
  if (/(?:checking\s+out|departures?|leaving|departure)\s*(?:today)?/i.test(m)) {
    return { tool: "today_departures", params: {} };
  }

  // housekeeping_status: "is my room cleaned", "housekeeping status", "room clean"
  if (/(?:housekeep|clean|cleaned|tidied|room\s+status)/i.test(m)) {
    return { tool: "housekeeping_status", params: {} };
  }

  // find_events: "what tours", "available activities", "what can we do"
  if (/(?:tours?|activities|excursions?|what\s+can\s+(?:we|i)\s+do|things?\s+to\s+do)/i.test(m)) {
    return { tool: "find_events", params: {} };
  }

  // weather_lookup: "weather", "rain", "temperature", "forecast"
  if (/(?:weather|rain|temperature|forecast|sunny|cloudy|typhoon)/i.test(m)) {
    return { tool: "weather_lookup", params: {} };
  }

  // faq_lookup: anything that looks like a question about resort operations
  if (/(?:what\s+time|how\s+(?:much|do|long)|where\s+is|can\s+(?:we|i)|is\s+there|do\s+you|does\s+the)/i.test(m)) {
    return { tool: "faq_lookup", params: { question: message } };
  }

  // create_guest_request: explicit requests
  if (/(?:i\s+(?:need|want|would\s+like)|can\s+(?:you|we)\s+(?:get|bring|send|have)|request|towel|pillow|extra|maintenance|fix|repair|broken)/i.test(m)) {
    return { tool: "create_guest_request", params: { request_type: "General", details: message } };
  }

  return null;
}

// ── Tool executor ───────────────────────────────────────────────────────────
export async function executeTool(
  sb: SupabaseClient,
  detected: DetectedTool,
  guestContext?: { booking_id?: string; room_id?: string; guest_name?: string; room_name?: string },
): Promise<{ ok: boolean; data?: any; error?: string }> {
  switch (detected.tool) {
    case "check_availability":
      return checkAvailability(sb, detected.params.check_in, detected.params.check_out, detected.params.unit_type);
    case "today_arrivals":
      return todayArrivals(sb);
    case "today_departures":
      return todayDepartures(sb);
    case "housekeeping_status":
      return housekeepingStatus(sb, guestContext?.room_name || detected.params.unit_name || "");
    case "find_events":
      return findEvents(sb);
    case "weather_lookup":
      return weatherLookup();
    case "faq_lookup":
      return faqLookup(sb, detected.params.question || "");
    case "create_guest_request": {
      if (!guestContext?.booking_id || !guestContext?.room_id || !guestContext?.guest_name) {
        return { ok: false, error: "Guest session required to submit a request." };
      }
      return createGuestRequest(sb, {
        booking_id: guestContext.booking_id,
        room_id: guestContext.room_id,
        guest_name: guestContext.guest_name,
        request_type: detected.params.request_type || "General",
        details: detected.params.details || "",
      });
    }
    default:
      return { ok: false, error: `Unknown tool: ${detected.tool}` };
  }
}
