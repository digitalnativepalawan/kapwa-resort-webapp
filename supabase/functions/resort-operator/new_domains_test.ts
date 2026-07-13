// deno test --no-lock --allow-env new_domains_test.ts
// Proves the three newest domains end-to-end against the in-memory mock:
//   arrival:      today's booking not checked in (after 14:00 Manila) -> case -> checked_in_at set -> verified resolved
//   fnb tab:      tab opened yesterday still open -> case -> tab closed -> verified resolved
//   integration:  failed webhook -> case -> status processed -> verified resolved

import { loadResortState } from "./state.ts";
import { plan } from "./planner.ts";
import { execute } from "./executor.ts";

// ── same minimal in-memory supabase mock as loop_test.ts ────────────────────
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
      or: (_expr: string) => api,
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
const yesterdayIso = new Date(Date.now() - 26 * 3600e3).toISOString();

function freshDb(): Record<string, any[]> {
  return {
    resort_ops_bookings: [
      { id: "bk-arrival-1", guest_id: "g1", unit_id: "u1", check_in: today, check_out: today, room_rate: 0, addons_total: 0, paid_amount: 0, checked_in_at: null, checked_out_at: null, resort_ops_guests: { name: "Ana Cruz" }, resort_ops_units: { name: "Seaside 1" } },
    ],
    guest_requests: [],
    housekeeping_orders: [],
    resort_ops_tasks: [],
    tabs: [
      { id: "tab-1", status: "Open", guest_name: "Walk-in Ben", location_detail: "Beach Bar", created_at: yesterdayIso },
    ],
    webhook_events: [
      { id: "wh-1", status: "failed", event_type: "sirvoy_booking", provider: "sirvoy", error: "timeout contacting PMS" },
    ],
    ops_cases: [],
    tour_bookings: [],
    orders: [],
    audit_log: [],
  };
}

const manilaHourNow = (new Date().getUTCHours() + 8) % 24;
const arrivalWindowOpen = manilaHourNow >= 14;

async function cycle(db: Record<string, any[]>) {
  const supabase = mockSupabase(db) as any;
  const state = await loadResortState(supabase);
  const actions = plan(state);
  const results = await execute(supabase, actions, 50);
  return { state, actions, results };
}

Deno.test("cycle opens stale-tab and integration cases (and arrival case when window is open)", async () => {
  const db = freshDb();
  const { results } = await cycle(db);

  const cases = db.ops_cases;
  const byKey = (domain: string, table: string, id: string) =>
    cases.find(c => c.domain === domain && c.source_table === table && c.source_id === id);

  const tabCase = byKey("fnb", "tabs", "tab-1");
  if (!tabCase) throw new Error("stale open tab did not open an fnb case");
  if (tabCase.verification_rule !== "tab_closed") throw new Error("tab case has wrong verification rule");

  const whCase = byKey("integration", "webhook_events", "wh-1");
  if (!whCase) throw new Error("failed webhook did not open an integration case");
  if (whCase.verification_rule !== "webhook_resolved") throw new Error("webhook case has wrong verification rule");

  const arrivalCase = byKey("arrival", "resort_ops_bookings", "bk-arrival-1");
  if (arrivalWindowOpen) {
    if (!arrivalCase) throw new Error("pending check-in did not open an arrival case after 14:00 Manila");
    if (arrivalCase.verification_rule !== "guest_checked_in") throw new Error("arrival case has wrong verification rule");
  } else {
    if (arrivalCase) throw new Error("arrival case opened before 14:00 Manila window");
    console.log("  (arrival window closed at this Manila hour — creation branch not exercised, verifier still tested below)");
  }

  if (results.some(r => r.status === "failed")) {
    throw new Error(`cycle had failures: ${JSON.stringify(results.filter(r => r.status === "failed"))}`);
  }
});

Deno.test("cycle 2 is idempotent for the new domains", async () => {
  const db = freshDb();
  await cycle(db);
  const countAfter1 = db.ops_cases.length;
  await cycle(db);
  const open = db.ops_cases.filter(c => !["resolved", "closed"].includes(c.status));
  if (open.length !== countAfter1) {
    throw new Error(`duplicate cases created: ${countAfter1} -> ${open.length}`);
  }
});

Deno.test("stale tab resolves when the tab is closed", async () => {
  const db = freshDb();
  await cycle(db);
  db.tabs.find(t => t.id === "tab-1")!.status = "Closed";
  await cycle(db);
  const c = db.ops_cases.find(c => c.domain === "fnb" && c.source_id === "tab-1");
  if (c?.status !== "resolved") throw new Error(`tab case not resolved after closing tab (status: ${c?.status})`);
});

Deno.test("integration case resolves when the webhook is no longer failed", async () => {
  const db = freshDb();
  await cycle(db);
  db.webhook_events.find(w => w.id === "wh-1")!.status = "processed";
  await cycle(db);
  const c = db.ops_cases.find(c => c.domain === "integration" && c.source_id === "wh-1");
  if (c?.status !== "resolved") throw new Error(`integration case not resolved after reprocess (status: ${c?.status})`);
});

Deno.test("arrival case resolves when the guest checks in (verifier tested directly)", async () => {
  const db = freshDb();
  // Seed the case directly so this test is independent of the Manila-hour window.
  db.ops_cases.push({
    id: crypto.randomUUID(),
    domain: "arrival",
    issue_type: "pending_checkin",
    source_table: "resort_ops_bookings",
    source_id: "bk-arrival-1",
    status: "open",
    priority: "high",
    verification_rule: "guest_checked_in",
    history: [],
  });
  db.resort_ops_bookings.find(b => b.id === "bk-arrival-1")!.checked_in_at = new Date().toISOString();
  await cycle(db);
  const c = db.ops_cases.find(c => c.domain === "arrival" && c.source_id === "bk-arrival-1");
  if (c?.status !== "resolved") throw new Error(`arrival case not resolved after check-in (status: ${c?.status})`);
});
