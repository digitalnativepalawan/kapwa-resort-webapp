// guest-whatsapp — sends a payment-request WhatsApp message + the resort's
// GCash QR image to a guest.
//
// This function does NOT talk to WhatsApp directly (there is no official API
// key). It forwards to a small external bridge service running Baileys
// (unofficial WhatsApp Web client) on an always-on host, since a persistent
// WhatsApp session cannot live inside a stateless edge function.
//
// Internal-only: called by resort-operator's executor, never by the browser.
//
// Env on this function:
//   INTERNAL_FN_SECRET     shared with resort-operator (caller auth)
//   WHATSAPP_BRIDGE_URL    e.g. https://your-bridge.up.railway.app/send
//   WHATSAPP_BRIDGE_SECRET shared secret with the bridge service
//   GCASH_QR_URL           public URL of your static GCash QR image
//   RESORT_NAME            used in the message text (default "BAIA")

import { requireInternal, corsHeaders, jsonHeaders, preflight } from "../_shared/auth.ts";

function peso(amount: unknown): string {
  const n = Number(amount ?? 0);
  return `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const auth = requireInternal(req);
  if (!(auth.ok && auth.enforced)) {
    return new Response(JSON.stringify({ ok: false, error: "internal_only" }), {
      status: 403,
      headers: { ...corsHeaders, ...jsonHeaders },
    });
  }

  try {
    const bridgeUrl = Deno.env.get("WHATSAPP_BRIDGE_URL");
    const bridgeSecret = Deno.env.get("WHATSAPP_BRIDGE_SECRET");
    const qrUrl = Deno.env.get("GCASH_QR_URL");
    if (!bridgeUrl || !bridgeSecret) {
      return new Response(JSON.stringify({ ok: false, error: "whatsapp_bridge_not_configured" }), {
        status: 503,
        headers: { ...corsHeaders, ...jsonHeaders },
      });
    }

    const { to, guest_name, balance, case_id } = await req.json();
    if (!to) {
      return new Response(JSON.stringify({ ok: false, error: "to (guest phone) required" }), {
        status: 400,
        headers: { ...corsHeaders, ...jsonHeaders },
      });
    }

    const resortName = Deno.env.get("RESORT_NAME") ?? "BAIA";
    const name = guest_name || "there";
    const message = [
      `Hi ${name}, this is ${resortName}. `,
      `You have an outstanding balance of ${peso(balance)}.`,
      qrUrl ? " Please pay via the GCash QR below — reply here once you've sent it and we'll confirm." : " Please settle at your convenience — reply here if you have any questions.",
    ].join("");

    const bridgeRes = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bridge-secret": bridgeSecret },
      body: JSON.stringify({ to, message, mediaUrl: qrUrl || undefined }),
    });
    const bridgeData = await bridgeRes.json().catch(() => ({}));

    if (!bridgeRes.ok || bridgeData?.ok === false) {
      return new Response(
        JSON.stringify({ ok: false, error: bridgeData?.error || `bridge returned ${bridgeRes.status}` }),
        { status: 502, headers: { ...corsHeaders, ...jsonHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, provider_message_id: bridgeData?.id ?? null, case_id }),
      { headers: { ...corsHeaders, ...jsonHeaders } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, ...jsonHeaders } },
    );
  }
});
