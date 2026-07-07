const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CHAT_IDS: Record<string, number> = {
  kitchen: -1003894576626,
  bar: -5135701418,
  tours: -5211088675,
  housekeeping: -5127212920,
  reception: -4812951231,
  managers: -5233537962,
  waitstaff: -5220831375,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { group, message } = await req.json();

    if (!group || !message) {
      return new Response(JSON.stringify({ error: "group and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Support comma-separated groups
    const groups = (group as string).split(",").map((g: string) => g.trim());
    const results: any[] = [];

    for (const g of groups) {
      const chatId = CHAT_IDS[g];
      if (!chatId) {
        results.push({ group: g, ok: false, error: "unknown group" });
        continue;
      }

      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      });

      const data = await res.json();
      results.push({ group: g, ok: data.ok, message_id: data.result?.message_id });
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
