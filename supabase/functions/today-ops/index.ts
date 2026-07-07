import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    // Arrivals: bookings checking in today
    const { data: arrivals } = await sb
      .from("resort_ops_bookings")
      .select("id, check_in, check_out, room_rate, paid_amount, platform, guest_id, unit_id, resort_ops_guests(full_name), resort_ops_units(name)")
      .eq("check_in", today)
      .is("checked_out_at", null);

    // Departures: bookings checking out today
    const { data: departures } = await sb
      .from("resort_ops_bookings")
      .select("id, check_in, check_out, room_rate, paid_amount, platform, guest_id, unit_id, resort_ops_guests(full_name), resort_ops_units(name)")
      .eq("check_out", today);

    // All units
    const { data: allUnits } = await sb
      .from("resort_ops_units")
      .select("id, name");

    // Active bookings (checked in, not checked out, spanning today)
    const { data: activeBookings } = await sb
      .from("resort_ops_bookings")
      .select("id, unit_id")
      .lte("check_in", today)
      .gt("check_out", today)
      .is("checked_out_at", null);

    const occupiedUnitIds = new Set((activeBookings || []).map((b: any) => b.unit_id).filter(Boolean));
    const units = allUnits || [];

    const occupiedRooms = units.filter((u: any) => occupiedUnitIds.has(u.id));
    const availableRooms = units.filter((u: any) => !occupiedUnitIds.has(u.id));

    // Room status from local units table
    const { data: localUnits } = await sb
      .from("units")
      .select("id, unit_name, status");

    const readyRooms: any[] = [];
    const toCleanRooms: any[] = [];
    for (const u of localUnits || []) {
      const mapped = { id: u.id, name: u.unit_name };
      if (u.status === "ready" || u.status === "available") readyRooms.push(mapped);
      else if (u.status === "needs_cleaning" || u.status === "dirty") toCleanRooms.push(mapped);
    }

    // Pending orders
    const { data: pendingOrders } = await sb
      .from("orders")
      .select("id, guest_name, status, total, created_at")
      .in("status", ["New", "Preparing"]);

    // Unpaid reservations: bookings where paid < rate
    const { data: allCurrentBookings } = await sb
      .from("resort_ops_bookings")
      .select("id, room_rate, paid_amount, guest_id, unit_id, resort_ops_guests(full_name), resort_ops_units(name)")
      .lte("check_in", today)
      .gte("check_out", today);

    const unpaidReservations = (allCurrentBookings || [])
      .filter((b: any) => (b.room_rate || 0) > (b.paid_amount || 0))
      .map((b: any) => ({
        id: b.id,
        guest: b.resort_ops_guests?.full_name || "Unknown",
        room: b.resort_ops_units?.name || "—",
        rate: b.room_rate || 0,
        paid: b.paid_amount || 0,
        balance: (b.room_rate || 0) - (b.paid_amount || 0),
      }));

    const formatBooking = (b: any) => ({
      id: b.id,
      guest: b.resort_ops_guests?.full_name || "Unknown",
      room: b.resort_ops_units?.name || "—",
      platform: b.platform || "Direct",
      paid: b.paid_amount || 0,
      rate: b.room_rate || 0,
    });

    const result = {
      date: today,
      arrivals: (arrivals || []).map(formatBooking),
      departures: (departures || []).map(formatBooking),
      availableRooms: availableRooms.map((u: any) => ({ id: u.id, name: u.name })),
      occupiedRooms: occupiedRooms.map((u: any) => ({ id: u.id, name: u.name })),
      readyRooms,
      toCleanRooms,
      pendingOrders: (pendingOrders || []).map((o: any) => ({
        id: o.id,
        guest: o.guest_name,
        status: o.status,
        total: o.total,
        created_at: o.created_at,
      })),
      unpaidReservations,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
