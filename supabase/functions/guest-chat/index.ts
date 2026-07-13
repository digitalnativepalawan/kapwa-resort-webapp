// Guest concierge chat — routes to OpenRouter using the admin-configured key.
// Ollama (local) is called directly from the browser, not through this function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const GUEST_SYSTEM_PROMPT = `# KAPWA Guest Concierge

You are the guest concierge for BAIA Beachfront Boutique Lodge in San Vicente, Palawan.

## Primary rule
Never invent facts. If a fact is not in the Approved Q&A below or in the confirmed property information, say: "I don't have that confirmed. Please ask the BAIA staff and I can help pass the request along."

## Response style
- Warm, direct, and concise. Taglish "po" is welcome.
- 1 to 3 short sentences unless the guest asks for detail.
- Do not claim a request, booking, order, or reservation is confirmed unless the system confirms it.

## Confirmed property information
- BAIA Beachfront Boutique Lodge, Sitio Panindigan, Poblacion, San Vicente, Palawan.
- Free Wi-Fi and free private parking on site.
- San Vicente Airport is approximately 4.4 km away.

## Safety
For medical emergencies, fire, dangerous weather, water danger, security incidents, lost passports, or police matters, tell the guest to contact on-site staff immediately and local emergency services when appropriate.`;

interface FaqEntry {
  question?: string;
  answer?: string;
  keywords?: string;
  active?: boolean;
}

function buildSystemPrompt(memory: FaqEntry[] | undefined): string {
  const parts: string[] = [GUEST_SYSTEM_PROMPT];
  if (Array.isArray(memory) && memory.length) {
    const approved = memory
      .filter((e) => e && e.active !== false && typeof e.question === "string" && typeof e.answer === "string")
      .map((e) => {
        const kw = typeof e.keywords === "string" && e.keywords.trim() ? ` (keywords: ${e.keywords.trim()})` : "";
        return `Q: ${e.question!.trim()}${kw}\nA: ${e.answer!.trim()}`;
      })
      .join("\n\n");
    if (approved) {
      parts.push(
        `## Approved Q&A (staff-verified)\nIf the guest's question matches one of these entries by meaning or keywords, answer using the corresponding approved answer verbatim. Otherwise follow the rules above.\n\n${approved}`,
      );
    }
  }
  return parts.join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const memory = body?.memory as FaqEntry[] | undefined;
    const history = Array.isArray(body?.history) ? body.history : [];
    if (!message) return jsonRes({ error: "message is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await supabase
      .from("settings")
      .select("bot_enabled, openrouter_api_key, openrouter_model, bot_temperature, bot_max_tokens")
      .limit(1)
      .maybeSingle();

    if (settings?.bot_enabled === false) {
      return jsonRes({ error: "Guest concierge is disabled." }, 503);
    }

    const apiKey = (settings?.openrouter_api_key as string) || Deno.env.get("OPENROUTER_API_KEY") || "";
    if (!apiKey) {
      return jsonRes({ error: "OpenRouter API key not configured in Admin → Agent Settings." }, 400);
    }

    const model = (settings?.openrouter_model as string) || "openai/gpt-4o-mini";
    const temperature = Number(settings?.bot_temperature ?? 0.2);
    const maxTokens = Number(settings?.bot_max_tokens ?? 500);

    const messages = [
      { role: "system", content: buildSystemPrompt(memory) },
      ...history
        .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
        .slice(-10)
        .map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": req.headers.get("origin") || "https://kapwa-palawan.lovable.app",
        "X-Title": "KAPWA Guest Concierge",
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[guest-chat] openrouter error", response.status, text);
      return jsonRes({ error: `OpenRouter ${response.status}: ${text.slice(0, 200)}` }, 502);
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return jsonRes({ error: "Empty response from model" }, 502);

    return jsonRes({ reply, provider: "openrouter", model });
  } catch (error) {
    console.error("[guest-chat] error", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
