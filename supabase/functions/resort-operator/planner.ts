// Planner: reads unified state + open cases, compares against permanent goals,
// emits prioritized PlannedActions. Deterministic core (no LLM dependency) so
// the operating loop never stalls when a provider is down. Every action names
// its tool, verification rule and approval requirement up front.
//
// Domains covered: guest_request, unpaid_balance, housekeeping, maintenance,
// reservation_exception, arrival, tour, fnb, integration.

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

/** Current hour in Manila (UTC+8), 0–23. */
function manilaHour(nowIso: string): number {
  return (new Date(nowIso).getUTCHours() + 8) % 24;
}

/** Manila calendar date (YYYY-MM-DD) for an ISO timestamp. */
function manilaDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function plan(state: ResortState): PlannedAction[] {
  const actions: PlannedAction[] = [];
  const openCaseKeys = new Set(
    state.openCases.map((c: any) => `${c.domain}:${c.source_table}:${c.source_id}`),
  );
  const has = (domain: string, table: string, id: string) => openCaseKeys.has(`${domain}:${table}:${id}`);

  // ── guest requests (goal 1, 3, 5) ────────────────────────────────────────
  for (const r of state.openGuestRequests) {
    if (!has("guest_request", "guest_requests", r.id)) {
      actions.push({
        key: `case:guest_request:${r.id}`,
        tool: "create_task",
        domain: "guest_request",
        priority: r.escalated_at ? "urgent" : "high",
        reason: "Goal 1/3: guest request must be tracked to completion",
        approvalRequired: false,
        verificationRule: "guest_request_completed",
        input: { skipTask: true },
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

  // ── unpaid departure balances (goal 4, 10) ───────────────────────────────
  for (const d of state.unpaidDepartures) {
    if (!has("unpaid_balance", "resort_ops_bookings", d.booking_id)) {
      actions.push({
        key: `case:unpaid_balance:${d.booking_id}`,
        tool: "request_payment_action",
        domain: "unpaid_balance",
        priority: d.check_out === state.today ? "urgent" : "high",
        reason: `Goal 4: departure ${d.check_out} with unpaid balance ${d.balance}`,
        approvalRequired: true,
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

  // ── arrivals: check-in not completed (goal 2, 3) ─────────────────────────
  // A guest arriving today who is still not checked in by mid-afternoon Manila
  // is a service risk (no-show, lost booking, or reception miss).
  {
    const hour = manilaHour(state.now);
    if (hour >= 14) {
      for (const a of state.arrivals) {
        if (a.checked_in_at) continue;
        if (has("arrival", "resort_ops_bookings", a.id)) continue;
        const guest = a.resort_ops_guests?.name ?? "";
        const unit = a.resort_ops_units?.name ?? "";
        actions.push({
          key: `case:arrival:${a.id}`,
          tool: "create_task",
          domain: "arrival",
          priority: hour >= 18 ? "urgent" : "high",
          reason: "Goal 2/3: today's arrival not checked in — confirm guest or free the room",
          approvalRequired: false,
          verificationRule: "guest_checked_in",
          input: { skipTask: true },
          case: {
            domain: "arrival",
            issue_type: "pending_checkin",
            source_table: "resort_ops_bookings",
            source_id: a.id,
            booking_id: a.id,
            guest_name: guest,
            department: "reception",
            risk: `Arrival today (${unit || "unassigned unit"}) not checked in by ${hour}:00 Manila`,
            due_at: `${state.today}T13:00:00Z`, // 21:00 Manila
            required_action: `Contact ${guest || "the guest"} and complete check-in for ${unit || "their unit"}, or release the booking`,
          },
        });
      }
    }
  }

  // ── housekeeping / room readiness (goal 2, 3) ────────────────────────────
  for (const h of state.pendingHousekeeping) {
    if (!has("housekeeping", "housekeeping_orders", h.id)) {
      const forArrival = state.unreadyArrivals.some((a: any) => a.resort_ops_units?.name === h.unit_name);
      actions.push({
        key: `case:housekeeping:${h.id}`,
        tool: "create_task",
        domain: "housekeeping",
        priority: forArrival ? "urgent" : "medium",
        reason: "Goal 2: rooms must be cleaned, ready, and correctly assigned",
        approvalRequired: false,
        verificationRule: "housekeeping_cleaning_completed",
        input: { skipTask: true },
        case: {
          domain: "housekeeping",
          issue_type: h.status || "pending_inspection",
          source_table: "housekeeping_orders",
          source_id: h.id,
          department: "housekeeping",
          unit_label: h.unit_name,
          risk: forArrival ? "Arrival today with unit not yet ready" : "Unit not turned over",
          required_action: `Complete cleaning/inspection for ${h.unit_name}`,
        } as any,
      });
    }
  }

  // ── maintenance (goal 2, 3) ──────────────────────────────────────────────
  for (const t of state.maintenanceTasks) {
    if (!has("maintenance", "resort_ops_tasks", t.id)) {
      actions.push({
        key: `case:maintenance:${t.id}`,
        tool: "create_task",
        domain: "maintenance",
        priority: state.overdueMaintenanceTasks.some((x: any) => x.id === t.id) ? "urgent" : "medium",
        reason: "Goal 2/3: unresolved maintenance issue can cause a service failure",
        approvalRequired: false,
        verificationRule: "task_completed",
        input: { skipTask: true },
        case: {
          domain: "maintenance",
          issue_type: t.category || "maintenance",
          source_table: "resort_ops_tasks",
          source_id: t.id,
          department: "maintenance",
          risk: t.description || t.title,
          due_at: t.due_date ? `${t.due_date}T17:00:00Z` : null,
          required_action: t.title,
        },
      });
    }
  }
  for (const t of state.overdueMaintenanceTasks) {
    actions.push({
      key: `escalate:resort_ops_tasks:${t.id}`,
      tool: "escalate_case",
      domain: "maintenance",
      priority: "urgent",
      reason: "Goal 7: maintenance overdue past 24h",
      approvalRequired: false,
      verificationRule: "case_escalated",
      input: { source_table: "resort_ops_tasks", source_id: t.id },
    });
  }

  // ── reservation exceptions (goal 4) ──────────────────────────────────────
  for (const t of state.reservationExceptionTasks) {
    if (!has("reservation_exception", "resort_ops_tasks", t.id)) {
      actions.push({
        key: `case:reservation_exception:${t.id}`,
        tool: "create_task",
        domain: "reservation_exception",
        priority: t.priority === "high" ? "high" : "medium",
        reason: "Goal 4: booking inconsistency flagged by reservations-ai",
        approvalRequired: false,
        verificationRule: "task_completed",
        input: { skipTask: true },
        case: {
          domain: "reservation_exception",
          issue_type: t.category || "reservation",
          source_table: "resort_ops_tasks",
          source_id: t.id,
          department: "reception",
          risk: t.description || t.title,
          due_at: t.due_date ? `${t.due_date}T17:00:00Z` : null,
          required_action: t.title,
        },
      });
    }
  }

  // ── tours & transport (goal 3) ───────────────────────────────────────────
  for (const tour of state.unconfirmedTours) {
    if (!has("tour", "tour_bookings", tour.id)) {
      const urgent = tour.tour_date === state.today;
      actions.push({
        key: `case:tour:${tour.id}`,
        tool: "create_task",
        domain: "tour",
        priority: urgent ? "urgent" : "medium",
        reason: "Goal 3: unconfirmed tour risks a missed departure",
        approvalRequired: false,
        verificationRule: "tour_confirmed",
        input: { skipTask: true },
        case: {
          domain: "tour",
          issue_type: tour.tour_name || "tour",
          source_table: "tour_bookings",
          source_id: tour.id,
          booking_id: tour.booking_id,
          guest_name: tour.guest_name ?? "",
          department: "tours",
          risk: `Tour on ${tour.tour_date} missing captain/guide confirmation`,
          due_at: `${tour.tour_date}T06:00:00Z`,
          required_action: `Confirm captain and guide for ${tour.tour_name} (${tour.guest_name})`,
        },
      });
    }
  }

  // ── F&B stuck orders (goal 1, 3) ─────────────────────────────────────────
  for (const o of state.stuckOrders) {
    if (!has("fnb", "orders", o.id)) {
      actions.push({
        key: `case:fnb:${o.id}`,
        tool: "create_task",
        domain: "fnb",
        priority: "high",
        reason: "Goal 1/3: order stuck past normal service time",
        approvalRequired: false,
        verificationRule: "order_closed",
        input: { skipTask: true },
        case: {
          domain: "fnb",
          issue_type: o.order_type || "order",
          source_table: "orders",
          source_id: o.id,
          department: "kitchen",
          risk: `Order open since ${o.created_at}, status ${o.status}`,
          due_at: new Date(new Date(o.created_at).getTime() + 90 * 60 * 1000).toISOString(),
          required_action: `Resolve stuck order (${o.order_type}, ${o.location_detail || "no location"})`,
        },
      });
    }
  }

  // ── F&B stale open tabs (goal 4) ─────────────────────────────────────────
  // A tab opened on a previous Manila day and still open is unbilled revenue.
  for (const t of state.openTabs) {
    if (!t.created_at || manilaDateOf(t.created_at) >= state.today) continue;
    if (has("fnb", "tabs", t.id)) continue;
    actions.push({
      key: `case:fnb_tab:${t.id}`,
      tool: "create_task",
      domain: "fnb",
      priority: "high",
      reason: "Goal 4: tab open past its service day — bill or close it",
      approvalRequired: false,
      verificationRule: "tab_closed",
      input: { skipTask: true },
      case: {
        domain: "fnb",
        issue_type: "stale_open_tab",
        source_table: "tabs",
        source_id: t.id,
        guest_name: t.guest_name ?? "",
        department: "cashier",
        risk: `Tab open since ${t.created_at} (${t.location_detail || "no location"}) — unbilled revenue`,
        due_at: `${state.today}T17:00:00Z`,
        required_action: `Settle or close tab for ${t.guest_name || "unknown guest"} (${t.location_detail || "no location"})`,
      },
    });
  }

  // ── integration: failed webhooks / PMS sync (goal 6) ─────────────────────
  for (const w of state.webhookFailures) {
    if (has("integration", "webhook_events", w.id)) continue;
    actions.push({
      key: `case:integration:${w.id}`,
      tool: "create_task",
      domain: "integration",
      priority: "high",
      reason: "Goal 6: failed sync can silently corrupt bookings",
      approvalRequired: false,
      verificationRule: "webhook_resolved",
      input: { skipTask: true },
      case: {
        domain: "integration",
        issue_type: w.event_type || w.type || "webhook_failed",
        source_table: "webhook_events",
        source_id: w.id,
        department: "management",
        risk: `Webhook failed (${w.provider || w.source || "external"}): ${(w.error || w.last_error || "").toString().slice(0, 120)}`,
        required_action: "Investigate failed webhook and reprocess or mark handled",
      },
    });
  }

  // ── verification pass on open cases ──────────────────────────────────────
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
