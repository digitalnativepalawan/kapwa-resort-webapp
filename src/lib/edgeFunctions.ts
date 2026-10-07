/**
 * The authoritative classification of every KAPWA Backend Service Function.
 *
 * This mirrors `server/services/functions.js`. `edgeFunctions.test.ts` parses
 * that file and fails if any function in `EDGE_FUNCTIONS` is missing from the
 * backend dispatcher or lacks its required authorization guard.
 */

export type FunctionClass =
  /** Unauthenticated by design — guest-facing, or the login endpoint itself. */
  | 'public'
  /** Requires a staff JWT, enforced in-handler by server/services/auth.js. */
  | 'staff'
  /** Requires the INTERNAL_FN_SECRET header. Cron / server-to-server. */
  | 'internal'
  /** External provider callback, guarded by its own shared secret. */
  | 'webhook';

export interface EdgeFunctionSpec {
  name: string;
  class: FunctionClass;
  /** True when something in this repository actually calls it. */
  called: boolean;
  note: string;
}

export const EDGE_FUNCTIONS: EdgeFunctionSpec[] = [
  // ── public ────────────────────────────────────────────────────────────────
  { name: 'employee-auth', class: 'public', called: true,
    note: 'Staff login. Cannot require a JWT — the caller is asking for one.' },
  { name: 'guest-chat', class: 'public', called: true,
    note: 'TALA guest concierge. Reachable from the public Guest Portal.' },

  // ── webhook ───────────────────────────────────────────────────────────────
  { name: 'sirvoy-webhook', class: 'webhook', called: false,
    note: 'Sirvoy booking callback.' },
  { name: 'integration-webhook', class: 'webhook', called: false,
    note: 'Generic integration callback.' },
  { name: 'telegram-webhook', class: 'webhook', called: false,
    note: 'Telegram callback, guarded by TELEGRAM_WEBHOOK_SECRET.' },

  // ── internal ──────────────────────────────────────────────────────────────
  { name: 'configure-telegram-webhook', class: 'internal', called: false,
    note: 'One-off setup call. INTERNAL_FN_SECRET.' },
  { name: 'process-webhook-queue', class: 'internal', called: false,
    note: 'Queue drain, intended to run on a schedule.' },
  { name: 'admin-summary', class: 'internal', called: false,
    note: 'INTERNAL_FN_SECRET; intended for a cron/monitor caller.' },
  { name: 'concierge-ai', class: 'internal', called: false,
    note: 'Guest-request routing loop. Invoked by resort-agent-loop with the internal secret.' },
  { name: 'guest-requests-api', class: 'internal', called: false,
    note: 'INTERNAL_FN_SECRET.' },
  { name: 'guest-whatsapp', class: 'internal', called: false,
    note: 'Outbound WhatsApp bridge invoked by resort-operator with INTERNAL_FN_SECRET.' },
  { name: 'reservations-ai', class: 'internal', called: false,
    note: 'Booking-issue detection. Invoked by resort-agent-loop with the internal secret.' },

  // ── staff ─────────────────────────────────────────────────────────────────
  { name: 'resort-operator', class: 'staff', called: true,
    note: 'Back-office operator agent.' },
  { name: 'resort-operator-execute', class: 'staff', called: true,
    note: 'Applies approved operator actions.' },
  { name: 'send-telegram', class: 'staff', called: true,
    note: 'Outbound staff notification.' },
  { name: 'scan-receipt', class: 'staff', called: true,
    note: 'Receipt OCR for expense capture.' },
  { name: 'ops-coordinator', class: 'staff', called: true,
    note: 'Morning/evening operational brief.' },
  { name: 'forecast-7day', class: 'staff', called: true,
    note: '7-day occupancy and revenue forecast.' },
  { name: 'frontdesk-today', class: 'staff', called: false,
    note: 'Front desk daily summary.' },
  { name: 'guest-search', class: 'staff', called: true,
    note: 'Returns guest PII and booking history; staff-guarded.' },
  { name: 'housekeeping', class: 'staff', called: false,
    note: 'Read-only housekeeping summary.' },
  { name: 'orders-today', class: 'staff', called: false,
    note: 'Active daily F&B orders.' },
  { name: 'resort-agent-loop', class: 'staff', called: true,
    note: 'Fans out to ops-coordinator, concierge-ai, reservations-ai, and resort-operator.' },
  { name: 'today-ops', class: 'staff', called: true,
    note: 'Live operational snapshot.' },
  { name: 'tours-today', class: 'staff', called: false,
    note: 'Active daily tours.' },
];

/** Functions no caller in this repository invokes directly from the UI. */
export const ORPHANED_FUNCTIONS = EDGE_FUNCTIONS.filter(f => !f.called).map(f => f.name);
