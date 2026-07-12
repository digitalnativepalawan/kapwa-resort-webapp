// Planner: reads unified state + open cases, compares against permanent goals,
// emits prioritized PlannedActions. Deterministic core (no LLM dependency) so
// the operating loop never stalls when a provider is down. Every action names
// its tool, verification rule and approval requirement up front.

import type { ResortState } from "./state.ts";

export interface PlannedAction {
  key: string;                 // dedupe key
  tool: string;                // must exist in TOOLS registry
  domain: string;
  priority: "low" | "medium" | "high" | "urgent";
  reason: string;              // which permanent goal this serves
  approvalRequired: boolean;
  verificationRule: string;
  input: Record<string, unknown>;
  case?: {
    domain: string;
    issue_type: string;
    source_table: string;
    source_id: string | null;
    booking_id?: string | null;
    guest_name?: string;
    department?: string;
    risk?: string;
    due_at?: string | null;
    required_action?: string;
  };
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

export function plan(state: ResortState): PlannedAction[] {
  const actions: PlannedAction[] = [];
  const openCaseKeys = new Set(
    state.openCases.map((c: any) => `${c.domain}:${c.source_table}:${c.source_id}`),
  );

  // ── Flow A: guest requests (goal 1, 3, 5) ────────────────────────────────
  for (const r of state.openGuestRequests) {
    const key = `guest_request:guest_requests:${r.id}`;
    if (!openCaseKeys.has(key)) {
      actions.push({
        key: `case:${key}`,
        tool: "create_task", // case creation itself; routing handled by concierge-ai loop already live
        domain: "guest_request",
        priority: r.escalated_at ? "urgent" : "high",
        reason: "Goal 1/3: guest request must be tracked to completion",
        approvalRequired: false,
        verificationRule: "guest_request_completed",
        input: { skipTask: true }, // executor opens the case only; task exists via telegram loop
        case: {
          domain: "guest_request",
          issue_type: r.request_type || "general",
          source_table: "guest_requests",
          source_id: r.id,
          booking_id: r.booking_id,
          guest_name: r.guest_name ?? "",
          department: r.routed_group ?? "",
          risk: "Guest waiting; experience at risk",
          due_at: new Date(new Date(r.created_at).getTime() + 2 * 3600e3).toISOString(),
          required_action: `Complete guest request: ${r.details?.slice(0, 120) ?? ""}`,
        },
      });
    }
  }

  // Overdue, never escalated → escalate (goal 3, 7)
  for (const r of state.overdueGuestRequests) {
    actions.push({
      key: `escalate:guest_requests:${r.id}`,
      tool: "escalate_case",
      domain: "guest_request",
      priority: "urgent",
      reason: "Goal 7: unresolved past 2h SLA",
      approvalRequired: false,
      verificationRule: "case_escalated",
      input: { source_table: "guest_requests", source_id: r.id },
    });
  }

  // ── Flow B: unpaid departure balances (goal 4, 10) ───────────────────────
  for (const d of state.unpaidDepartures) {
    const key = `unpaid_balance:resort_ops_bookings:${d.booking_id}`;
    if (!openCaseKeys.has(key)) {
      actions.push({
        key: `case:${key}`,
        tool: "request_payment_action",
        domain: "unpaid_balance",
        priority: d.check_out === state.today ? "urgent" : "high",
        reason: `Goal 4: departure ${d.check_out} with unpaid balance ${d.balance}`,
        approvalRequired: true, // goal 10: payment actions always held for approval
        verificationRule: "balance_cleared",
        input: { booking_id: d.booking_id, balance: d.balance },
        case: {
          domain: "unpaid_balance",
          issue_type: "departure_unpaid",
          source_table: "resort_ops_bookings",
          source_id: d.booking_id,
          booking_id: d.booking_id,
          guest_name: d.guest_name,
          department: "reception",
          risk: `Revenue at risk: ${d.balance} unpaid, checkout ${d.check_out}`,
          due_at: `${d.check_out}T10:00:00Z`,
          required_action: `Collect ${d.balance} before checkout (approval required for guest-facing payment action)`,
        },
      });
    }
  }

  // ── Verification pass on open cases (goal: never claim done without check) ─
  for (const c of state.openCases) {
    if (c.status === "escalated" || c.status === "pending_approval") continue;
    actions.push({
      key: `verify:${c.id}`,
      tool: "verify_case",
      domain: c.domain,
      priority: "medium",
      reason: "Verify whether the underlying problem is actually resolved",
      approvalRequired: false,
      verificationRule: c.verification_rule || "manual",
      input: { case_id: c.id },
    });
  }

  actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  return actions;
}
