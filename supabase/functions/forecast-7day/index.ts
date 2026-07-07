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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);
    const endDate = addDays(today, 7);

    // Get total unit count
    const { data: allUnits } = await sb
      .from("resort_ops_units")
      .select("id");
    const totalUnits = allUnits?.length || 1;

    // Get all bookings that overlap with the 7-day window
    const { data: bookings } = await sb
      .from("resort_ops_bookings")
      .select("id, check_in, check_out, room_rate, paid_amount, unit_id, resort_ops_guests(full_name), resort_ops_units(name)")
      .lte("check_in", endDate)
      .gte("check_out", today);

    const forecast = [];

    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const nextDate = addDays(today, i + 1);

      // Bookings active on this date (check_in <= date AND check_out > date)
      const active = (bookings || []).filter(
        (b: any) => b.check_in <= date && b.check_out > date
      );

      // Arrivals on this date
      const arrivals = (bookings || []).filter((b: any) => b.check_in === date);
      // Departures on this date
      const departuresOnDate = (bookings || []).filter((b: any) => b.check_out === date);

      const occupancy = active.length;
      const occupancyPct = Math.round((occupancy / totalUnits) * 100);

      const expectedRevenue = active.reduce((sum: number, b: any) => {
        // Daily rate = room_rate / number of nights
        const nights = Math.max(1, Math.round(
          (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000
        ));
        return sum + (b.room_rate || 0) / nights;
      }, 0);

      const issues: string[] = [];
      if (occupancyPct === 0) issues.push("No bookings");
      if (occupancyPct >= 100) issues.push("Fully booked");

      // Check for unpaid balances
      const unpaidCount = active.filter(
        (b: any) => (b.room_rate || 0) > (b.paid_amount || 0)
      ).length;
      if (unpaidCount > 0) issues.push(`${unpaidCount} unpaid`);

      forecast.push({
        date,
        dayOfWeek: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
        occupancy,
        totalUnits,
        occupancyPct,
        arrivals: arrivals.length,
        departures: departuresOnDate.length,
        expectedRevenue: Math.round(expectedRevenue),
        issues,
      });
    }

    return new Response(JSON.stringify({ forecast, generatedAt: new Date().toISOString() }), {
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
