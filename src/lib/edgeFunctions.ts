/**
 * The authoritative classification of every Supabase Edge Function.
 *
 * This mirrors `supabase/config.toml`. `edgeFunctions.test.ts` parses that file
 * and fails if the two disagree, because the failure mode is silent and
 * expensive: a function directory with no `[functions.<name>]` entry inherits
 * `verify_jwt = true`, and since this project authenticates the browser with an
 * opaque `sb_publishable_` key — which the gateway cannot validate as a JWT —
 * the gateway answers 401 before the handler ever runs.
 *
 * That is what happened to `employee-auth`: it lost its entry when the project
 * was switched, so login could be rejected before the PIN was checked.
 */

export type FunctionClass =
  /** Unauthenticated by design — guest-facing, or the login endpoint itself. */
  | 'public'
  /** Requires a staff JWT, enforced in-handler by _shared/auth.ts. */
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
    note: 'Orphaned. INTERNAL_FN_SECRET; intended for a cron/monitor caller.' },
  { name: 'concierge-ai', class: 'internal', called: false,
    note: 'Guest-request routing loop. Invoked by resort-agent-loop with the internal secret.' },
  { name: 'guest-requests-api', class: 'internal', called: false,
    note: 'Orphaned. INTERNAL_FN_SECRET.' },
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

  // Deployed and guarded, but nothing in this repository calls them yet. They
  // are reachable endpoints, so they are guarded rather than assumed unused.
  { name: 'forecast-7day', class: 'staff', called: false,
    note: 'Orphaned: no frontend caller.' },
  { name: 'frontdesk-today', class: 'staff', called: false,
    note: 'Orphaned: no frontend caller.' },
  { name: 'guest-search', class: 'staff', called: false,
    note: 'Orphaned: returns guest PII, so it is staff-guarded regardless.' },
  { name: 'housekeeping', class: 'staff', called: false,
    note: 'Orphaned: read-only summary. HousekeeperPage queries the table directly and does not use this.' },
  { name: 'orders-today', class: 'staff', called: false,
    note: 'Orphaned: no frontend caller.' },
  { name: 'resort-agent-loop', class: 'staff', called: false,
    note: 'Orphaned: fans out to the other agent functions.' },
  { name: 'today-ops', class: 'staff', called: false,
    note: 'Orphaned: no frontend caller.' },
  { name: 'tours-today', class: 'staff', called: false,
    note: 'Orphaned: no frontend caller.' },
];

/** Functions no caller in this repository invokes. */
export const ORPHANED_FUNCTIONS = EDGE_FUNCTIONS.filter(f => !f.called).map(f => f.name);
