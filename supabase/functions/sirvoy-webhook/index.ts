import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_MAP: Record<string, string> = {
  "front desk": "Direct",
  "booking.com": "Booking.com",
  airbnb: "Airbnb",
  agoda: "Agoda",
  website: "Website",
  direct: "Direct",
};

function mapPlatform(source: string): string {
  return PLATFORM_MAP[source.toLowerCase().trim()] || source;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/** Dynamically resolve or create a resort_ops_unit by room name */
async function resolveUnitId(sb: any, roomName: string): Promise<string | null> {
  if (!roomName) return null;
  const key = roomName.toLowerCase().trim();

  // Try exact match first
  const { data: existing } = await sb.from("resort_ops_units")
    .select("id").ilike("name", key).maybeSingle();
  if (existing) return existing.id;

  // Auto-create the unit
  const { data: created, error } = await sb.from("resort_ops_units")
    .insert({ name: roomName.trim(), type: "room", capacity: 2 })
    .select("id").single();
  if (error || !created) {
    console.error("Failed to create unit for room:", roomName, error?.message);
    return null;
  }
  return created.id;
}

Deno.serve(async (req) => {
  // Health check
  if (req.method === "GET") {
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { event, bookingId, guest, rooms, bookingSource, guestReference,
      totalPriceIncludingSurcharges, payments } = body;

    if (!event || !bookingId) {
      return new Response(JSON.stringify({ error: "Missing event or bookingId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sb = getSupabaseAdmin();

    // --- CANCELED: delete bookings ---
    if (event === "canceled") {
      await sb.from("resort_ops_bookings").delete().eq("sirvoy_booking_id", bookingId);
      return new Response(JSON.stringify({ ok: true, action: "canceled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- NEW / MODIFIED / RESTORED ---
    if (!guest || !rooms || rooms.length === 0) {
      return new Response(JSON.stringify({ error: "Missing guest or rooms" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const fullName = `${guest.firstName || ""} ${guest.lastName || ""}`.trim();
    const guestMessage = guest.message || "";

    // Upsert guest by sirvoy_guest_ref or name
    let guestId: string | null = null;

    if (guestReference) {
      const { data: existingByRef } = await sb.from("resort_ops_guests")
        .select("id").eq("sirvoy_guest_ref", guestReference).maybeSingle();
      if (existingByRef) {
        guestId = existingByRef.id;
        await sb.from("resort_ops_guests").update({
          full_name: fullName,
          phone: guest.phone || null,
          email: guest.email || null,
        }).eq("id", guestId);
      }
    }

    if (!guestId) {
      // Try match by name
      const { data: existingByName } = await sb.from("resort_ops_guests")
        .select("id").ilike("full_name", fullName).maybeSingle();
      if (existingByName) {
        guestId = existingByName.id;
        await sb.from("resort_ops_guests").update({
          phone: guest.phone || null,
          email: guest.email || null,
          sirvoy_guest_ref: guestReference || null,
        }).eq("id", guestId);
      }
    }

    if (!guestId) {
      const { data: newGuest, error: gErr } = await sb.from("resort_ops_guests")
        .insert({
          full_name: fullName,
          phone: guest.phone || null,
          email: guest.email || null,
          sirvoy_guest_ref: guestReference || null,
        }).select("id").single();
      if (gErr || !newGuest) {
        return new Response(JSON.stringify({ error: "Failed to create guest", detail: gErr?.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      guestId = newGuest.id;
    }

    // For modified/restored, delete existing bookings first then re-create
    if (event === "modified" || event === "restored") {
      await sb.from("resort_ops_bookings").delete().eq("sirvoy_booking_id", bookingId);
    }

    // Calculate totals
    const totalRoomCost = rooms.reduce((sum: number, r: any) => sum + (r.roomTotal || 0), 0);
    const addonsTotal = Math.max(0, (totalPriceIncludingSurcharges || 0) - totalRoomCost);
    const totalPaid = (payments || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const platform = mapPlatform(bookingSource || "");

    // Create one booking per room
    const bookingRows = [];
    for (const room of rooms) {
      const roomRate = room.roomTotal || 0;
      const proportion = totalRoomCost > 0 ? roomRate / totalRoomCost : 1 / rooms.length;
      const unitId = await resolveUnitId(sb, room.RoomName || "");

      bookingRows.push({
        sirvoy_booking_id: bookingId,
        guest_id: guestId,
        unit_id: unitId,
        platform,
        check_in: room.arrivalDate,
        check_out: room.departureDate,
        adults: room.adults || 1,
        room_rate: roomRate,
        addons_total: Math.round(addonsTotal * proportion * 100) / 100,
        paid_amount: Math.round(totalPaid * proportion * 100) / 100,
        notes: guestMessage,
      });
    }

    const { error: insertErr } = await sb.from("resort_ops_bookings").insert(bookingRows);
    if (insertErr) {
      return new Response(JSON.stringify({ error: "Failed to insert bookings", detail: insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, action: event, rooms: bookingRows.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid request", detail: String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
