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
//   { action: "decide", case_id, approve, decided_by }   approve/reject a pending case
//   { action: "execute", action_type, payload, actor }  execute an allowed action directly

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadResortState } from "./state.ts";
import { plan } from "./planner.ts";
import { execute, decideCase, runAction } from "./executor.ts";
import { TOOLS, DOMAINS } from "./system-map.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const respond = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function isAuthorized(req: Request): boolean {
  const internal = (req.headers.get("x-internal-secret") ?? "").trim();
  const stored = (Deno.env.get("INTERNAL_FN_SECRET") ?? "").trim();
  if (internal) {
    // Diagnostic (no secret contents in logs, only lengths + match flag).
    console.log(JSON.stringify({
      diag: "internal-secret-check",
      header_len: internal.length,
      stored_len: stored.length,
      match: internal.length > 0 && internal === stored,
    }));
  }
  if (internal && stored && internal === stored) return true;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const payload = token ? decodeJwtPayload(token) : null;
  return payload?.is_admin === true ||
    (Array.isArray(payload?.permissions) && payload.permissions.includes("admin"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isAuthorized(req)) return respond({ ok: false, error: "Admin access required" }, 403);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "cycle";

    if (action === "decide") {
      if (!body.case_id) return respond({ ok: false, error: "case_id required" }, 400);
      await decideCase(supabase, body.case_id, body.approve === true, body.decided_by ?? "admin");
      return respond({ ok: true, case_id: body.case_id, approved: body.approve === true });
    }

    if (action === "execute") {
      const { action_type, payload, actor } = body;
      if (!action_type || !payload) {
        return respond({ ok: false, error: "action_type and payload required" }, 400);
      }
      const result = await runAction(supabase, String(action_type), payload, String(actor || "operator"));
      return respond({ ok: true, result });
    }

    const state = await loadResortState(supabase);

    if (action === "state") {
      return respond({ ok: true, state, domains: DOMAINS, tools: TOOLS.map((t) => t.name) });
    }

    // Full cycle
    const actions = plan(state);
    const results = await execute(supabase, actions);
    const finalState = await loadResortState(supabase);

    return respond({
      ok: true,
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
