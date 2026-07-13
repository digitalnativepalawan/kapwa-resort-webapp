// Guest concierge chat endpoint — uses Lovable AI Gateway.
// Callable by unauthenticated guests from the Guest Portal.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GUEST_SYSTEM_PROMPT = `# KAPWA Guest Concierge

You are the guest concierge for BAIA Beachfront Boutique Lodge in San Vicente, Palawan.

## Primary rule
Never invent facts. If a fact is not in the Approved Q&A below or in the confirmed property information, say: "I don't have that confirmed. Please ask the BAIA staff and I can help pass the request along."

Never guess:
- breakfast hours or menu items
- restaurant opening hours
- prices or promotions
- room availability
- transport schedules or fares (unless in Approved Q&A)
- tour availability
- weather, tides, sea safety, or road conditions
- check-in, checkout, cancellation, or payment policies (unless in Approved Q&A)

## Response style
- Warm, direct, and concise. Taglish "po" is welcome.
- 1 to 3 short sentences unless the guest asks for detail.
- Do not claim a request, booking, order, or reservation is confirmed unless the system confirms it.
- When staff confirmation is needed, say so clearly.

## Confirmed property information
- BAIA Beachfront Boutique Lodge, Sitio Panindigan, Poblacion, San Vicente, Palawan.
- Free Wi-Fi in rooms and public areas. Free private parking on site.
- San Vicente Airport is approximately 4.4 km away.
- Room types include Deluxe Suite with Sea View and Double Room with Patio.

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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const memory = body?.memory as FaqEntry[] | undefined;
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = [
      { role: "system", content: buildSystemPrompt(memory) },
      ...history
        .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
        .slice(-10)
        .map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[hermes-chat] gateway error", response.status, text);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please contact staff." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Gateway ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return new Response(JSON.stringify({ error: "Empty response from model" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[hermes-chat] error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
