// Machine-readable map of the KAPWA backoffice: data sources, tools, side effects,
// approval boundaries and verification methods. Consumed by the planner and executor.
// Generated from repository inventory 2026-07-12 (commit 0ed699c lineage).

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
  // future: housekeeping, maintenance, arrivals, departures, reservations, tours, fnb
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
  tours: "guest_tours",
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
    name: "request_payment_action",
    kind: "db_action",
    purpose: "Queue a sensitive payment follow-up (charge, refund, write-off, guest-facing payment reminder) for management approval.",
    reads: [TABLES.bookings],
    writes: [TABLES.cases],
    sideEffects: [],
    approvalRequired: true, // NEVER auto-executed: goal 10
    idempotent: true,
    verification: "case_approved",
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
export const FORBIDDEN_WITHOUT_APPROVAL = [
  "request_payment_action",
  "modify_booking",
  "refund",
  "delete_record",
  "guest_facing_commitment",
];
