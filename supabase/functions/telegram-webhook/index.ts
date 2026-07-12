import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function telegram(method: string, payload: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || `Telegram ${method} failed`);
  return result.result;
}

function staffName(from: any): string {
  const full = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim();
  return full || (from?.username ? `@${from.username}` : `Telegram ${from?.id ?? "staff"}`);
}

Deno.serve(async (req) => {
  try {
    const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (expectedSecret && req.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: jsonHeaders });
    }

    const update = await req.json();
    const callback = update.callback_query;
    if (!callback?.data) return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });

    const match = String(callback.data).match(/^guest_request:(accept|complete):([0-9a-f-]{36})$/i);
    if (!match) {
      await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "Unknown action" });
      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
    }

    const [, action, requestId] = match;
    const actor = staffName(callback.from);
    const supabase = sb();
    const { data: request, error: readError } = await supabase
      .from("guest_requests")
      .select("id,guest_name,request_type,details,status,assigned_to,routed_group")
      .eq("id", requestId)
      .single();
    if (readError || !request) throw readError || new Error("Guest request not found");

    const now = new Date().toISOString();
    let nextStatus = request.status;
    let callbackText = "No change";

    if (action === "accept") {
      if (["completed", "cancelled"].includes(request.status)) callbackText = "Request already closed";
      else if (request.assigned_to && request.assigned_to !== actor) callbackText = `Already accepted by ${request.assigned_to}`;
      else {
        const { error } = await supabase.from("guest_requests").update({
          status: "in_progress",
          assigned_to: actor,
          assigned_at: request.assigned_at ?? now,
          updated_at: now,
        }).eq("id", requestId);
        if (error) throw error;
        nextStatus = "in_progress";
        callbackText = `Accepted by ${actor}`;
      }
    }

    if (action === "complete") {
      if (request.status === "completed") callbackText = "Request already completed";
      else {
        const { error } = await supabase.from("guest_requests").update({
          status: "completed",
          assigned_to: request.assigned_to || actor,
          assigned_at: request.assigned_at || now,
          completed_by: actor,
          completed_at: now,
          updated_at: now,
        }).eq("id", requestId);
        if (error) throw error;
        nextStatus = "completed";
        callbackText = `Completed by ${actor}`;
      }
    }

    const originalText = callback.message?.text || `${request.request_type} — ${request.guest_name}`;
    const cleanText = originalText.replace(/\n\n(?:✅|👤|⏱).*$/s, "");
    await telegram("editMessageText", {
      chat_id: callback.message.chat.id,
      message_id: callback.message.message_id,
      text: `${cleanText}\n\n${nextStatus === "completed" ? "✅" : "👤"} ${callbackText}`,
      reply_markup: nextStatus === "completed" ? { inline_keyboard: [] } : {
        inline_keyboard: [[{ text: "✅ Complete", callback_data: `guest_request:complete:${requestId}` }]],
      },
    });
    await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: callbackText });

    await supabase.from("audit_log").insert({
      employee_name: actor,
      action: "updated",
      table_name: "guest_requests",
      record_id: requestId,
      details: `Telegram ${action}: ${callbackText}`,
    });

    return new Response(JSON.stringify({ ok: true, request_id: requestId, status: nextStatus }), { headers: jsonHeaders });
  } catch (error) {
    console.error("[telegram-webhook]", error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
