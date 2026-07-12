const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve(async (req) => {
  try {
    const internalSecret = Deno.env.get("INTERNAL_FN_SECRET");
    if (internalSecret && req.headers.get("x-internal-secret") !== internalSecret) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: jsonHeaders });
    }

    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (!token || !supabaseUrl || !webhookSecret) {
      throw new Error("TELEGRAM_BOT_TOKEN, SUPABASE_URL, and TELEGRAM_WEBHOOK_SECRET are required");
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["callback_query"],
        drop_pending_updates: false,
      }),
    });
    const result = await response.json();
    if (!result.ok) throw new Error(result.description || "Telegram setWebhook failed");

    return new Response(JSON.stringify({ ok: true, webhook_url: webhookUrl, description: result.description }), { headers: jsonHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
