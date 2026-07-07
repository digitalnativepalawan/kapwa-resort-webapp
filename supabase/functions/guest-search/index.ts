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
    const url = new URL(req.url);
    const name = url.searchParams.get("name")?.trim();

    if (!name || name.length < 2) {
      return new Response(JSON.stringify({ results: [], message: "Query must be at least 2 characters" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = getSupabaseAdmin();

    // Search guests by name (case-insensitive partial match)
    const { data: guests } = await sb
      .from("resort_ops_guests")
      .select("id, full_name, email, phone")
      .ilike("full_name", `%${name}%`)
      .limit(20);

    if (!guests || guests.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For each guest, fetch their bookings
    const results = [];
    for (const guest of guests) {
      const { data: bookings } = await sb
        .from("resort_ops_bookings")
        .select("id, check_in, check_out, room_rate, paid_amount, platform, addons_total, resort_ops_units(name)")
        .eq("guest_id", guest.id)
        .order("check_in", { ascending: false })
        .limit(10);

      const totalSpent = (bookings || []).reduce(
        (sum: number, b: any) => sum + (b.room_rate || 0) + (b.addons_total || 0),
        0
      );
      const totalPaid = (bookings || []).reduce(
        (sum: number, b: any) => sum + (b.paid_amount || 0),
        0
      );

      results.push({
        id: guest.id,
        name: guest.full_name,
        email: guest.email,
        phone: guest.phone,
        totalBookings: (bookings || []).length,
        totalSpent,
        totalPaid,
        balance: totalSpent - totalPaid,
        bookings: (bookings || []).map((b: any) => ({
          id: b.id,
          checkIn: b.check_in,
          checkOut: b.check_out,
          room: b.resort_ops_units?.name || "—",
          rate: b.room_rate || 0,
          addons: b.addons_total || 0,
          paid: b.paid_amount || 0,
          platform: b.platform || "Direct",
        })),
      });
    }

    return new Response(JSON.stringify({ results }), {
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
