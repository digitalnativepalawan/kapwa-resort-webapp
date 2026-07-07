import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findGuestFaqAnswer, guestFallbackReply } from "./handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateReply(message: string, rows: Array<{ question: string; answer: string; active: boolean }>) {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return guestFallbackReply;

  const confirmed = rows
    .filter((row) => row.active)
    .slice(0, 80)
    .map((row) => `Q: ${row.question}\nA: ${row.answer}`)
    .join("\n\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "KAPWA Guest Concierge",
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4-5",
      temperature: 0.1,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content: `You are the KAPWA Resort guest concierge in San Vicente, Palawan. Answer only from the confirmed information below. Never invent resort facts, times, prices, availability, services, policies, food, tours, or transport. If the answer is not confirmed, reply exactly: "${guestFallbackReply}" Keep confirmed answers warm, direct, and under 80 words.\n\nCONFIRMED INFORMATION:\n${confirmed || "None"}`,
        },
        { role: "user", content: message },
      ],
    }),
  });

  if (!response.ok) {
    console.error("guest-chat provider error", response.status);
    return "I’m sorry, the concierge is temporarily unavailable. Please contact reception for assistance.";
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || guestFallbackReply;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const { message } = await req.json();
    const text = typeof message === "string" ? message.trim() : "";
    if (!text || text.length > 1000) {
      return new Response(JSON.stringify({ error: "A valid message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const [settingsResult, faqResult] = await Promise.all([
      supabase.from("settings").select("bot_enabled").limit(1).maybeSingle(),
      supabase.from("guest_faq_memory").select("question, keywords, answer, active").eq("active", true).order("sort_order"),
    ]);

    if (faqResult.error) throw faqResult.error;

    if (settingsResult.data?.bot_enabled === false) {
      return new Response(JSON.stringify({
        reply: "The guest concierge is currently offline. Please contact reception for assistance.",
        source: "disabled",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = faqResult.data ?? [];
    const direct = findGuestFaqAnswer(text, rows);
    const reply = direct ?? await generateReply(text, rows);

    return new Response(JSON.stringify({ reply, source: direct ? "faq" : "ai" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("guest-chat error", error);
    return new Response(JSON.stringify({
      reply: "I’m sorry, the concierge is temporarily unavailable. Please contact reception for assistance.",
      source: "error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
