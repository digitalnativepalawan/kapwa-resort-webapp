// Machine-readable map of the KAPWA backoffice: data sources, tools, side effects,
// approval boundaries and verification methods. Consumed by the planner, executor,
// and the LLM brain.

export interface ToolDef {
  name: string;                 // edge function or internal action name
  kind: "edge_function" | "db_action";
  purpose: string;
  reads: string[];              // tables read
  writes: string[];             // tables written
  sideEffects: string[];        // external effects (telegram, sirvoy, etc.)
  approvalRequired: boolean;
  idempotent: boolean;
  verification: string;         // verifier rule key that confirms the effect
}

export const DOMAINS = [
  "guest_request",
  "unpaid_balance",
  "housekeeping",
  "maintenance",
  "reservation_exception",
  "arrival",
  "departure",
  "reservation_conflict",
  "tour",
  "fnb",
  "fnb_tab",
  "inventory",
  "integration",
] as const;

export const TABLES = {
  bookings: "resort_ops_bookings",
  guests: "resort_ops_guests",
  units: "resort_ops_units",
  guestRequests: "guest_requests",
  housekeeping: "housekeeping_orders",
  tasks: "resort_ops_tasks",
  tabs: "tabs",
  orders: "orders",
  tours: "tour_bookings",
  expenses: "resort_ops_expenses",
  webhookEvents: "webhook_events",
  auditLog: "audit_log",
  cases: "ops_cases",
} as const;

export const TOOLS: ToolDef[] = [
  {
    name: "send-telegram",
    kind: "edge_function",
    purpose: "Deliver a message (optionally with inline accept/complete buttons) to a department Telegram group.",
    reads: [],
    writes: [],
    sideEffects: ["telegram_message"],
    approvalRequired: false,
    idempotent: false,
    verification: "telegram_delivery_ok",
  },
  {
    name: "ops-coordinator",
    kind: "edge_function",
    purpose: "Produce the operations brief: occupancy, arrivals/departures, housekeeping, requests, overdue tasks, F&B, tabs, expenses, unpaid balances, suggested actions.",
    reads: [TABLES.bookings, TABLES.guestRequests, TABLES.housekeeping, TABLES.tasks, TABLES.tabs, TABLES.orders, TABLES.tours, TABLES.expenses, TABLES.units],
    writes: [],
    sideEffects: ["optional_telegram_brief"],
    approvalRequired: false,
    idempotent: true,
    verification: "none",
  },
  {
    name: "concierge-ai",
    kind: "edge_function",
    purpose: "Classify and route guest requests; complaint routing and overdue escalation.",
    reads: [TABLES.guestRequests, TABLES.tasks],
    writes: [TABLES.guestRequests, TABLES.tasks],
    sideEffects: ["telegram_message"],
    approvalRequired: false,
    idempotent: true,
    verification: "guest_request_routed",
  },
  {
    name: "reservations-ai",
    kind: "edge_function",
    purpose: "Reservation health checks; creates remediation tasks for booking inconsistencies.",
    reads: [TABLES.bookings, TABLES.webhookEvents],
    writes: [TABLES.tasks],
    sideEffects: [],
    approvalRequired: false,
    idempotent: true,
    verification: "task_exists",
  },
  {
    name: "create_housekeeping_order",
    kind: "db_action",
    purpose: "Insert a missing housekeeping order for a unit turnover.",
    reads: [TABLES.housekeeping],
    writes: [TABLES.housekeeping],
    sideEffects: ["telegram_message"],
    approvalRequired: false,
    idempotent: true,
    verification: "housekeeping_order_exists",
  },
  {
    name: "create_task",
    kind: "db_action",
    purpose: "Create a resort_ops_tasks row assigned to a department/owner.",
    reads: [TABLES.tasks],
    writes: [TABLES.tasks],
    sideEffects: [],
    approvalRequired: false,
    idempotent: true,
    verification: "task_exists",
  },
  {
    name: "send_payment_request",
    kind: "edge_function",
    purpose: "Send the guest a WhatsApp message with the outstanding balance and the resort's GCash QR code, asking them to pay. The agent only ever REQUESTS payment — it cannot move money. The guest must scan and pay themselves; Sirvoy syncs the payment back and the case verifies itself.",
    reads: [TABLES.bookings, TABLES.guests],
    writes: [TABLES.cases],
    sideEffects: ["whatsapp_message"],
    approvalRequired: false, // safe to auto-send: it requests money, it never moves it
    idempotent: true, // one reminder per case per day, see executor.ts
    verification: "balance_cleared",
  },
  {
    name: "escalate_case",
    kind: "db_action",
    purpose: "Raise escalation level, notify management group, mark case escalated.",
    reads: [TABLES.cases],
    writes: [TABLES.cases],
    sideEffects: ["telegram_message"],
    approvalRequired: false,
    idempotent: true,
    verification: "case_escalated",
  },
];

// Actions that must NEVER run without human approval, regardless of planner output.
// send_payment_request is deliberately NOT here: it can only ever ask the guest
// to pay, never charge or move money itself. Anything that WOULD move money,
// change a booking, or delete a record stays gated until a real tool exists.
export const FORBIDDEN_WITHOUT_APPROVAL = [
  "charge_card",
  "issue_refund",
  "modify_booking",
  "delete_record",
  "guest_facing_commitment",
];
