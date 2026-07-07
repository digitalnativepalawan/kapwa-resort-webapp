import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findGuestFaqAnswer, guestFallbackReply } from "./handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

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

  if (faqResult.error) {
    return new Response(JSON.stringify({ error: "Unable to load guest answers" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (settingsResult.data?.bot_enabled === false) {
    return new Response(JSON.stringify({ reply: "The guest concierge is currently offline. Please contact reception for assistance.", source: "disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const direct = findGuestFaqAnswer(text, faqResult.data ?? []);
  return new Response(JSON.stringify({ reply: direct ?? guestFallbackReply, source: direct ? "faq" : "fallback" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
