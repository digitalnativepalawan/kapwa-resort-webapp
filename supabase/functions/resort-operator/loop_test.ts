// deno test --no-lock loop_test.ts
// Proves both required flows against an in-memory database:
//   Flow A: guest request -> case -> completion verified -> case resolved
//   Flow B: unpaid departure -> case queued pending_approval -> payment recorded -> verified -> resolved
// And: overdue guest request -> escalation.

import { loadResortState } from "./state.ts";
import { plan } from "./planner.ts";
import { execute } from "./executor.ts";

// ── minimal in-memory supabase mock ─────────────────────────────────────────
function mockSupabase(db: Record<string, any[]>) {
  function query(table: string) {
    let rows = [...(db[table] ?? [])];
    const api: any = {
      select: (_cols?: string) => api,
      eq: (k: string, v: any) => { rows = rows.filter(r => r[k] === v); return api; },
      gte: (k: string, v: any) => { rows = rows.filter(r => r[k] >= v); return api; },
      lte: (k: string, v: any) => { rows = rows.filter(r => r[k] <= v); return api; },
      lt: (k: string, v: any) => { rows = rows.filter(r => r[k] < v); return api; },
      in: (k: string, vals: any[]) => { rows = rows.filter(r => vals.includes(r[k])); return api; },
      not: (k: string, op: string, v: string) => {
        if (op === "in") {
          const vals = v.replace(/[()]/g, "").split(",");
          rows = rows.filter(r => !vals.includes(r[k]));
        }
        return api;
      },
      order: () => api,
      limit: (n: number) => { rows = rows.slice(0, n); return api; },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }),
      insert: (row: any) => {
        const inserted = { id: crypto.randomUUID(), ...row };
        (db[table] ??= []).push(inserted);
        rows = [inserted];
        return api;
      },
      update: (patch: any) => {
        const updater = {
          eq: (k: string, v: any) => {
            for (const r of db[table] ?? []) if (r[k] === v) Object.assign(r, patch);
            return Promise.resolve({ data: null, error: null });
          },
        };
        return updater;
      },
      then: (resolve: any) => resolve({ data: rows, error: null }),
    };
    return api;
  }
  return { from: query };
}

const today = new Date().toISOString().slice(0, 10);
const threeHoursAgo = new Date(Date.now() - 3 * 3600e3).toISOString();

function freshDb() {
  return {
    resort_ops_bookings: [
      { id: "b1", guest_id: "g1", unit_id: "u1", check_in: "2026-07-10", check_out: today, room_rate: 5000, addons_total: 500, paid_amount: 2000, resort_ops_guests: { name: "Cruz" }, resort_ops_units: { name: "Seaside 1" } },
      { id: "b2", guest_id: "g2", unit_id: "u2", check_in: "2026-07-11", check_out: today, room_rate: 4000, addons_total: 0, paid_amount: 4000, resort_ops_guests: { name: "Reyes" }, resort_ops_units: { name: "Seaside 2" } },
    ],
    guest_requests: [
      { id: "r1", booking_id: "b1", guest_name: "Cruz", request_type: "towels", details: "Extra towels please", status: "pending", created_at: new Date().toISOString() },
      { id: "r2", booking_id: "b2", guest_name: "Reyes", request_type: "repair", details: "AC not cooling", status: "pending", created_at: threeHoursAgo },
    ],
    housekeeping_orders: [],
    resort_ops_tasks: [],
    tabs: [],
    webhook_events: [],
    ops_cases: [],
    audit_log: [],
  } as Record<string, any[]>;
}

Deno.test("cycle 1: opens cases for both flows, queues payment for approval, escalates overdue", async () => {
  const db = freshDb();
  const supabase = mockSupabase(db) as any;

  const state = await loadResortState(supabase);
  if (state.unpaidDepartures.length !== 1) throw new Error(`expected 1 unpaid departure, got ${state.unpaidDepartures.length}`);
  if (state.unpaidDepartures[0].balance !== 3500) throw new Error(`expected balance 3500, got ${state.unpaidDepartures[0].balance}`);
  if (state.overdueGuestRequests.length !== 1) throw new Error("expected 1 overdue request");

  const actions = plan(state);
  await execute(supabase, actions);

  const cases = db.ops_cases;
  const gr = cases.filter(c => c.domain === "guest_request");
  const ub = cases.filter(c => c.domain === "unpaid_balance");
  if (gr.length !== 2) throw new Error(`expected 2 guest_request cases, got ${gr.length}`);
  if (ub.length !== 1) throw new Error(`expected 1 unpaid_balance case, got ${ub.length}`);
  if (ub[0].status !== "pending_approval") throw new Error(`payment case must be pending_approval, got ${ub[0].status}`);
  const escalated = gr.find(c => c.source_id === "r2");
  if (escalated?.status !== "escalated") throw new Error(`overdue request case should be escalated, got ${escalated?.status}`);
});

Deno.test("cycle 2: idempotent - no duplicate cases", async () => {
  const db = freshDb();
  const supabase = mockSupabase(db) as any;
  await execute(supabase, plan(await loadResortState(supabase)));
  const countAfter1 = db.ops_cases.length;
  await execute(supabase, plan(await loadResortState(supabase)));
  const openCases = db.ops_cases.filter(c => !["resolved", "closed"].includes(c.status));
  if (openCases.length !== countAfter1) throw new Error(`duplicates created: ${countAfter1} -> ${openCases.length}`);
});

Deno.test("Flow A verified: completed guest request resolves its case with evidence", async () => {
  const db = freshDb();
  const supabase = mockSupabase(db) as any;
  await execute(supabase, plan(await loadResortState(supabase)));

  // Staff completes the request via the existing Telegram loop
  db.guest_requests[0].status = "completed";
  db.guest_requests[0].completed_at = new Date().toISOString();

  await execute(supabase, plan(await loadResortState(supabase)));

  const c = db.ops_cases.find(x => x.source_id === "r1");
  if (c?.status !== "resolved") throw new Error(`Flow A case should be resolved, got ${c?.status}`);
  if (!c.verified) throw new Error("Flow A case must be verified");
  if (!c.resolution_evidence?.guest_request) throw new Error("Flow A must record DB evidence");
});

Deno.test("Flow B verified: payment recorded clears the approved case", async () => {
  const db = freshDb();
  const supabase = mockSupabase(db) as any;
  await execute(supabase, plan(await loadResortState(supabase)));

  const c = db.ops_cases.find(x => x.domain === "unpaid_balance")!;
  // Management approves; reception records the payment in the backoffice
  c.status = "in_progress";
  db.resort_ops_bookings[0].paid_amount = 5500;

  await execute(supabase, plan(await loadResortState(supabase)));

  const after = db.ops_cases.find(x => x.domain === "unpaid_balance")!;
  if (after.status !== "resolved") throw new Error(`Flow B case should be resolved, got ${after.status}`);
  if (after.resolution_evidence?.balance > 0) throw new Error("Flow B evidence must show zero balance");
});
