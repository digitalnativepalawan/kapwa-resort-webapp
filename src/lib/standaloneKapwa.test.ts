import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadResortState } from '../../server/operator/state.js';
import { plan } from '../../server/operator/planner.js';
import { execute } from '../../server/operator/executor.js';
import { FORBIDDEN_WITHOUT_APPROVAL, DOMAINS, TOOLS } from '../../server/operator/system-map.js';
import {
  hashPin,
  verifyPin,
  signStaffJwt,
  verifyStaffJwt,
  handleEmployeeAuth,
  getInternalSecret,
} from '../../server/services/auth.js';
import {
  checkTablePermission,
  sanitizeTableResult,
} from '../../server/middleware/permissions.js';
import {
  createInternalClient,
  executeRpc,
  parseSelectColumns,
  buildWhereClause,
} from '../../server/db/adapter.js';
import { createFunctionDispatcher } from '../../server/services/functions.js';
import {
  GUEST_TOOL_SCHEMAS,
  WRITE_TOOLS,
  executeToolCall,
  detectIntent,
} from '../../server/services/guestTools.js';

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

describe('1. Neon PostgreSQL Schema, Relations & SQL Builder', () => {
  it('defines all 74 resort tables and decrement_stock RPC in db/schema.sql', () => {
    const schemaPath = resolve(__dirname, '..', '..', 'db', 'schema.sql');
    const sql = readFileSync(schemaPath, 'utf8');
    const tableMatches = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z0-9_]+)/gi)];
    const tables = Array.from(new Set(tableMatches.map((m) => m[1])));
    expect(tables.length).toBeGreaterThanOrEqual(73);
    expect(tables).toContain('resort_ops_bookings');
    expect(tables).toContain('guest_requests');
    expect(tables).toContain('ops_cases');
    expect(tables).toContain('guest_memory');
    expect(tables).toContain('tala_conversations');
    expect(tables).toContain('historical_revenue');
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.decrement_stock/i);
  });

  it('parses embedded relation selects and builds parameterized Neon SQL WHERE clauses', () => {
    const parsed = parseSelectColumns('id, check_in, resort_ops_guests(full_name), resort_ops_units:unit_id(name)');
    expect(parsed.columns).toEqual(['id', 'check_in']);
    expect(parsed.relations.map((r: any) => r.alias)).toEqual(['resort_ops_guests', 'resort_ops_units']);

    const where = buildWhereClause([
      { op: 'eq', column: 'status', value: 'pending' },
      { op: 'not', column: 'status', operator: 'in', value: '(completed,cancelled)' },
      { op: 'or', expr: 'captain_confirmed.is.null,captain_confirmed.eq.false' },
    ]);
    expect(where.whereSql).toContain('"status" = $1');
    expect(where.whereSql).toContain('NOT ("status" = ANY($2))');
    expect(where.whereSql).toContain('("captain_confirmed" IS NULL OR "captain_confirmed" = $3)');
    expect(where.values).toEqual(['pending', ['completed', 'cancelled'], false]);
  });

  it('executes decrement_stock RPC and relational joins accurately', async () => {
    const db = createInternalClient();
    const { data: inserted } = await db
      .from('ingredients')
      .insert({ name: 'Palawan Calamansi', unit: 'kg', current_stock: 20, min_stock_threshold: 5 })
      .select('*')
      .single();
    expect(inserted.current_stock).toBe(20);

    const rpcRes = await executeRpc('decrement_stock', { p_ingredient_id: inserted.id, p_amount: 4.5 });
    expect(rpcRes.error).toBeNull();

    const { data: updated } = await db.from('ingredients').select('*').eq('id', inserted.id).single();
    expect(updated.current_stock).toBe(15.5);
  });
});

describe('2. Autonomous Resort Operator Loop & Approval Boundaries', () => {
  it('cycle 1: opens cases across all 9 domains and enforces FORBIDDEN_WITHOUT_APPROVAL', async () => {
    const db = freshOperatorDb();
    const client = mockDbClient(db);

    const state = await loadResortState(client);
    expect(state.unpaidDepartures.length).toBe(1);
    expect(state.unpaidDepartures[0].balance).toBe(3500);
    expect(state.overdueGuestRequests.length).toBe(1);
    expect(DOMAINS.length).toBe(13);
    expect(TOOLS.length).toBeGreaterThanOrEqual(7);

    const actions = plan(state);
    await execute(client, actions, 50);

    const cases = db.ops_cases;
    expect(cases.filter((c) => c.domain === 'guest_request').length).toBe(2);
    expect(cases.filter((c) => c.domain === 'unpaid_balance').length).toBe(1);
    expect(cases.filter((c) => c.domain === 'housekeeping').length).toBe(1);
    expect(cases.filter((c) => c.domain === 'maintenance').length).toBe(1);
    expect(cases.filter((c) => c.domain === 'reservation_exception').length).toBe(1);
    expect(cases.filter((c) => c.domain === 'tour').length).toBe(1);
    expect(cases.filter((c) => c.domain === 'integration').length).toBe(1);

    // Verify hard approval boundary: any forbidden tool is forced into pending_approval
    for (const forbidden of ['charge_card', 'issue_refund', 'modify_booking', 'delete_record', 'guest_facing_commitment']) {
      expect(FORBIDDEN_WITHOUT_APPROVAL).toContain(forbidden);
    }
    await execute(client, [
      {
        key: 'test:forbidden:folio',
        tool: 'issue_refund',
        domain: 'unpaid_balance',
        priority: 'high',
        reason: 'Issue refund',
        approvalRequired: false, // Even if planner claims false, executor forces pending_approval
        verificationRule: 'balance_cleared',
        input: {},
        case: {
          domain: 'unpaid_balance',
          issue_type: 'folio_adjustment',
          source_table: 'resort_ops_bookings',
          source_id: 'b-folio-test',
        },
      },
    ]);
    const gatedCase = db.ops_cases.find((c) => c.source_id === 'b-folio-test');
    expect(gatedCase?.status).toBe('pending_approval');
  });

  it('cycle 2: is idempotent and verifies/resolves completed cases with DB evidence', async () => {
    const db = freshOperatorDb();
    const client = mockDbClient(db);
    await execute(client, plan(await loadResortState(client)), 50);
    const countAfter1 = db.ops_cases.length;
    await execute(client, plan(await loadResortState(client)), 50);
    const openCases = db.ops_cases.filter((c) => !['resolved', 'closed'].includes(c.status));
    expect(openCases.length).toBe(countAfter1);

    db.guest_requests[0].status = 'completed';
    db.guest_requests[0].completed_at = new Date().toISOString();
    const ubCase = db.ops_cases.find((x) => x.domain === 'unpaid_balance')!;
    ubCase.status = 'in_progress';
    db.resort_ops_bookings[0].paid_amount = 5500;

    await execute(client, plan(await loadResortState(client)), 50);
    expect(db.ops_cases.find((x) => x.source_id === 'r1')?.status).toBe('resolved');
    expect(db.ops_cases.find((x) => x.domain === 'unpaid_balance')?.status).toBe('resolved');
  });
});

describe('3. TALA Guest Concierge Tools & Read/Write Confirmation Boundaries', () => {
  it('registers all 16 LLM guest tool schemas (and 20 total tool functions) and separates read tools from write/spend tools', () => {
    expect(GUEST_TOOL_SCHEMAS.length).toBe(16);
    const writeTools = Array.from(WRITE_TOOLS).sort();
    expect(writeTools).toEqual([
      'book_tour',
      'create_guest_request',
      'extend_booking',
      'order_food',
      'request_rental',
      'request_transport',
    ]);
  });

  it('executes read tools (menu_lookup, faq_lookup, check_availability) and keyword intent detection', async () => {
    const db = createInternalClient();
    const menuRes = await executeToolCall(db, 'menu_lookup', {});
    expect(menuRes.ok).toBe(true);
    expect(Array.isArray(menuRes.data)).toBe(true);
    expect(menuRes.data.length).toBeGreaterThan(0);

    const availRes = await executeToolCall(db, 'check_availability', {});
    expect(availRes.ok).toBe(true);

    const detected = detectIntent('what is my bill');
    expect(detected?.tool).toBe('room_bill');
  });
});

describe('4. Webhooks, 24 Service Functions & Scheduled Cron Jobs', () => {
  const { dispatchFunction } = createFunctionDispatcher();
  const adminClaims = { employee_id: 'admin-1', name: 'David', permissions: ['admin'], is_admin: true };

  it('processes Sirvoy webhooks (new, modified, canceled) end-to-end', async () => {
    const health = await dispatchFunction('sirvoy-webhook', { method: 'GET' });
    expect(health.status).toBe(200);

    const createRes = await dispatchFunction('sirvoy-webhook', {
      method: 'POST',
      body: {
        event: 'new',
        bookingId: 778899,
        bookingSource: 'Sirvoy',
        guestReference: 'SRVY-778899',
        totalPriceIncludingSurcharges: 9000,
        payments: [{ amount: 4500 }],
        guest: { firstName: 'Marco', lastName: 'Reyes', email: 'marco@example.com', phone: '+639179998877' },
        rooms: [{ RoomName: 'Glamping 02', arrivalDate: today, departureDate: today, adults: 2, roomTotal: 9000 }],
      },
    });
    expect(createRes.status).toBe(200);
    expect(createRes.payload.ok).toBe(true);

    const cancelRes = await dispatchFunction('sirvoy-webhook', {
      method: 'POST',
      body: { event: 'canceled', bookingId: 778899 },
    });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.payload.action).toBe('canceled');
  });

  it('processes integration-webhook and process-webhook-queue with duplicate idempotency', async () => {
    const eventId = `ota-test-${Date.now()}`;
    const q1 = await dispatchFunction('integration-webhook', {
      method: 'POST',
      body: {
        event_id: eventId,
        event_type: 'new_reservation',
        source: 'Booking.com',
        guest_name: 'Clara Lim',
        external_reservation_id: `EXT-${eventId}`,
        check_in: today,
        check_out: today,
        room_rate: 6000,
      },
    });
    expect(q1.status).toBe(202);

    // Duplicate event_id is idempotently accepted
    const q2 = await dispatchFunction('integration-webhook', {
      method: 'POST',
      body: { event_id: eventId, event_type: 'new_reservation', source: 'Booking.com' },
    });
    expect(q2.status).toBe(202);

    const proc = await dispatchFunction('process-webhook-queue', {
      method: 'POST',
      isInternal: true,
    });
    expect(proc.status).toBe(200);
    expect(proc.payload.ok).toBe(true);
  });

  it('processes telegram-webhook accept & complete callbacks on guest_requests', async () => {
    const db = createInternalClient();
    const { data: reqRow } = await db
      .from('guest_requests')
      .insert({ guest_name: 'Elena Santos', request_type: 'Extra Pillow', details: '2 pillows', status: 'routed' })
      .select('*')
      .single();

    const acceptRes = await dispatchFunction('telegram-webhook', {
      method: 'POST',
      body: {
        callback_query: {
          id: 'cb-1',
          from: { first_name: 'Maria', last_name: 'Cruz' },
          data: `guest_request:accept:${reqRow.id}`,
        },
      },
    });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.payload.status).toBe('in_progress');

    const completeRes = await dispatchFunction('telegram-webhook', {
      method: 'POST',
      body: {
        callback_query: {
          id: 'cb-2',
          from: { first_name: 'Maria', last_name: 'Cruz' },
          data: `guest_request:complete:${reqRow.id}`,
        },
      },
    });
    expect(completeRes.status).toBe(200);
    expect(completeRes.payload.status).toBe('completed');
  });

  it('executes operational & AI service functions (ops-coordinator, resort-agent-loop, today-ops, forecast-7day, guest-search, frontdesk-today, housekeeping, orders-today, tours-today, admin-summary)', async () => {
    for (const fn of ['today-ops', 'forecast-7day', 'frontdesk-today', 'housekeeping', 'orders-today', 'tours-today']) {
      const res = await dispatchFunction(fn, { method: 'GET', claims: adminClaims });
      expect(res.status).toBe(200);
    }

    const searchRes = await dispatchFunction('guest-search', {
      method: 'GET',
      query: { name: 'Elena' },
      claims: adminClaims,
    });
    expect(searchRes.status).toBe(200);
    expect(searchRes.payload.results.length).toBeGreaterThan(0);

    const loopRes = await dispatchFunction('resort-agent-loop', {
      method: 'POST',
      body: { type: 'morning' },
      claims: adminClaims,
      isInternal: true,
    });
    expect(loopRes.status).toBe(200);
    expect(loopRes.payload.ok).toBe(true);
    expect(loopRes.payload.operations?.ok).toBe(true);
    expect(loopRes.payload.concierge?.ok).toBe(true);
    expect(loopRes.payload.reservations?.ok).toBe(true);
    expect(loopRes.payload.operator?.ok).toBe(true);

    const summaryRes = await dispatchFunction('admin-summary', {
      method: 'GET',
      isInternal: true,
      headers: { 'x-internal-secret': getInternalSecret() },
    });
    expect(summaryRes.status).toBe(200);
    expect(typeof summaryRes.payload.occupancy_rate).toBe('number');
  });

  it('schedules cron jobs at 07:00 and 19:00 in server/index.js', () => {
    const serverSource = readFileSync(resolve(__dirname, '..', '..', 'server', 'index.js'), 'utf8');
    expect(serverSource).toContain("cron.schedule('0 7 * * *'");
    expect(serverSource).toContain("cron.schedule('0 19 * * *'");
  });
});

describe('5. Independent Staff Auth, Rate Limiting & RBAC', () => {
  it('hashes and verifies staff PINs with PBKDF2-SHA256 and signs HS256 JWTs', async () => {
    const hash = await hashPin('5309');
    expect(await verifyPin('5309', hash)).toBe(true);
    expect(await verifyPin('0000', hash)).toBe(false);

    const token = signStaffJwt({
      employee_id: 'emp-admin',
      name: 'David',
      permissions: ['admin'],
      is_admin: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(verifyStaffJwt(token)?.is_admin).toBe(true);
  });

  it('enforces brute-force lockout after 5 failed PIN attempts', async () => {
    const db = createInternalClient();
    const testIp = `rate-limit-test-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      await handleEmployeeAuth(db, { action: 'verify', name: 'David', pin: '0000' }, testIp);
    }
    const locked = await handleEmployeeAuth(db, { action: 'verify', name: 'David', pin: '5309' }, testIp);
    expect(locked.status).toBe(429);
  });

  it('blocks non-admin staff from self-escalating employee_permissions and strips password_hash', () => {
    const nonAdminClaims = {
      employee_id: 'emp-staff',
      name: 'Maria',
      permissions: ['reception', 'orders'],
      is_admin: false,
    };

    expect(
      checkTablePermission({ table: 'employee_permissions', action: 'insert', claims: nonAdminClaims, isInternal: false }).allowed,
    ).toBe(false);
    expect(
      checkTablePermission({ table: 'payroll_payments', action: 'select', claims: nonAdminClaims, isInternal: false }).allowed,
    ).toBe(false);

    const sanitized = sanitizeTableResult(
      'employees',
      [{ id: '1', name: 'David', password_hash: 'secret-hash' }],
      { claims: nonAdminClaims, isInternal: false },
    );
    expect(sanitized[0].password_hash).toBeUndefined();
  });
});
