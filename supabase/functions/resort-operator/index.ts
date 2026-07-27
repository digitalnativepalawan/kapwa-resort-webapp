// resort-operator: the central agent runtime.
// One loop cycle = load state -> plan -> execute safe actions / queue approvals
// -> verify open cases -> return everything the admin page needs.
//
// Interfaces (Telegram, /admin/operator, guest portal, staff screens) all talk
// to this one runtime. Triggered by: admin button, schedule (cron), or events
// (guest request created, booking changed) via a plain POST.
//
// Actions:
//   { action: "cycle" }                                  run one full loop cycle
//   { action: "state" }                                  return unified state only
//   { action: "ask", question }                          answer an admin question from live state (LLM)
//   { action: "decide", case_id, approve, decided_by }   approve/reject a pending case

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadResortState } from "./state.ts";
import { plan } from "./planner.ts";
import { execute, decideCase } from "./executor.ts";
import { askAgent, llmEnabled, operatorModel, useModelConfig } from "./brain.ts";
import { TOOLS, DOMAINS } from "./system-map.ts";
import { requireAdmin, requireInternal } from "../_shared/auth.ts";
import { resolveModelConfig } from "../_shared/modelGateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const respond = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Authorization is signature-verified in ../_shared/auth.ts. This function used
// to base64-decode the JWT payload and trust `is_admin` without checking the
// signature, which let any caller mint their own admin claim.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const internal = requireInternal(req);
  if (!(internal.ok && internal.enforced)) {
    const admin = await requireAdmin(req);
    if (!admin.ok) return admin.response;
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve the operator's model once per request from the shared gateway, so
  // the model picked in Admin → Agent Settings drives this agent too.
  useModelConfig(await resolveModelConfig(supabase, "operator"));

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "cycle";

    if (action === "decide") {
      if (!body.case_id) return respond({ ok: false, error: "case_id required" }, 400);
      await decideCase(supabase, body.case_id, body.approve === true, body.decided_by ?? "admin");
      return respond({ ok: true, case_id: body.case_id, approved: body.approve === true });
    }

    const state = await loadResortState(supabase);

    if (action === "state") {
      return respond({ ok: true, state, domains: DOMAINS, tools: TOOLS.map((t) => t.name) });
    }

    if (action === "ask") {
      const question = String(body.question ?? "").trim();
      if (!question) return respond({ ok: false, error: "question required" }, 400);
      if (!llmEnabled()) {
        return respond({ ok: false, error: "llm_unavailable", detail: "No model configured. Set the OpenRouter key in Admin → Agent Settings, or set OPENROUTER_API_KEY on the function (and check AGENT_LLM_ENABLED is not \"false\")." }, 503);
      }
      const reply = await askAgent(question.slice(0, 1000), state);
      if (!reply) {
        return respond({ ok: false, error: "llm_failed", detail: "The model did not return an answer. Try again." }, 502);
      }
      return respond({
        ok: true,
        answer: reply.answer,
        model: reply.model,
        tokens: reply.tokens,
        ms: reply.ms,
        generated_at: new Date().toISOString(),
      });
    }

    // Full cycle
    const actions = plan(state);
    const results = await execute(supabase, actions);
    const finalState = await loadResortState(supabase);

    return respond({
      ok: true,
      llm: { enabled: llmEnabled(), model: llmEnabled() ? operatorModel() : null },
      cycle: {
        started_at: state.now,
        planned: actions.length,
        results,
      },
      state: finalState,
      exceptions: {
        pending_approvals: finalState.pendingApprovals,
        escalated: finalState.openCases.filter((c: any) => c.status === "escalated"),
        overdue: finalState.overdueGuestRequests.length + finalState.overdueTasks.length,
      },
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    return respond({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
