import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = 3;
const BATCH_SIZE = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Fetch pending/retry events
    const { data: events, error: fetchErr } = await supabase
      .from("webhook_events")
      .select("*")
      .in("status", ["pending", "retry"])
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) {
      return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "Queue empty" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ event_id: string; status: string; error?: string }> = [];

    for (const event of events) {
      try {
        await processEvent(supabase, event);
        await supabase
          .from("webhook_events")
          .update({ status: "processed", processed_at: new Date().toISOString(), error_message: null })
          .eq("id", event.id);
        results.push({ event_id: event.event_id, status: "processed" });
      } catch (err: any) {
        const newRetry = (event.retry_count || 0) + 1;
        const newStatus = newRetry >= MAX_RETRIES ? "error" : "retry";
        await supabase
          .from("webhook_events")
          .update({
            status: newStatus,
            retry_count: newRetry,
            error_message: err.message || "Unknown error",
          })
          .eq("id", event.id);
        results.push({ event_id: event.event_id, status: newStatus, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[process-webhook-queue] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processEvent(supabase: any, event: any) {
  const { event_type, payload, source } = event;

  switch (event_type) {
    case "new_reservation": {
      const p = payload;
      const guestName = p.guest_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "External Guest";
      const externalId = p.external_reservation_id || p.reservation_id || event.event_id;

      // Check if already exists
      const { data: existing } = await supabase
        .from("resort_ops_bookings")
        .select("id")
        .eq("external_reservation_id", externalId)
        .maybeSingle();

      if (existing) {
        // Update sync timestamp
        await supabase
          .from("resort_ops_bookings")
          .update({ last_synced_at: new Date().toISOString(), external_data: p })
          .eq("id", existing.id);
        return;
      }

      // Upsert guest
      let guestId: string | null = null;
      const { data: guest } = await supabase
        .from("resort_ops_guests")
        .insert({ full_name: guestName, email: p.email || null, phone: p.phone || null })
        .select("id")
        .single();
      if (guest) guestId = guest.id;

      // Create booking
      await supabase.from("resort_ops_bookings").insert({
        check_in: p.check_in || p.arrival_date,
        check_out: p.check_out || p.departure_date,
        guest_id: guestId,
        source,
        external_reservation_id: externalId,
        last_synced_at: new Date().toISOString(),
        external_data: p,
        room_rate: p.room_rate || p.total_price || 0,
        adults: p.adults || 1,
        platform: source,
      });
      break;
    }

    case "date_change": {
      const p = payload;
      const externalId = p.external_reservation_id || p.reservation_id;
      if (!externalId) throw new Error("Missing external_reservation_id for date_change");

      const { data: booking, error } = await supabase
        .from("resort_ops_bookings")
        .select("id")
        .eq("external_reservation_id", externalId)
        .maybeSingle();

      if (!booking) throw new Error(`Booking not found for external_id: ${externalId}`);

      const updates: any = {
        last_synced_at: new Date().toISOString(),
        external_data: p,
      };
      if (p.check_in || p.arrival_date) updates.check_in = p.check_in || p.arrival_date;
      if (p.check_out || p.departure_date) updates.check_out = p.check_out || p.departure_date;

      await supabase.from("resort_ops_bookings").update(updates).eq("id", booking.id);
      break;
    }

    case "cancellation": {
      const p = payload;
      const externalId = p.external_reservation_id || p.reservation_id;
      if (!externalId) throw new Error("Missing external_reservation_id for cancellation");

      // Soft-delete: just update external_data with cancelled flag
      const { data: booking } = await supabase
        .from("resort_ops_bookings")
        .select("id")
        .eq("external_reservation_id", externalId)
        .maybeSingle();

      if (!booking) throw new Error(`Booking not found for external_id: ${externalId}`);

      await supabase
        .from("resort_ops_bookings")
        .update({
          last_synced_at: new Date().toISOString(),
          external_data: { ...p, cancelled: true },
          notes: "Cancelled via external integration",
        })
        .eq("id", booking.id);
      break;
    }

    default:
      console.warn(`[process-webhook-queue] Unknown event_type: ${event_type}`);
      // Still mark as processed to avoid infinite retry
      break;
  }
}
