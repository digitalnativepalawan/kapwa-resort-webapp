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

    const { data: orders } = await sb
      .from("orders")
      .select("id, guest_name, items, status, created_at, order_type, location_detail, room_id, units(unit_name)")
      .gte("created_at", `${today}T00:00:00`)
      .in("status", ["New", "Preparing", "Served"]);

    const statusMap: Record<string, string> = {
      New: "pending",
      Preparing: "preparing",
      Served: "served",
    };

    const result = {
      orders: (orders || []).map((o: any) => {
        const itemNames = Array.isArray(o.items)
          ? o.items.map((i: any) => i.name || i.item_name || String(i))
          : [];
        const room = o.units?.unit_name || o.location_detail || o.order_type || "—";
        return {
          id: o.id,
          room_or_table: room,
          items: itemNames,
          status: statusMap[o.status] || o.status.toLowerCase(),
          timestamp: o.created_at,
        };
      }),
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
