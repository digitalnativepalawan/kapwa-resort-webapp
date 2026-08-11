// Executor + Verifier.
// - Safe actions execute immediately.
// - approvalRequired actions only ever create a pending_approval case; the
//   sensitive act itself is NEVER performed by the agent (permanent goal 10).
// - Every executed action is audit-logged and verified against the database,
//   never trusted from model output.
// - The LLM brain triages each case as it opens (refined priority + one
//   manager-readable explanation, logged to case history with token cost).
//   Any LLM failure falls back to planner values; the loop never stalls.

import type { PlannedAction } from "./planner.ts";
import { appendHistory, escalateCase, openCase, resolveCase } from "./cases.ts";
import { FORBIDDEN_WITHOUT_APPROVAL } from "./system-map.ts";
import { triageCase } from "./brain.ts";

export interface ExecutionResult {
  key: string;
  tool: string;
  status: "executed" | "queued_for_approval" | "verified_resolved" | "still_open" | "escalated" | "skipped" | "failed";
  detail?: unknown;
}

async function audit(supabase: any, action: string, detail: unknown) {
  try {
    await supabase.from("audit_log").insert({
      actor: "resort-operator",
      action,
      details: typeof detail === "string" ? detail : JSON.stringify(detail),
    });
  } catch (_) { /* audit table shape differences must not break the loop */ }
}

const PAYMENT_REMINDER_COOLDOWN_MS = 20 * 3600 * 1000; // once per ~day, not every 30-min cycle

/** True if this case has already had a payment_request_sent event within the cooldown window. */
function recentlyNotified(history: unknown): boolean {
  if (!Array.isArray(history)) return false;
  const last = [...history].reverse().find((h: any) => h?.event === "payment_request_sent");
  if (!last?.at) return false;
  return Date.now() - new Date(last.at).getTime() < PAYMENT_REMINDER_COOLDOWN_MS;
}

/**
 * Send a WhatsApp payment request for an unpaid_balance case. Never throws —
 * a delivery failure must not stop the loop; it just tries again next cycle.
 * The agent only ever asks the guest to pay; it never moves money itself.
 */
async function sendPaymentRequest(
  supabase: any,
  a: PlannedAction,
  caseRow: any,
): Promise<{ sent: boolean; detail?: unknown }> {
  if (recentlyNotified(caseRow.history)) return { sent: false, detail: "cooldown" };

  try {
    const guestId = a.input?.guest_id as string | undefined;
    let phone: string | null = null;
    if (guestId) {
      const { data } = await supabase.from("resort_ops_guests").select("phone").eq("id", guestId).maybeSingle();
      phone = data?.phone ?? null;
    }
    if (!phone) return { sent: false, detail: "no_guest_phone" };

    const { data, error } = await supabase.functions.invoke("guest-whatsapp", {
      body: {
        to: phone,
        guest_name: caseRow.guest_name ?? "",
        balance: a.input?.balance ?? null,
        case_id: caseRow.id,
      },
      headers: { "x-internal-secret": Deno.env.get("INTERNAL_FN_SECRET") ?? "" },
    });
    if (error || data?.ok === false) {
      return { sent: false, detail: error?.message ?? data?.error ?? "guest-whatsapp failed" };
    }
    return { sent: true, detail: { provider_message_id: data?.provider_message_id ?? null } };
  } catch (err) {
    return { sent: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

// ── Verification rules: every rule checks the DATABASE, not the plan ────────
const VERIFIERS: Record<string, (supabase: any, c: any) => Promise<{ ok: boolean; evidence: Record<string, unknown> }>> = {
  guest_request_completed: async (supabase, c) => {
    const { data } = await supabase.from("guest_requests")
      .select("status, completed_at, completed_by").eq("id", c.source_id).single();
    return {
      ok: data?.status === "completed" || !!data?.completed_at,
      evidence: { guest_request: data },
    };
  },
  balance_cleared: async (supabase, c) => {
    const { data } = await supabase.from("resort_ops_bookings")
      .select("room_rate, addons_total, paid_amount").eq("id", c.source_id).single();
    if (!data) return { ok: false, evidence: { missing: true } };
    const balance = Number(data.room_rate ?? 0) + Number(data.addons_total ?? 0) - Number(data.paid_amount ?? 0);
    return { ok: balance <= 0, evidence: { balance, ...data } };
  },
  housekeeping_order_exists: async (supabase, c) => {
    const { data } = await supabase.from("housekeeping_orders")
      .select("id, status").eq("id", c.source_id).maybeSingle();
    return { ok: !!data, evidence: { order: data } };
  },
  housekeeping_cleaning_completed: async (supabase, c) => {
    const { data } = await supabase.from("housekeeping_orders")
      .select("id, status, cleaning_completed_at").eq("id", c.source_id).maybeSingle();
    return { ok: !!data?.cleaning_completed_at, evidence: { order: data } };
  },
  task_exists: async (supabase, c) => {
    const { data } = await supabase.from("resort_ops_tasks")
      .select("id, status").eq("id", c.source_id).maybeSingle();
    return { ok: !!data, evidence: { task: data } };
  },
  task_completed: async (supabase, c) => {
    const { data } = await supabase.from("resort_ops_tasks")
      .select("id, status").eq("id", c.source_id).maybeSingle();
    return { ok: data?.status === "completed", evidence: { task: data } };
  },
  tour_confirmed: async (supabase, c) => {
    const { data } = await supabase.from("tour_bookings")
      .select("id, captain_confirmed, guide_confirmed").eq("id", c.source_id).maybeSingle();
    return { ok: !!data?.captain_confirmed && !!data?.guide_confirmed, evidence: { tour: data } };
  },
  order_closed: async (supabase, c) => {
    const { data } = await supabase.from("orders")
      .select("id, status").eq("id", c.source_id).maybeSingle();
    return { ok: !!data && ["Completed", "Paid", "Cancelled"].includes(data.status), evidence: { order: data } };
  },
  guest_checked_in: async (supabase, c) => {
    const { data } = await supabase.from("resort_ops_bookings")
      .select("id, checked_in_at, checked_out_at").eq("id", c.source_id).maybeSingle();
    // Resolved if the guest checked in, or the booking was closed out (released/no-show handled).
    return { ok: !!data && (!!data.checked_in_at || !!data.checked_out_at), evidence: { booking: data } };
  },
  tab_closed: async (supabase, c) => {
    const { data } = await supabase.from("tabs")
      .select("id, status").eq("id", c.source_id).maybeSingle();
    const status = String(data?.status ?? "").toLowerCase();
    return { ok: !!data && status !== "open", evidence: { tab: data } };
  },
  webhook_resolved: async (supabase, c) => {
    const { data } = await supabase.from("webhook_events")
      .select("id, status").eq("id", c.source_id).maybeSingle();
    const status = String(data?.status ?? "").toLowerCase();
    return { ok: !data || status !== "failed", evidence: { webhook: data } };
  },
};

export async function execute(supabase: any, actions: PlannedAction[], maxActions = 25): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  for (const a of actions.slice(0, maxActions)) {
    try {
      // Hard approval boundary: independent of what the planner claimed.
      const mustApprove = a.approvalRequired || FORBIDDEN_WITHOUT_APPROVAL.includes(a.tool);

      if (a.case) {
        // LLM brain: refine priority + explain. Null on any failure = planner values win.
        const triage = await triageCase(a);
        const effectivePriority = triage?.priority ?? a.priority;

        const { case: c, created } = await openCase(supabase, {
          ...a.case,
          priority: effectivePriority,
          approval_required: mustApprove,
          verification_rule: a.verificationRule,
        });

        if (created) {
          await audit(supabase, "case_opened", { case_id: c.id, domain: c.domain, issue: c.issue_type });
          if (triage) {
            await appendHistory(supabase, c.id, "llm_triage", {
              explanation: triage.explanation,
              priority: triage.priority,
              planner_priority: a.priority,
              model: triage.model,
              tokens: triage.tokens,
              ms: triage.ms,
            });
          }
        }

        let sideEffect: unknown = null;
        if (a.tool === "send_payment_request" && !mustApprove) {
          const result = await sendPaymentRequest(supabase, a, c);
          sideEffect = result;
          if (result.sent) {
            await appendHistory(supabase, c.id, "payment_request_sent", result.detail);
            await audit(supabase, "payment_request_sent", { case_id: c.id, ...(result.detail as object ?? {}) });
          }
        }

        results.push({
          key: a.key,
          tool: a.tool,
          status: mustApprove ? "queued_for_approval" : "executed",
          detail: {
            case_id: c.id,
            created,
            llm: triage ? { priority: triage.priority, tokens: triage.tokens } : null,
            ...(sideEffect ? { whatsapp: sideEffect } : {}),
          },
        });
        continue;
      }

      if (a.tool === "verify_case") {
        const { data: c } = await supabase.from("ops_cases").select("*").eq("id", a.input.case_id).single();
        if (!c) { results.push({ key: a.key, tool: a.tool, status: "skipped" }); continue; }
        const verifier = VERIFIERS[c.verification_rule];
        if (!verifier) { results.push({ key: a.key, tool: a.tool, status: "skipped", detail: "no verifier" }); continue; }
        const { ok, evidence } = await verifier(supabase, c);
        if (ok) {
          await resolveCase(supabase, c.id, evidence);
          await audit(supabase, "case_verified_resolved", { case_id: c.id, evidence });
          results.push({ key: a.key, tool: a.tool, status: "verified_resolved", detail: { case_id: c.id } });
        } else if (c.due_at && new Date(c.due_at) < new Date() && c.status !== "escalated") {
          const retries = (c.retry_count ?? 0) + 1;
          await supabase.from("ops_cases").update({ retry_count: retries }).eq("id", c.id);
          if (retries >= 2) {
            await escalateCase(supabase, c, "verification failed past due date");
            await audit(supabase, "case_escalated", { case_id: c.id });
            results.push({ key: a.key, tool: a.tool, status: "escalated", detail: { case_id: c.id } });
          } else {
            results.push({ key: a.key, tool: a.tool, status: "still_open", detail: { case_id: c.id, retries } });
          }
        } else {
          results.push({ key: a.key, tool: a.tool, status: "still_open", detail: { case_id: c.id } });
        }
        continue;
      }

      if (a.tool === "escalate_case") {
        let { data: c } = await supabase.from("ops_cases").select("*")
          .eq("source_table", a.input.source_table).eq("source_id", a.input.source_id)
          .not("status", "in", "(resolved,closed)").maybeSingle();
        if (!c) {
          // Case may not exist yet (e.g. request became overdue before first cycle).
          const opened = await openCase(supabase, {
            domain: a.domain,
            issue_type: "overdue",
            source_table: String(a.input.source_table),
            source_id: String(a.input.source_id),
            priority: "urgent",
            risk: "Overdue past SLA before first tracking cycle",
            verification_rule: a.verificationRule === "case_escalated" ? "guest_request_completed" : a.verificationRule,
          });
          c = opened.case;
        }
        if (c && c.status !== "escalated") {
          await escalateCase(supabase, c, "overdue SLA");
          await audit(supabase, "case_escalated", { case_id: c.id });
          results.push({ key: a.key, tool: a.tool, status: "escalated", detail: { case_id: c.id } });
        } else {
          results.push({ key: a.key, tool: a.tool, status: "skipped" });
        }
        continue;
      }

      results.push({ key: a.key, tool: a.tool, status: "skipped", detail: "unknown tool" });
    } catch (err) {
      results.push({ key: a.key, tool: a.tool, status: "failed", detail: String(err) });
    }
  }
  return results;
}

/** Human approval endpoint helper: approve or reject a pending case. */
export async function decideCase(supabase: any, caseId: string, approve: boolean, decidedBy: string) {
  const patch = approve
    ? { status: "in_progress", approved_by: decidedBy, approved_at: new Date().toISOString() }
    : { status: "closed", closed_at: new Date().toISOString() };
  await appendHistory(supabase, caseId, approve ? "approved" : "rejected", { by: decidedBy }, patch);
  await audit(supabase, approve ? "case_approved" : "case_rejected", { case_id: caseId, by: decidedBy });
}
