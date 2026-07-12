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
      is: (k: string, v: any) => { rows = rows.filter(r => (r[k] ?? null) === v); return api; },
      or: (_expr: string) => api, // mock: pass-through, filtering already narrow enough in tests
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
      { id: "b1", guest_id: "g1", unit_id: "u1", check_in: today, check_out: today, room_rate: 5000, addons_total: 500, paid_amount: 2000, resort_ops_guests: { name: "Cruz" }, resort_ops_units: { name: "Seaside 1" } },
      { id: "b2", guest_id: "g2", unit_id: "u2", check_in: "2026-07-11", check_out: today, room_rate: 4000, addons_total: 0, paid_amount: 4000, resort_ops_guests: { name: "Reyes" }, resort_ops_units: { name: "Seaside 2" } },
    ],
    guest_requests: [
      { id: "r1", booking_id: "b1", guest_name: "Cruz", request_type: "towels", details: "Extra towels please", status: "pending", created_at: new Date().toISOString() },
      { id: "r2", booking_id: "b2", guest_name: "Reyes", request_type: "repair", details: "AC not cooling", status: "pending", created_at: threeHoursAgo },
    ],
    housekeeping_orders: [
      { id: "h1", unit_name: "Seaside 1", status: "pending_inspection", cleaning_completed_at: null },
    ],
    resort_ops_tasks: [
      { id: "m1", title: "Fix leaking faucet", category: "maintenance", status: "pending", due_date: "2026-07-01", priority: "high" },
      { id: "rv1", title: "Resolve double-booked unit", category: "reservation", status: "pending", due_date: today, priority: "high" },
    ],
    tabs: [],
    webhook_events: [],
    ops_cases: [],
    audit_log: [],
    tour_bookings: [
      { id: "t1", booking_id: "b1", guest_name: "Cruz", tour_name: "Island Hopping", tour_date: today, pax: 2, price: 1500, captain_confirmed: false, guide_confirmed: false },
    ],
    orders: [
      { id: "o1", order_type: "Room Service", location_detail: "Seaside 1", items: [], total: 450, status: "New", created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
    ],
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

Deno.test("new domains: housekeeping, maintenance, reservation, tour, fnb all open cases in one cycle", async () => {
  const db = freshDb();
  const supabase = mockSupabase(db) as any;
  await execute(supabase, plan(await loadResortState(supabase)));

  const byDomain = (d: string) => db.ops_cases.filter(c => c.domain === d);
  if (byDomain("housekeeping").length !== 1) throw new Error(`expected 1 housekeeping case, got ${byDomain("housekeeping").length}`);
  if (byDomain("maintenance").length !== 1) throw new Error(`expected 1 maintenance case, got ${byDomain("maintenance").length}`);
  if (byDomain("reservation_exception").length !== 1) throw new Error(`expected 1 reservation_exception case, got ${byDomain("reservation_exception").length}`);
  if (byDomain("tour").length !== 1) throw new Error(`expected 1 tour case, got ${byDomain("tour").length}`);
  if (byDomain("fnb").length !== 1) throw new Error(`expected 1 fnb case, got ${byDomain("fnb").length}`);

  // Housekeeping case for the arrival-blocking room must be urgent.
  const hk = byDomain("housekeeping")[0];
  if (hk.priority !== "urgent") throw new Error(`housekeeping case for today's arrival should be urgent, got ${hk.priority}`);

  // Maintenance task is overdue (due_date in the past) -> should already be escalated this cycle.
  const maint = byDomain("maintenance")[0];
  if (maint.status !== "escalated") throw new Error(`overdue maintenance case should be escalated, got ${maint.status}`);
});

Deno.test("housekeeping resolves when cleaning_completed_at is set", async () => {
  const db = freshDb();
  const supabase = mockSupabase(db) as any;
  await execute(supabase, plan(await loadResortState(supabase)));

  db.housekeeping_orders[0].cleaning_completed_at = new Date().toISOString();
  await execute(supabase, plan(await loadResortState(supabase)));

  const c = db.ops_cases.find(x => x.domain === "housekeeping")!;
  if (c.status !== "resolved") throw new Error(`housekeeping case should be resolved, got ${c.status}`);
});

Deno.test("tour resolves when both captain and guide confirm", async () => {
  const db = freshDb();
  const supabase = mockSupabase(db) as any;
  await execute(supabase, plan(await loadResortState(supabase)));

  db.tour_bookings[0].captain_confirmed = true;
  db.tour_bookings[0].guide_confirmed = true;
  await execute(supabase, plan(await loadResortState(supabase)));

  const c = db.ops_cases.find(x => x.domain === "tour")!;
  if (c.status !== "resolved") throw new Error(`tour case should be resolved, got ${c.status}`);
});

Deno.test("fnb order resolves when status becomes Completed", async () => {
  const db = freshDb();
  const supabase = mockSupabase(db) as any;
  await execute(supabase, plan(await loadResortState(supabase)));

  db.orders[0].status = "Completed";
  await execute(supabase, plan(await loadResortState(supabase)));

  const c = db.ops_cases.find(x => x.domain === "fnb")!;
  if (c.status !== "resolved") throw new Error(`fnb case should be resolved, got ${c.status}`);
});
