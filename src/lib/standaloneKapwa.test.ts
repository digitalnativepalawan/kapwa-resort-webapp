import { describe, expect, it } from 'vitest';
import { loadResortState } from '../../server/operator/state.js';
import { plan } from '../../server/operator/planner.js';
import { execute } from '../../server/operator/executor.js';
import { FORBIDDEN_WITHOUT_APPROVAL } from '../../server/operator/system-map.js';
import {
  hashPin,
  verifyPin,
  signStaffJwt,
  verifyStaffJwt,
  handleEmployeeAuth,
} from '../../server/services/auth.js';
import {
  checkTablePermission,
  sanitizeTableResult,
} from '../../server/middleware/permissions.js';
import { createInternalClient } from '../../server/db/adapter.js';

function mockDbClient(db: Record<string, any[]>) {
  function query(table: string) {
    let rows = [...(db[table] ?? [])];
    const api: any = {
      select: (_cols?: string) => api,
      eq: (k: string, v: any) => { rows = rows.filter((r) => r[k] === v); return api; },
      gte: (k: string, v: any) => { rows = rows.filter((r) => r[k] >= v); return api; },
      lte: (k: string, v: any) => { rows = rows.filter((r) => r[k] <= v); return api; },
      lt: (k: string, v: any) => { rows = rows.filter((r) => r[k] < v); return api; },
      is: (k: string, v: any) => { rows = rows.filter((r) => (r[k] ?? null) === v); return api; },
      or: (_expr: string) => api,
      in: (k: string, vals: any[]) => { rows = rows.filter((r) => vals.includes(r[k])); return api; },
      not: (k: string, op: string, v: string) => {
        if (op === 'in') {
          const vals = v.replace(/[()]/g, '').split(',');
          rows = rows.filter((r) => !vals.includes(r[k]));
        }
        return api;
      },
      order: () => api,
      limit: (n: number) => { rows = rows.slice(0, n); return api; },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } }),
      insert: (row: any) => {
        const inserted = { id: crypto.randomUUID(), ...row };
        (db[table] ??= []).push(inserted);
        rows = [inserted];
        return api;
      },
      update: (patch: any) => ({
        eq: (k: string, v: any) => {
          for (const r of db[table] ?? []) {
            if (r[k] === v) Object.assign(r, patch);
          }
          return Promise.resolve({ data: null, error: null });
        },
      }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
    };
    return api;
  }
  return { from: query };
}

const today = new Date().toISOString().slice(0, 10);
const threeHoursAgo = new Date(Date.now() - 3 * 3600e3).toISOString();
const yesterdayIso = new Date(Date.now() - 26 * 3600e3).toISOString();

function freshOperatorDb(): Record<string, any[]> {
  return {
    resort_ops_bookings: [
      { id: 'b1', guest_id: 'g1', unit_id: 'u1', check_in: today, check_out: today, room_rate: 5000, addons_total: 500, paid_amount: 2000, resort_ops_guests: { name: 'Cruz' }, resort_ops_units: { name: 'Seaside 1' } },
      { id: 'b2', guest_id: 'g2', unit_id: 'u2', check_in: '2026-07-11', check_out: today, room_rate: 4000, addons_total: 0, paid_amount: 4000, resort_ops_guests: { name: 'Reyes' }, resort_ops_units: { name: 'Seaside 2' } },
    ],
    guest_requests: [
      { id: 'r1', booking_id: 'b1', guest_name: 'Cruz', request_type: 'towels', details: 'Extra towels please', status: 'pending', created_at: new Date().toISOString() },
      { id: 'r2', booking_id: 'b2', guest_name: 'Reyes', request_type: 'repair', details: 'AC not cooling', status: 'pending', created_at: threeHoursAgo },
    ],
    housekeeping_orders: [
      { id: 'h1', unit_name: 'Seaside 1', status: 'pending_inspection', cleaning_completed_at: null },
    ],
    resort_ops_tasks: [
      { id: 'm1', title: 'Fix leaking faucet', category: 'maintenance', status: 'pending', due_date: '2026-07-01', priority: 'high' },
      { id: 'rv1', title: 'Resolve double-booked unit', category: 'reservation', status: 'pending', due_date: today, priority: 'high' },
    ],
    tabs: [
      { id: 'tab-1', status: 'Open', guest_name: 'Walk-in Ben', location_detail: 'Beach Bar', created_at: yesterdayIso },
    ],
    webhook_events: [
      { id: 'wh-1', status: 'failed', event_type: 'sirvoy_booking', provider: 'sirvoy', error: 'timeout contacting PMS' },
    ],
    ops_cases: [],
    audit_log: [],
    tour_bookings: [
      { id: 't1', booking_id: 'b1', guest_name: 'Cruz', tour_name: 'Island Hopping', tour_date: today, pax: 2, price: 1500, captain_confirmed: false, guide_confirmed: false },
    ],
    orders: [
      { id: 'o1', order_type: 'Room Service', location_detail: 'Seaside 1', items: [], total: 450, status: 'New', created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
    ],
  };
}

describe('Resort Operator Loop & Planner (Standalone Node Runtime)', () => {
  it('cycle 1: opens cases for guest requests, unpaid balance (pending_approval), overdue escalation, housekeeping, maintenance, reservation, tour, fnb, and integration', async () => {
    const db = freshOperatorDb();
    const client = mockDbClient(db);

    const state = await loadResortState(client);
    expect(state.unpaidDepartures.length).toBe(1);
    expect(state.unpaidDepartures[0].balance).toBe(3500);
    expect(state.overdueGuestRequests.length).toBe(1);

    const actions = plan(state);
    await execute(client, actions, 50);

    const cases = db.ops_cases;
    const gr = cases.filter((c) => c.domain === 'guest_request');
    const ub = cases.filter((c) => c.domain === 'unpaid_balance');
    expect(gr.length).toBe(2);
    expect(ub.length).toBe(1);
    expect(ub[0].status).toBe('open');

    const escalated = gr.find((c) => c.source_id === 'r2');
    expect(escalated?.status).toBe('escalated');
    expect(FORBIDDEN_WITHOUT_APPROVAL.length).toBeGreaterThan(0);

    expect(cases.filter((c) => c.domain === 'housekeeping').length).toBe(1);
    expect(cases.filter((c) => c.domain === 'maintenance').length).toBe(1);
    expect(cases.filter((c) => c.domain === 'reservation_exception').length).toBe(1);
    expect(cases.filter((c) => c.domain === 'tour').length).toBe(1);
    expect(cases.filter((c) => c.domain === 'integration').length).toBe(1);
  });

  it('cycle 2: is idempotent and does not open duplicate cases', async () => {
    const db = freshOperatorDb();
    const client = mockDbClient(db);
    await execute(client, plan(await loadResortState(client)), 50);
    const countAfter1 = db.ops_cases.length;
    await execute(client, plan(await loadResortState(client)), 50);
    const openCases = db.ops_cases.filter((c) => !['resolved', 'closed'].includes(c.status));
    expect(openCases.length).toBe(countAfter1);
  });

  it('Flow A & B: verifies and resolves completed guest requests and paid balances with evidence', async () => {
    const db = freshOperatorDb();
    const client = mockDbClient(db);
    await execute(client, plan(await loadResortState(client)), 50);

    // Complete guest request
    db.guest_requests[0].status = 'completed';
    db.guest_requests[0].completed_at = new Date().toISOString();

    // Pay balance
    const ubCase = db.ops_cases.find((x) => x.domain === 'unpaid_balance')!;
    ubCase.status = 'in_progress';
    db.resort_ops_bookings[0].paid_amount = 5500;

    await execute(client, plan(await loadResortState(client)), 50);

    const r1Case = db.ops_cases.find((x) => x.source_id === 'r1');
    expect(r1Case?.status).toBe('resolved');
    expect(r1Case?.verified).toBe(true);

    const ubAfter = db.ops_cases.find((x) => x.domain === 'unpaid_balance');
    expect(ubAfter?.status).toBe('resolved');
    expect(ubAfter?.resolution_evidence?.balance).toBe(0);
  });
});

describe('Independent Staff Auth & RBAC (Zero Supabase Dependency)', () => {
  it('hashes and verifies staff PINs with PBKDF2-SHA256', async () => {
    const hash = await hashPin('5309');
    expect(await verifyPin('5309', hash)).toBe(true);
    expect(await verifyPin('0000', hash)).toBe(false);
  });

  it('signs and verifies HS256 staff JWT tokens', () => {
    const token = signStaffJwt({
      employee_id: 'emp-admin',
      name: 'David',
      permissions: ['admin'],
      is_admin: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const verified = verifyStaffJwt(token);
    expect(verified).toMatchObject({
      employee_id: 'emp-admin',
      name: 'David',
      permissions: ['admin'],
      is_admin: true,
    });
  });

  it('blocks non-admin staff from self-escalating employee_permissions and strips password_hash', () => {
    const nonAdminClaims = {
      employee_id: 'emp-staff',
      name: 'Maria',
      permissions: ['reception', 'orders'],
      is_admin: false,
    };

    const permCheck = checkTablePermission({
      table: 'employee_permissions',
      action: 'insert',
      claims: nonAdminClaims,
      isInternal: false,
    });
    expect(permCheck.allowed).toBe(false);

    const payrollCheck = checkTablePermission({
      table: 'payroll_payments',
      action: 'select',
      claims: nonAdminClaims,
      isInternal: false,
    });
    expect(payrollCheck.allowed).toBe(false);

    const sanitized = sanitizeTableResult(
      'employees',
      [{ id: '1', name: 'David', password_hash: 'secret-hash' }],
      { claims: nonAdminClaims, isInternal: false },
    );
    expect(sanitized[0].password_hash).toBeUndefined();
    expect(sanitized[0].name).toBe('David');
  });

  it('verifies admin login via handleEmployeeAuth against the standalone DB adapter', async () => {
    const db = createInternalClient();
    const res = await handleEmployeeAuth(db, {
      action: 'admin-verify',
      name: 'David',
      pin: '5309',
    });
    expect(res.status).toBe(200);
    expect(res.payload.isAdmin).toBe(true);
    expect(res.payload.token).toBeTruthy();
    expect(res.payload.employee.password_hash).toBeUndefined();
  });
});
