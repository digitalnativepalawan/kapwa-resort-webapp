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

    const { data: arrivals } = await sb
      .from("resort_ops_bookings")
      .select("id, resort_ops_guests(full_name), resort_ops_units(name)")
      .eq("check_in", today)
      .is("checked_out_at", null);

    const { data: departures } = await sb
      .from("resort_ops_bookings")
      .select("id, resort_ops_guests(full_name), resort_ops_units(name)")
      .eq("check_out", today);

    const { data: inHouse } = await sb
      .from("resort_ops_bookings")
      .select("id, resort_ops_guests(full_name), resort_ops_units(name)")
      .lte("check_in", today)
      .gt("check_out", today)
      .not("checked_in_at", "is", null)
      .is("checked_out_at", null);

    const { data: units } = await sb
      .from("units")
      .select("id, unit_name, status");

    let available = 0, occupied = 0, dirty = 0;
    for (const u of units || []) {
      const s = (u.status || "").toLowerCase();
      if (s === "ready" || s === "available") available++;
      else if (s === "occupied") occupied++;
      else if (s === "needs_cleaning" || s === "dirty" || s === "to_clean") dirty++;
    }

    const fmt = (b: any) => ({
      guest: b.resort_ops_guests?.full_name || "Unknown",
      room: b.resort_ops_units?.name || "—",
    });

    const result = {
      arrivals: (arrivals || []).map(fmt),
      departures: (departures || []).map(fmt),
      in_house: (inHouse || []).map(fmt),
      room_status: { available, occupied, dirty },
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
