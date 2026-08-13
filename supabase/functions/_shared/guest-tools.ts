// Guest-facing resort tools.
//
// These run inside the guest-chat edge function with the service role,
// so they can read AND write live ops data. Write operations are limited to
// guest-facing actions — no payments, no deletions, no staff data.
//
// Each tool returns { ok, data, empty? } — the guest-chat function injects
// the result into the LLM context so it can formulate a natural response.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function manilaToday(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

function parseFoodOrder(text: string): Array<{ name: string; qty: number; price: number; department: string }> {
  // Simple parser: extracts common food items and quantities from natural language
  // TODO: In production, this should query a menu_items table
  const items: Array<{ name: string; qty: number; price: number; department: string }> = [];
  const lower = text.toLowerCase();

  // Common menu items with approximate prices and departments
  const menu: Record<string, { price: number; dept: string }> = {
    "sinigang": { price: 280, dept: "kitchen" },
    "adobo": { price: 250, dept: "kitchen" },
    "kare-kare": { price: 320, dept: "kitchen" },
    "lechon": { price: 350, dept: "kitchen" },
    "grilled fish": { price: 300, dept: "kitchen" },
    "fresh fish": { price: 300, dept: "kitchen" },
    "prawn": { price: 380, dept: "kitchen" },
    "shrimp": { price: 380, dept: "kitchen" },
    "rice": { price: 50, dept: "kitchen" },
    "garlic rice": { price: 60, dept: "kitchen" },
    "fried rice": { price: 70, dept: "kitchen" },
    "noodles": { price: 180, dept: "kitchen" },
    "pancit": { price: 180, dept: "kitchen" },
    "lumpia": { price: 150, dept: "kitchen" },
    "halo-halo": { price: 120, dept: "bar" },
    "coffee": { price: 80, dept: "bar" },
    "juice": { price: 80, dept: "bar" },
    "water": { price: 30, dept: "bar" },
    "beer": { price: 80, dept: "bar" },
    "san miguel": { price: 80, dept: "bar" },
    "soft drinks": { price: 50, dept: "bar" },
    "coke": { price: 50, dept: "bar" },
    "sprite": { price: 50, dept: "bar" },
    "tea": { price: 60, dept: "bar" },
    "mango shake": { price: 100, dept: "bar" },
    "smoothie": { price: 120, dept: "bar" },
    "tropical juice": { price: 90, dept: "bar" },
  };

  // Try to match items from the text
  for (const [item, info] of Object.entries(menu)) {
    if (lower.includes(item)) {
      // Check for quantity prefix like "2 sinigang" or "two beers"
      const qtyMatch = lower.match(new RegExp(`(\\d+|two|three|four|five|six)\\s+${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));
      let qty = 1;
      if (qtyMatch) {
        const num = qtyMatch[1];
        qty = /^\d+$/.test(num) ? parseInt(num, 10) : { two: 2, three: 3, four: 4, five: 5, six: 6 }[num] || 1;
      }
      items.push({ name: item, qty, price: info.price, department: info.dept });
    }
  }

  // If no items matched, add a generic placeholder
  if (!items.length) {
    items.push({ name: text.slice(0, 80), qty: 1, price: 0, dept: "kitchen" });
  }

  return items;
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

// ── extend_booking ──────────────────────────────────────────────────────────
// Extends the guest's current booking by N nights. Calculates new checkout
// date and total. Does NOT process payment — charges to room bill.
export async function extendBooking(
  sb: SupabaseClient,
  bookingId: string,
  extraNights: number,
) {
  if (extraNights < 1 || extraNights > 30) {
    return { ok: false as const, error: "Extension must be 1-30 nights." };
  }

  // Fetch current booking
  const { data: booking, error: fetchErr } = await sb
    .from("resort_ops_bookings")
    .select("id, check_out, room_rate, addons_total, unit_id, resort_ops_units(name, base_price)")
    .eq("id", bookingId)
    .single();

  if (fetchErr || !booking) return { ok: false as const, error: "Booking not found." };

  const currentCheckout = new Date(booking.check_out + "T00:00:00");
  const newCheckout = new Date(currentCheckout.getTime() + extraNights * 86400000);
  const newCheckoutStr = newCheckout.toISOString().slice(0, 10);

  // Check no overlapping booking exists for this unit
  const { data: conflicts } = await sb
    .from("resort_ops_bookings")
    .select("id")
    .eq("unit_id", booking.unit_id)
    .neq("id", bookingId)
    .lt("check_in", newCheckoutStr)
    .gt("check_out", booking.check_out);

  if (conflicts?.length) {
    return { ok: false as const, error: "Cannot extend — another booking is already confirmed for those dates." };
  }

  // Calculate additional charge
  const nightlyRate = booking.room_rate || booking.resort_ops_units?.base_price || 0;
  const additionalCharge = nightlyRate * extraNights;

  // Update checkout and addons_total
  const newAddons = (booking.addons_total || 0) + additionalCharge;
  const { error: updateErr } = await sb
    .from("resort_ops_bookings")
    .update({
      check_out: newCheckoutStr,
      addons_total: newAddons,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (updateErr) return { ok: false as const, error: updateErr.message };

  return {
    ok: true as const,
    data: {
      message: `Extended by ${extraNights} night${extraNights > 1 ? "s" : ""}. New checkout: ${newCheckoutStr}. ₱${additionalCharge.toLocaleString()} added to your bill.`,
      new_checkout: newCheckoutStr,
      extra_nights: extraNights,
      additional_charge: additionalCharge,
    },
  };
}

// ── book_tour ───────────────────────────────────────────────────────────────
// Creates a pending tour booking. Staff confirms before charging.
export async function bookTour(
  sb: SupabaseClient,
  params: {
    booking_id: string;
    guest_name: string;
    room_id: string;
    tour_name: string;
    tour_date: string;
    pax: number;
    pickup_time?: string;
    notes?: string;
  },
) {
  // Look up tour price from tours_config
  const { data: tour } = await sb
    .from("tours_config")
    .select("id, name, price, max_pax")
    .ilike("name", `%${params.tour_name}%`)
    .eq("active", true)
    .single();

  if (!tour) return { ok: false as const, error: `Tour "${params.tour_name}" not found or inactive.` };
  if (params.pax > (tour.max_pax || 20)) {
    return { ok: false as const, error: `Maximum ${tour.max_pax} guests for this tour.` };
  }

  const totalPrice = tour.price * params.pax;

  const { data, error } = await sb
    .from("tour_bookings")
    .insert({
      booking_id: params.booking_id,
      guest_name: params.guest_name,
      tour_name: tour.name,
      tour_date: params.tour_date,
      pax: params.pax,
      price: totalPrice,
      room_id: params.room_id,
      status: "pending",
      pickup_time: params.pickup_time || "07:00",
      notes: params.notes || "",
    })
    .select("id, tour_name, tour_date, pax, price, status")
    .single();

  if (error) return { ok: false as const, error: error.message };

  return {
    ok: true as const,
    data: {
      message: `Tour booked! ${tour.name} on ${params.tour_date} for ${params.pax} pax. Total: ₱${totalPrice.toLocaleString()}. Staff will confirm shortly.`,
      booking_id: data.id,
      tour: tour.name,
      date: params.tour_date,
      pax: params.pax,
      total: totalPrice,
      status: "pending",
    },
  };
}

// ── order_food ──────────────────────────────────────────────────────────────
// Creates a food/drink order routed to kitchen or bar. Status starts as "New".
export async function orderFood(
  sb: SupabaseClient,
  params: {
    booking_id: string;
    room_id: string;
    guest_name: string;
    room_name: string;
    items: Array<{ name: string; qty: number; price: number; department: string }>;
    order_type?: string;
    notes?: string;
  },
) {
  if (!params.items?.length) return { ok: false as const, error: "No items provided." };

  const subtotal = params.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const serviceCharge = Math.round(subtotal * 0.10);
  const total = subtotal + serviceCharge;

  // Determine primary department
  const hasKitchen = params.items.some((i) => i.department === "kitchen");
  const hasBar = params.items.some((i) => i.department === "bar");

  const { data, error } = await sb
    .from("orders")
    .insert({
      order_type: params.order_type || "Room",
      location_detail: params.room_name,
      room_id: params.room_id,
      guest_name: params.guest_name,
      items: params.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, department: i.department })),
      total: subtotal,
      service_charge: serviceCharge,
      status: "New",
      payment_type: "Charge to Room",
      kitchen_status: hasKitchen ? "pending" : "ready",
      bar_status: hasBar ? "pending" : "ready",
      staff_name: "Guest Self-Service",
    })
    .select("id, status, total, service_charge")
    .single();

  if (error) return { ok: false as const, error: error.message };

  const itemSummary = params.items.map((i) => `${i.qty}x ${i.name}`).join(", ");
  return {
    ok: true as const,
    data: {
      message: `Order placed! ${itemSummary}. Total: ₱${total.toLocaleString()} (incl. 10% SC). Charged to your room. ${hasKitchen ? "Kitchen" : ""}${hasKitchen && hasBar ? " + " : ""}${hasBar ? "Bar" : ""} is preparing it now.`,
      order_id: data.id,
      items: itemSummary,
      subtotal,
      service_charge: serviceCharge,
      total,
      status: "New",
    },
  };
}

// ── request_transport ───────────────────────────────────────────────────────
export async function requestTransport(
  sb: SupabaseClient,
  params: {
    booking_id: string;
    room_id: string;
    guest_name: string;
    route: string;
    date: string;
    time: string;
  },
) {
  const details = `Transport: ${params.route} — ${params.date} ${params.time}`;
  return createGuestRequest(sb, {
    booking_id: params.booking_id,
    room_id: params.room_id,
    guest_name: params.guest_name,
    request_type: "Transport",
    details,
  });
}

// ── request_rental ──────────────────────────────────────────────────────────
export async function requestRental(
  sb: SupabaseClient,
  params: {
    booking_id: string;
    room_id: string;
    guest_name: string;
    item: string;
    duration: string;
    qty: number;
  },
) {
  const details = `Rental: ${params.item} — ${params.duration} × ${params.qty}`;
  return createGuestRequest(sb, {
    booking_id: params.booking_id,
    room_id: params.room_id,
    guest_name: params.guest_name,
    request_type: "Rental",
    details,
  });
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

  // extend_booking: "extend stay", "add nights", "stay longer", "extend my booking"
  if (/(?:extend|add\s+night|stay\s+longer|prolong|extra\s+night|additional\s+night)/i.test(m)) {
    const nightMatch = m.match(/(\d+)\s*night/) || m.match(/for\s+(\d+)/);
    const nights = parseInt(nightMatch?.[1] || "1", 10);
    return { tool: "extend_booking", params: { extra_nights: String(nights) } };
  }

  // book_tour: "book a tour", "reserve tour", "sign up for honda bay", "i want to join"
  if (/(?:book\s+(?:a\s+)?tour|reserve\s+(?:a\s+)?tour|sign\s+up|join\s+(?:a\s+)?tour|want\s+(?:to\s+)?(?:do|join|book)|scheduled\s+tours)/i.test(m)) {
    const tourMatch = m.match(/(?:tour|book)\s+(?:for\s+)?(.+?)(?:\s+on\s+|\s+for\s+|\s+tomorrow|\s+today|\s+\d)/i)
      || m.match(/(?:honda\s+bay|island\s+hopping|firefly|snorkeling|diving)/i);
    const dateMatch = m.match(/(\d{4}-\d{2}-\d{2})/);
    const paxMatch = m.match(/(\d+)\s*(?:pax|guests?|people|person|ppl)/i);
    return {
      tool: "book_tour",
      params: {
        tour_name: tourMatch?.[1]?.trim() || tourMatch?.[0]?.trim() || "",
        tour_date: dateMatch?.[1] || manilaToday(),
        pax: paxMatch?.[1] || "2",
      },
    };
  }

  // order_food: "order food", "can i get", "i want food", "deliver", "bring me"
  if (/(?:order\s+(?:food|drinks?|meal|lunch|dinner|breakfast|snack|beer|coffee)|can\s+(?:i|we)\s+get|i\s+want\s+(?:to\s+order|food|drinks?)|deliver|bring\s+me|send\s+(?:up|over))/i.test(m)) {
    return {
      tool: "order_food",
      params: { items_description: message },
    };
  }

  // request_transport: "transport", "airport", "tricycle", "van", "ride", "shuttle"
  if (/(?:transport|airport|tricycle|van\s+(?:to|ride)|ride\s+to|shuttle|bring\s+(?:me\s+)?to|pick\s+(?:me\s+)?up)/i.test(m)) {
    return {
      tool: "request_transport",
      params: { route: message },
    };
  }

  // request_rental: "rent", "rental", "motorcycle", "bike", "kayak", "paddleboard"
  if (/(?:rent(?:al)?|motorcycle|bike|kayak|paddleboard|snorkel(?:ing)?\s+gear)/i.test(m)) {
    return {
      tool: "request_rental",
      params: { item: message },
    };
  }

  // create_guest_request: explicit requests (towels, pillows, maintenance, etc.)
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
    case "extend_booking": {
      if (!guestContext?.booking_id) {
        return { ok: false, error: "Guest session required to extend booking." };
      }
      const nights = parseInt(detected.params.extra_nights || "1", 10);
      return extendBooking(sb, guestContext.booking_id, nights);
    }
    case "book_tour": {
      if (!guestContext?.booking_id || !guestContext?.room_id || !guestContext?.guest_name) {
        return { ok: false, error: "Guest session required to book a tour." };
      }
      return bookTour(sb, {
        booking_id: guestContext.booking_id,
        guest_name: guestContext.guest_name,
        room_id: guestContext.room_id,
        tour_name: detected.params.tour_name || "",
        tour_date: detected.params.tour_date || manilaToday(),
        pax: parseInt(detected.params.pax || "2", 10),
      });
    }
    case "order_food": {
      if (!guestContext?.booking_id || !guestContext?.room_id || !guestContext?.guest_name || !guestContext?.room_name) {
        return { ok: false, error: "Guest session required to place an order." };
      }
      // Parse items from the message — LLM will refine this in the response
      const itemsDesc = detected.params.items_description || "";
      const parsedItems = parseFoodOrder(itemsDesc);
      if (!parsedItems.length) {
        return { ok: false, error: "Could not parse order items. Please specify what you'd like to order." };
      }
      return orderFood(sb, {
        booking_id: guestContext.booking_id,
        room_id: guestContext.room_id,
        guest_name: guestContext.guest_name,
        room_name: guestContext.room_name,
        items: parsedItems,
      });
    }
    case "request_transport": {
      if (!guestContext?.booking_id || !guestContext?.room_id || !guestContext?.guest_name) {
        return { ok: false, error: "Guest session required for transport request." };
      }
      return requestTransport(sb, {
        booking_id: guestContext.booking_id,
        room_id: guestContext.room_id,
        guest_name: guestContext.guest_name,
        route: detected.params.route || "",
        date: detected.params.date || manilaToday(),
        time: detected.params.time || "10:00",
      });
    }
    case "request_rental": {
      if (!guestContext?.booking_id || !guestContext?.room_id || !guestContext?.guest_name) {
        return { ok: false, error: "Guest session required for rental request." };
      }
      return requestRental(sb, {
        booking_id: guestContext.booking_id,
        room_id: guestContext.room_id,
        guest_name: guestContext.guest_name,
        item: detected.params.item || "",
        duration: detected.params.duration || "1 day",
        qty: parseInt(detected.params.qty || "1", 10),
      });
    }
    default:
      return { ok: false, error: `Unknown tool: ${detected.tool}` };
  }
}
