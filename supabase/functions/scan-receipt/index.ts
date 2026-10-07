import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaff } from "../_shared/auth.ts";
import { resolveModelConfig } from "../_shared/modelGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireStaff(req);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const modelConfig = await resolveModelConfig(supabase, "operator");
    const OPENROUTER_API_KEY = modelConfig.apiKey || Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured in Admin → Agent Settings or environment");
    }

    const { image_base64 } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a receipt/invoice OCR extraction assistant for Philippine businesses. 
Extract the following fields from the receipt or invoice image and return ONLY valid JSON (no markdown, no backticks):

{
  "supplier_name": "string or null",
  "supplier_tin": "string or null (format: XXX-XXX-XXX-XXX)",
  "vat_status": "VAT | Non-VAT | VAT-Exempt | Zero-Rated",
  "invoice_number": "string or null",
  "official_receipt_number": "string or null", 
  "date": "YYYY-MM-DD or null",
  "total_amount": number or null,
  "vatable_sale": number or null,
  "vat_amount": number or null,
  "vat_exempt_amount": number or null,
  "zero_rated_amount": number or null,
  "description": "brief description of items/services or null",
  "confidence": "high | medium | low"
}

Rules:
- If you see a TIN number, the vat_status is likely "VAT"
- Philippine VAT is 12% inclusive. If total is given and VAT breakdown missing: vat_amount = total / 1.12 * 0.12, vatable_sale = total - vat_amount
- For Non-VAT receipts: vat_amount = 0, vatable_sale = total_amount
- For VAT-Exempt: vat_exempt_amount = total_amount, vat_amount = 0
- For Zero-Rated: zero_rated_amount = total_amount, vat_amount = 0
- Look for "SI#", "Sales Invoice", "OR#", "Official Receipt" labels
- Date format should be YYYY-MM-DD
- Amounts should be plain numbers without currency symbols
- If a field cannot be determined, use null
- Return ONLY the JSON object, nothing else`;

    const visionModel = Deno.env.get("OCR_VISION_MODEL") || "google/gemini-2.5-flash";

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": Deno.env.get("APP_URL") ?? "https://kapwa.local",
          "X-Title": "KAPWA Hospitality OS",
        },
        body: JSON.stringify({
          model: visionModel,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all receipt/invoice data from this image. Return only JSON.",
                },
                {
                  type: "image_url",
                  image_url: { url: image_base64 },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("OpenRouter vision error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    let cleaned = rawContent.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", cleaned);
      return new Response(
        JSON.stringify({ error: "Could not parse receipt data. Please try a clearer image.", raw: cleaned }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-receipt error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
