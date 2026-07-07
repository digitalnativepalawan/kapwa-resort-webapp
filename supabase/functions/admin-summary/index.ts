import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  // Fail-closed authorization: this endpoint runs with the service-role key and
  // returns sensitive financial/operational data, so it must never be publicly
  // callable. Callers (cron jobs, dashboards) must present the shared secret.
  const secret = Deno.env.get("INTERNAL_FN_SECRET");
  if (!secret || req.headers.get("x-internal-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const sb = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    // Revenue: closed orders today
    const { data: closedOrders } = await sb
      .from("orders")
      .select("total, closed_at")
      .eq("status", "Closed")
      .gte("closed_at", `${today}T00:00:00`);

    const totalRevenueToday = (closedOrders || []).reduce(
      (sum: number, o: any) => sum + (o.total || 0), 0
    );

    // Active bookings spanning today
    const { data: activeBookings } = await sb
      .from("resort_ops_bookings")
      .select("id, room_rate, paid_amount, guest_id, unit_id, resort_ops_guests(full_name), resort_ops_units(name)")
      .lte("check_in", today)
      .gt("check_out", today)
      .is("checked_out_at", null);

    const unpaidBookings = (activeBookings || []).filter(
      (b: any) => (b.room_rate || 0) > (b.paid_amount || 0)
    );
    const unpaidBalances = unpaidBookings.reduce(
      (sum: number, b: any) => sum + ((b.room_rate || 0) - (b.paid_amount || 0)), 0
    );

    // Occupancy
    const { data: allUnits } = await sb
      .from("resort_ops_units")
      .select("id");
    const totalUnits = allUnits?.length || 1;
    const occupancyRate = Math.round(((activeBookings || []).length / totalUnits) * 100);

    // Alerts
    const alerts = unpaidBookings.map((b: any) => {
      const guest = b.resort_ops_guests?.full_name || "Unknown";
      const room = b.resort_ops_units?.name || "—";
      return `Unpaid: ${room} (${guest})`;
    });

    const result = {
      total_revenue_today: Math.round(totalRevenueToday),
      unpaid_balances: Math.round(unpaidBalances),
      occupancy_rate: occupancyRate,
      alerts,
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
