import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORE_PATH = process.env.KAPWA_LOCAL_DB_PATH || join(__dirname, '..', 'data', 'standalone-db.json');

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdentifier(name, kind = 'identifier') {
  if (!SAFE_IDENTIFIER.test(String(name || ''))) {
    throw new Error(`Invalid SQL ${kind}: ${name}`);
  }
  return String(name);
}

/**
 * Foreign-key relationship map for PostgREST-style embedded selects:
 *   e.g. `.select('*, resort_ops_guests(full_name), resort_ops_units:unit_id(name)')`
 */
const RELATIONS = {
  resort_ops_bookings: {
    resort_ops_guests: { targetTable: 'resort_ops_guests', localKey: 'guest_id', targetKey: 'id' },
    resort_ops_units: { targetTable: 'resort_ops_units', localKey: 'unit_id', targetKey: 'id' },
    units: { targetTable: 'units', localKey: 'room_id', fallbackLocalKey: 'unit_id', targetKey: 'id' },
  },
  guest_requests: {
    units: { targetTable: 'units', localKey: 'room_id', targetKey: 'id' },
  },
  orders: {
    units: { targetTable: 'units', localKey: 'room_id', targetKey: 'id' },
  },
  recipe_ingredients: {
    menu_items: { targetTable: 'menu_items', localKey: 'menu_item_id', targetKey: 'id' },
    ingredients: { targetTable: 'ingredients', localKey: 'ingredient_id', targetKey: 'id' },
  },
};

/**
 * Parse a `.select()` string into base columns and embedded relation specs.
 * Example:
 *   "id, check_in, resort_ops_guests(full_name), resort_ops_units:unit_id(name)"
 */
export function parseSelectColumns(selectStr = '*') {
  const raw = String(selectStr || '*').trim();
  if (!raw || raw === '*') {
    return { star: true, columns: [], relations: [] };
  }

  const tokens = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  let star = false;
  const columns = [];
  const relations = [];

  for (const token of tokens) {
    const relMatch = token.match(/^([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?\(([^)]*)\)$/);
    if (relMatch) {
      const [, relName, fkHint, innerCols] = relMatch;
      const innerList = innerCols
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      relations.push({
        alias: relName,
        table: relName,
        fkHint: fkHint || null,
        star: innerList.includes('*') || innerList.length === 0,
        columns: innerList.filter((c) => c !== '*'),
      });
    } else if (token === '*') {
      star = true;
    } else {
      columns.push(token);
    }
  }

  return { star, columns, relations };
}

/**
 * Default seed data for standalone embedded mode so KAPWA OS boots with
 * realistic initial configuration out of the box before migrating to Neon.
 */
function createSeedStore() {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  const u1Id = '11111111-1111-4111-8111-111111111101';
  const u2Id = '11111111-1111-4111-8111-111111111102';
  const u3Id = '11111111-1111-4111-8111-111111111103';
  const u4Id = '11111111-1111-4111-8111-111111111104';

  const roUnit1 = '22222222-2222-4222-8222-222222222201';
  const roUnit2 = '22222222-2222-4222-8222-222222222202';
  const roUnit3 = '22222222-2222-4222-8222-222222222203';
  const roUnit4 = '22222222-2222-4222-8222-222222222204';

  return {
    settings: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        kitchen_whatsapp_number: '',
        breakfast_start_time: '07:00',
        breakfast_end_time: '11:00',
        service_charge_pct: 10,
        bot_enabled: true,
        bot_provider: 'openrouter',
        bot_base_url: 'http://127.0.0.1:11434',
        bot_model: 'qwen2.5:3b',
        bot_temperature: 0.2,
        bot_max_tokens: 500,
        openrouter_api_key: '',
        openrouter_model: 'openai/gpt-4o-mini',
        hermes_sub_provider: 'ollama',
        created_at: now,
        updated_at: now,
      },
    ],
    resort_profile: [
      {
        id: '00000000-0000-4000-8000-000000000002',
        resort_name: 'BAIA Beachfront Boutique Lodge',
        tagline: 'Meaningful hospitality, intelligently operated.',
        address: 'Sitio Panindigan, Poblacion, San Vicente, Palawan',
        phone: '+63 917 000 0000',
        email: 'stay@baiapalawan.com',
        website: 'https://baiapalawan.com',
        logo_url: '/baia-logo.png',
        created_at: now,
        updated_at: now,
      },
    ],
    billing_config: [
      {
        id: '00000000-0000-4000-8000-000000000003',
        enable_service_charge: true,
        service_charge_rate: 10,
        enable_vat: true,
        vat_rate: 12,
        enable_city_tax: false,
        city_tax_amount: 0,
        created_at: now,
        updated_at: now,
      },
    ],
    payment_methods: [
      { id: randomUUID(), name: 'Cash', type: 'cash', is_active: true, sort_order: 1, created_at: now },
      { id: randomUUID(), name: 'GCash', type: 'ewallet', is_active: true, sort_order: 2, created_at: now },
      { id: randomUUID(), name: 'Credit / Debit Card', type: 'card', is_active: true, sort_order: 3, created_at: now },
      { id: randomUUID(), name: 'Charge to Room', type: 'room', is_active: true, sort_order: 4, created_at: now },
    ],
    guest_payment_settings: [
      {
        id: '00000000-0000-4000-8000-000000000004',
        stripe_enabled: false,
        stripe_link: '',
        stripe_instructions: '',
        gcash_enabled: true,
        gcash_account_name: 'BAIA Resort Palawan',
        gcash_number: '0917-000-0000',
        gcash_qr_image: '',
        qrph_enabled: false,
        qrph_account_name: '',
        qrph_qr_image: '',
        payment_instructions: 'Please review your bill, agree to all charges, then pay using one of the methods below and upload your proof of payment. Reception will verify before check-out.',
        require_admin_verification: true,
        created_at: now,
        updated_at: now,
      },
    ],
    units: [
      { id: u1Id, unit_name: 'Glamping 01', status: 'occupied', active: true, room_type_id: null, created_at: now },
      { id: u2Id, unit_name: 'Glamping 02', status: 'ready', active: true, room_type_id: null, created_at: now },
      { id: u3Id, unit_name: 'Room 01', status: 'needs_cleaning', active: true, room_type_id: null, created_at: now },
      { id: u4Id, unit_name: 'Room 02', status: 'ready', active: true, room_type_id: null, created_at: now },
    ],
    resort_ops_units: [
      { id: roUnit1, name: 'Glamping 01', type: 'glamping', base_price: 4500, capacity: 2, active: true, created_at: now },
      { id: roUnit2, name: 'Glamping 02', type: 'glamping', base_price: 4500, capacity: 2, active: true, created_at: now },
      { id: roUnit3, name: 'Room 01', type: 'suite', base_price: 6000, capacity: 3, active: true, created_at: now },
      { id: roUnit4, name: 'Room 02', type: 'suite', base_price: 6000, capacity: 3, active: true, created_at: now },
    ],
    resort_tables: [
      { id: randomUUID(), table_name: 'Table 1', active: true, created_at: now },
      { id: randomUUID(), table_name: 'Table 2', active: true, created_at: now },
      { id: randomUUID(), table_name: 'Table 3', active: true, created_at: now },
      { id: randomUUID(), table_name: 'Beach Cabana 1', active: true, created_at: now },
    ],
    order_types: [
      { id: randomUUID(), name: 'Room Service', label: 'Room Service', requires_room: true, active: true, sort_order: 1, created_at: now },
      { id: randomUUID(), name: 'DineIn', label: 'Dine-In', requires_table: true, active: true, sort_order: 2, created_at: now },
      { id: randomUUID(), name: 'WalkIn', label: 'Walk-In / Beach', active: true, sort_order: 3, created_at: now },
    ],
    menu_categories: [
      { id: randomUUID(), name: 'Breakfast', department: 'kitchen', sort_order: 1, active: true, created_at: now },
      { id: randomUUID(), name: 'Starters', department: 'kitchen', sort_order: 2, active: true, created_at: now },
      { id: randomUUID(), name: 'Main Courses', department: 'kitchen', sort_order: 3, active: true, created_at: now },
      { id: randomUUID(), name: 'Drinks & Bar', department: 'bar', sort_order: 4, active: true, created_at: now },
    ],
    menu_items: [
      { id: randomUUID(), name: 'Filipino Breakfast', category: 'Breakfast', department: 'kitchen', description: 'Garlic rice, longganisa, fried egg, and pickled papaya.', food_cost: 110, price: 320, image_url: '', available: true, featured: true, sort_order: 1, created_at: now },
      { id: randomUUID(), name: 'Eggs Benedict', category: 'Breakfast', department: 'kitchen', description: 'Poached eggs on toasted English muffin with hollandaise.', food_cost: 130, price: 380, image_url: '', available: true, featured: false, sort_order: 2, created_at: now },
      { id: randomUUID(), name: 'Shrimp Tempura with Wasabi Mayo', category: 'Starters', department: 'kitchen', description: 'Crispy battered shrimp served with creamy wasabi mayo.', food_cost: 160, price: 460, image_url: '', available: true, featured: true, sort_order: 3, created_at: now },
      { id: randomUUID(), name: 'Chicken Adobo', category: 'Main Courses', department: 'kitchen', description: 'Traditional Filipino braised chicken in soy-vinegar glaze with steamed rice.', food_cost: 140, price: 400, image_url: '', available: true, featured: true, sort_order: 4, created_at: now },
      { id: randomUUID(), name: 'Grilled Seafood Platter', category: 'Main Courses', department: 'kitchen', description: 'Grilled prawns, squid, and catch of the day.', food_cost: 450, price: 1200, image_url: '', available: true, featured: true, sort_order: 5, created_at: now },
      { id: randomUUID(), name: 'Fresh Mango Shake', category: 'Drinks & Bar', department: 'bar', description: 'Ripe Palawan mango blended with ice.', food_cost: 35, price: 140, image_url: '', available: true, featured: true, sort_order: 6, created_at: now },
      { id: randomUUID(), name: 'San Miguel Pale Pilsen', category: 'Drinks & Bar', department: 'bar', description: 'Ice-cold local beer.', food_cost: 45, price: 100, image_url: '', available: true, featured: false, sort_order: 7, created_at: now },
    ],
    tours_config: [
      { id: randomUUID(), name: 'Port Barton Island Hopping', description: 'Full-day private boat tour across coral reefs, turtle sanctuary, and starfish island.', price: 1800, duration: 'Full Day (9:00 AM - 4:00 PM)', max_pax: 10, active: true, sort_order: 1, created_at: now },
      { id: randomUUID(), name: 'Long Beach Sunset Cruise', description: 'Scenic cruise along the 14km Long Beach coastline with refreshments.', price: 1200, duration: '3 Hours (3:30 PM - 6:30 PM)', max_pax: 8, active: true, sort_order: 2, created_at: now },
    ],
    transport_rates: [
      { id: randomUUID(), route: 'San Vicente Airport Transfer', vehicle_type: 'Van', price: 600, active: true, sort_order: 1, created_at: now },
      { id: randomUUID(), route: 'Puerto Princesa Private Van', vehicle_type: 'Private Van', price: 6500, active: true, sort_order: 2, created_at: now },
    ],
    rental_rates: [
      { id: randomUUID(), item_name: 'Scooter / Motorbike (24h)', category: 'Vehicle', price: 600, unit: 'day', active: true, sort_order: 1, created_at: now },
      { id: randomUUID(), item_name: 'Crystal Kayak', category: 'Water Sports', price: 400, unit: 'hour', active: true, sort_order: 2, created_at: now },
    ],
    request_categories: [
      { id: randomUUID(), name: 'Extra Towels / Linens', icon: 'Sparkles', active: true, sort_order: 1, created_at: now },
      { id: randomUUID(), name: 'Room Cleaning', icon: 'Brush', active: true, sort_order: 2, created_at: now },
      { id: randomUUID(), name: 'Maintenance / Repair', icon: 'Wrench', active: true, sort_order: 3, created_at: now },
    ],
    review_settings: [
      { id: randomUUID(), category_name: 'Cleanliness & Comfort', active: true, sort_order: 1, created_at: now },
      { id: randomUUID(), category_name: 'Staff Hospitality', active: true, sort_order: 2, created_at: now },
      { id: randomUUID(), category_name: 'Food & Drinks', active: true, sort_order: 3, created_at: now },
    ],
    guest_faq_memory: [
      { id: randomUUID(), question: 'What time is breakfast?', keywords: 'breakfast, morning meal, food time', answer: 'Breakfast is served daily from 7:00 AM to 11:00 AM at the main beachfront dining pavilion.', active: true, sort_order: 1, created_at: now, updated_at: now },
      { id: randomUUID(), question: 'What time is check-in and check-out?', keywords: 'check in, check out, checkout, arrival, departure', answer: 'Standard check-in is at 2:00 PM and check-out is at 11:00 AM. Please let Reception know if you need early check-in or late check-out.', active: true, sort_order: 2, created_at: now, updated_at: now },
      { id: randomUUID(), question: 'How far is San Vicente Airport?', keywords: 'airport, distance, transfer, flight', answer: 'San Vicente Airport is approximately 4.4 km (about 10 minutes) from BAIA Beachfront Boutique Lodge.', active: true, sort_order: 3, created_at: now, updated_at: now },
    ],
    faq_entries: [
      { id: randomUUID(), question: 'What time is breakfast?', answer: 'Breakfast is served daily from 7:00 AM to 10:00 AM po, at the main dining area.', category: 'dining', keywords: ['breakfast', 'dining time', 'meal time'], active: true, created_at: now, updated_at: now },
      { id: randomUUID(), question: 'What time is check-out?', answer: 'Check-out time is 11:00 AM po. Late check-out may be available — I can check with reception for you.', category: 'policies', keywords: ['checkout', 'check out time'], active: true, created_at: now, updated_at: now },
    ],
    employees: [
      {
        id: '33333333-3333-4333-8333-333333333301',
        name: 'David',
        display_name: 'David (Admin)',
        role: 'Manager',
        hourly_rate: 0,
        monthly_rate: 45000,
        rate_type: 'monthly',
        active: true,
        password_hash: 'KdujK7nW+SsLr+bHoXVGIrsrYXl65GZ9EKb2jnVEj3j3e5gN+saqffpsb+Ei9akf', // Default PIN: 5309
        whatsapp_number: '',
        messenger_link: '',
        preferred_contact_method: 'whatsapp',
        created_at: now,
      },
      {
        id: '33333333-3333-4333-8333-333333333302',
        name: 'Maria',
        display_name: 'Maria (Front Desk)',
        role: 'Reception',
        hourly_rate: 120,
        monthly_rate: 18000,
        rate_type: 'daily',
        active: true,
        password_hash: 'O8plwl7Wq4Kss0tGQPLGD3CyfxJ66uPmoVj7XTWqBOgXQ13La4WpInUrps62SQgb', // Default PIN: 1234
        whatsapp_number: '',
        messenger_link: '',
        preferred_contact_method: 'whatsapp',
        created_at: now,
      },
    ],
    employee_permissions: [
      { id: randomUUID(), employee_id: '33333333-3333-4333-8333-333333333301', permission: 'admin', created_at: now },
      { id: randomUUID(), employee_id: '33333333-3333-4333-8333-333333333302', permission: 'reception:edit', created_at: now },
      { id: randomUUID(), employee_id: '33333333-3333-4333-8333-333333333302', permission: 'rooms:edit', created_at: now },
      { id: randomUUID(), employee_id: '33333333-3333-4333-8333-333333333302', permission: 'orders:edit', created_at: now },
    ],
    resort_ops_guests: [
      { id: '44444444-4444-4444-8444-444444444401', full_name: 'Elena Santos', name: 'Elena Santos', email: 'elena@example.com', phone: '+639171234567', country: 'Philippines', created_at: now },
    ],
    resort_ops_bookings: [
      {
        id: '55555555-5555-4555-8555-555555555501',
        guest_id: '44444444-4444-4444-8444-444444444401',
        unit_id: roUnit1,
        room_id: u1Id,
        check_in: today,
        check_out: tomorrow,
        adults: 2,
        children: 0,
        room_rate: 4500,
        addons_total: 0,
        paid_amount: 4500,
        platform: 'Direct',
        status: 'confirmed',
        checked_in_at: now,
        checked_out_at: null,
        notes: 'Welcome fruit basket',
        created_at: now,
      },
    ],
    housekeeping_orders: [
      {
        id: '66666666-6666-4666-8666-666666666601',
        unit_name: 'Room 01',
        status: 'pending_inspection',
        priority: 'normal',
        cleaning_notes: 'Standard turnover',
        cleaning_completed_at: null,
        created_at: now,
      },
    ],
    orders: [],
    tabs: [],
    room_transactions: [],
    guest_requests: [],
    guest_reviews: [],
    tour_bookings: [],
    guest_tours: [],
    resort_ops_tasks: [],
    resort_ops_expenses: [],
    ops_cases: [],
    audit_log: [],
    webhook_events: [],
    bill_disputes: [],
    employee_tasks: [],
    employee_shifts: [],
    employee_bonuses: [],
    payroll_payments: [],
    payroll_settings: [],
    weekly_schedules: [],
    time_entries: [],
    ingredients: [],
    recipe_ingredients: [],
    inventory_logs: [],
    devices: [],
    dining_reservations: [],
    app_options: [],
    invoice_settings: [],
    cleaning_packages: [],
    cleaning_package_items: [],
    housekeeping_checklists: [],
    guest_documents: [],
    guest_notes: [],
    guest_payment_submissions: [],
    task_comments: [],
    room_types: [],
  };
}

// ── Embedded Store Persistence ──────────────────────────────────────────────
let memoryStore = null;
let saveQueue = Promise.resolve();

async function getEmbeddedStore() {
  if (memoryStore) return memoryStore;
  try {
    const raw = await readFile(DEFAULT_STORE_PATH, 'utf8');
    memoryStore = JSON.parse(raw);
    return memoryStore;
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('[kapwa-db] Failed to read local DB store, re-initializing:', err.message);
    }
    memoryStore = createSeedStore();
    await persistEmbeddedStore();
    return memoryStore;
  }
}

async function persistEmbeddedStore() {
  if (!memoryStore) return;
  saveQueue = saveQueue.then(async () => {
    try {
      await mkdir(dirname(DEFAULT_STORE_PATH), { recursive: true });
      const tmp = `${DEFAULT_STORE_PATH}.tmp`;
      await writeFile(tmp, JSON.stringify(memoryStore, null, 2), 'utf8');
      await rename(tmp, DEFAULT_STORE_PATH);
    } catch (err) {
      console.error('[kapwa-db] Could not persist embedded store:', err.message);
    }
  });
  return saveQueue;
}

// ── Neon PostgreSQL Pool ────────────────────────────────────────────────────
let pgPool = null;

export function getDatabaseUrl() {
  return (process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '').trim();
}

export function isNeonConfigured() {
  return Boolean(getDatabaseUrl());
}

function getPgPool() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) return null;
  if (!pgPool) {
    pgPool = new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return pgPool;
}

export async function getDbStatus() {
  const pool = getPgPool();
  if (pool) {
    try {
      await pool.query('SELECT 1');
      return { backend: 'neon-postgres', connected: true, neonConfigured: true };
    } catch (err) {
      return { backend: 'neon-postgres', connected: false, neonConfigured: true, error: err.message };
    }
  }
  await getEmbeddedStore();
  return { backend: 'embedded-store', connected: true, neonConfigured: false };
}

// ── Filter Matching (Embedded Store + OR Expression Parser) ─────────────────
function parseLiteralValue(valStr) {
  const s = String(valStr ?? '').trim();
  if (s === 'null' || s === 'NULL') return null;
  if (s === 'true' || s === 'TRUE') return true;
  if (s === 'false' || s === 'FALSE') return false;
  return s;
}

function matchesFilter(row, filter) {
  const { op, column, value, operator } = filter;
  const actual = row?.[column];

  switch (op) {
    case 'eq':
      return actual === value || (actual != null && value != null && String(actual) === String(value));
    case 'neq':
      return actual !== value && String(actual ?? '') !== String(value ?? '');
    case 'gt':
      return actual != null && actual > value;
    case 'gte':
      return actual != null && actual >= value;
    case 'lt':
      return actual != null && actual < value;
    case 'lte':
      return actual != null && actual <= value;
    case 'like': {
      if (actual == null) return false;
      const regex = new RegExp('^' + String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$');
      return regex.test(String(actual));
    }
    case 'ilike': {
      if (actual == null) return false;
      const regex = new RegExp('^' + String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
      return regex.test(String(actual));
    }
    case 'is':
      if (value === null) return actual === null || actual === undefined;
      return actual === value;
    case 'in': {
      const list = Array.isArray(value)
        ? value
        : String(value).replace(/^[()]/, '').replace(/[()]$/, '').split(',').map((x) => x.trim());
      return list.some((item) => item === actual || String(item) === String(actual));
    }
    case 'not': {
      if (operator === 'in') {
        const list = Array.isArray(value)
          ? value
          : String(value).replace(/^[()]/, '').replace(/[()]$/, '').split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, ''));
        return !list.some((item) => item === actual || String(item) === String(actual));
      }
      if (operator === 'is') {
        const target = parseLiteralValue(value);
        if (target === null) return actual !== null && actual !== undefined;
        return actual !== target;
      }
      if (operator === 'eq') {
        return actual !== value;
      }
      return true;
    }
    case 'or': {
      // Example: "captain_confirmed.is.null,captain_confirmed.eq.false,guide_confirmed.is.null,guide_confirmed.eq.false"
      const clauses = String(filter.expr || value || '').split(',').map((c) => c.trim()).filter(Boolean);
      if (clauses.length === 0) return true;
      return clauses.some((clause) => {
        const parts = clause.split('.');
        if (parts.length < 3) return false;
        const [col, subOp, ...rest] = parts;
        const subVal = parseLiteralValue(rest.join('.'));
        return matchesFilter(row, { op: subOp, column: col, value: subVal });
      });
    }
    default:
      return true;
  }
}

function attachRelationsInMemory(store, table, rows, relations) {
  if (!relations || relations.length === 0) return rows;
  const tableRelMap = RELATIONS[table] || {};

  return rows.map((row) => {
    const enriched = { ...row };
    for (const rel of relations) {
      const relConfig = tableRelMap[rel.table] || {
        targetTable: rel.table,
        localKey: rel.fkHint || `${rel.table.replace(/s$/, '')}_id`,
        targetKey: 'id',
      };
      const fkVal = row[relConfig.localKey] ?? (relConfig.fallbackLocalKey ? row[relConfig.fallbackLocalKey] : undefined);
      if (!fkVal) {
        enriched[rel.alias] = null;
        continue;
      }
      const targetRows = store[relConfig.targetTable] || [];
      const found = targetRows.find((r) => String(r[relConfig.targetKey]) === String(fkVal)) || null;
      if (!found) {
        enriched[rel.alias] = null;
        continue;
      }
      // Normalize resort_ops_guests name <-> full_name compatibility
      const normalizedFound = { ...found };
      if (relConfig.targetTable === 'resort_ops_guests') {
        if (normalizedFound.full_name && !normalizedFound.name) normalizedFound.name = normalizedFound.full_name;
        if (normalizedFound.name && !normalizedFound.full_name) normalizedFound.full_name = normalizedFound.name;
      }
      if (rel.star) {
        enriched[rel.alias] = normalizedFound;
      } else {
        const picked = {};
        for (const col of rel.columns) {
          picked[col] = normalizedFound[col] ?? null;
        }
        enriched[rel.alias] = picked;
      }
    }
    return enriched;
  });
}

function projectColumns(rows, parsedSelect) {
  if (parsedSelect.star) return rows;
  const keep = new Set([
    ...parsedSelect.columns,
    ...parsedSelect.relations.map((r) => r.alias),
  ]);
  if (keep.size === 0) return rows;
  return rows.map((row) => {
    const out = {};
    for (const key of keep) {
      if (key in row) out[key] = row[key];
    }
    return out;
  });
}

// ── SQL Builder for Neon PostgreSQL ─────────────────────────────────────────
function buildWhereClause(filters = [], startParamIdx = 1) {
  const clauses = [];
  const values = [];
  let idx = startParamIdx;

  for (const f of filters) {
    const { op, column, value, operator } = f;
    if (op === 'or') {
      const orParts = String(value || '').split(',').map((c) => c.trim()).filter(Boolean);
      const subClauses = [];
      for (const part of orParts) {
        const segs = part.split('.');
        if (segs.length < 3) continue;
        const col = assertIdentifier(segs[0], 'column');
        const subOp = segs[1];
        const rawVal = parseLiteralValue(segs.slice(2).join('.'));
        if (subOp === 'is' && rawVal === null) {
          subClauses.push(`"${col}" IS NULL`);
        } else if (subOp === 'eq') {
          values.push(rawVal);
          subClauses.push(`"${col}" = $${idx++}`);
        } else if (subOp === 'ilike') {
          values.push(rawVal);
          subClauses.push(`"${col}" ILIKE $${idx++}`);
        }
      }
      if (subClauses.length > 0) {
        clauses.push(`(${subClauses.join(' OR ')})`);
      }
      continue;
    }

    const col = assertIdentifier(column, 'column');
    switch (op) {
      case 'eq':
        values.push(value);
        clauses.push(`"${col}" = $${idx++}`);
        break;
      case 'neq':
        values.push(value);
        clauses.push(`"${col}" != $${idx++}`);
        break;
      case 'gt':
        values.push(value);
        clauses.push(`"${col}" > $${idx++}`);
        break;
      case 'gte':
        values.push(value);
        clauses.push(`"${col}" >= $${idx++}`);
        break;
      case 'lt':
        values.push(value);
        clauses.push(`"${col}" < $${idx++}`);
        break;
      case 'lte':
        values.push(value);
        clauses.push(`"${col}" <= $${idx++}`);
        break;
      case 'like':
        values.push(value);
        clauses.push(`"${col}" LIKE $${idx++}`);
        break;
      case 'ilike':
        values.push(value);
        clauses.push(`"${col}" ILIKE $${idx++}`);
        break;
      case 'is':
        if (value === null) clauses.push(`"${col}" IS NULL`);
        else if (value === true) clauses.push(`"${col}" IS TRUE`);
        else if (value === false) clauses.push(`"${col}" IS FALSE`);
        break;
      case 'in': {
        const list = Array.isArray(value)
          ? value
          : String(value).replace(/^[()]/, '').replace(/[()]$/, '').split(',').map((x) => x.trim());
        if (list.length === 0) {
          clauses.push('FALSE');
        } else {
          values.push(list);
          clauses.push(`"${col}" = ANY($${idx++})`);
        }
        break;
      }
      case 'not': {
        if (operator === 'in') {
          const list = Array.isArray(value)
            ? value
            : String(value).replace(/^[()]/, '').replace(/[()]$/, '').split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, ''));
          if (list.length > 0) {
            values.push(list);
            clauses.push(`NOT ("${col}" = ANY($${idx++}))`);
          }
        } else if (operator === 'is') {
          const target = parseLiteralValue(value);
          if (target === null) clauses.push(`"${col}" IS NOT NULL`);
          else if (target === true) clauses.push(`"${col}" IS NOT TRUE`);
          else if (target === false) clauses.push(`"${col}" IS NOT FALSE`);
        } else if (operator === 'eq') {
          values.push(value);
          clauses.push(`"${col}" != $${idx++}`);
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
    nextIdx: idx,
  };
}

async function attachRelationsPostgres(pool, table, rows, relations) {
  if (!relations || relations.length === 0 || rows.length === 0) return rows;
  const tableRelMap = RELATIONS[table] || {};
  const enriched = rows.map((r) => ({ ...r }));

  for (const rel of relations) {
    const relConfig = tableRelMap[rel.table] || {
      targetTable: rel.table,
      localKey: rel.fkHint || `${rel.table.replace(/s$/, '')}_id`,
      targetKey: 'id',
    };
    const targetTable = assertIdentifier(relConfig.targetTable, 'table');
    const targetKey = assertIdentifier(relConfig.targetKey, 'column');

    const fkVals = [...new Set(
      enriched
        .map((r) => r[relConfig.localKey] ?? (relConfig.fallbackLocalKey ? r[relConfig.fallbackLocalKey] : null))
        .filter(Boolean),
    )];

    if (fkVals.length === 0) {
      for (const r of enriched) r[rel.alias] = null;
      continue;
    }

    const { rows: targetRows } = await pool.query(
      `SELECT * FROM public."${targetTable}" WHERE "${targetKey}" = ANY($1)`,
      [fkVals],
    );
    const byId = new Map(targetRows.map((tr) => [String(tr[targetKey]), tr]));

    for (const r of enriched) {
      const fkVal = r[relConfig.localKey] ?? (relConfig.fallbackLocalKey ? r[relConfig.fallbackLocalKey] : null);
      const found = fkVal ? byId.get(String(fkVal)) : null;
      if (!found) {
        r[rel.alias] = null;
        continue;
      }
      const normalizedFound = { ...found };
      if (targetTable === 'resort_ops_guests') {
        if (normalizedFound.full_name && !normalizedFound.name) normalizedFound.name = normalizedFound.full_name;
        if (normalizedFound.name && !normalizedFound.full_name) normalizedFound.full_name = normalizedFound.name;
      }
      if (rel.star) {
        r[rel.alias] = normalizedFound;
      } else {
        const picked = {};
        for (const col of rel.columns) picked[col] = normalizedFound[col] ?? null;
        r[rel.alias] = picked;
      }
    }
  }

  return enriched;
}

/**
 * Execute a structured database query against Neon PostgreSQL (when DATABASE_URL
 * is set) or the embedded store fallback.
 */
export async function executeQuery(spec) {
  const {
    table: rawTable,
    action = 'select',
    select = '*',
    filters = [],
    orders = [],
    limit: rawLimit = null,
    offset: rawOffset = null,
    range = null,
    values = null,
    onConflict = null,
    single: rawSingle = false,
    maybeSingle: rawMaybeSingle = false,
    singleMode = null,
    head = false,
    count = null,
  } = spec;

  const single = Boolean(rawSingle || singleMode === 'single');
  const maybeSingle = Boolean(rawMaybeSingle || singleMode === 'maybeSingle');
  const offset = rawOffset != null ? Number(rawOffset) : range?.from != null ? Number(range.from) : null;
  const limit =
    rawLimit != null
      ? Number(rawLimit)
      : range?.from != null && range?.to != null
        ? Number(range.to) - Number(range.from) + 1
        : null;

  const table = assertIdentifier(rawTable, 'table');
  const parsedSelect = parseSelectColumns(select);
  const pool = getPgPool();

  if (pool) {
    try {
      if (action === 'select') {
        const { whereSql, values: whereVals } = buildWhereClause(filters, 1);
        let orderSql = '';
        if (orders && orders.length > 0) {
          const parts = orders.map((o) => {
            const col = assertIdentifier(o.column, 'column');
            const dir = o.ascending === false ? 'DESC' : 'ASC';
            return `"${col}" ${dir}`;
          });
          orderSql = `ORDER BY ${parts.join(', ')}`;
        }
        const limitSql = limit != null && Number.isFinite(limit) ? `LIMIT ${Math.max(0, limit)}` : '';
        const offsetSql = offset != null && Number.isFinite(offset) ? `OFFSET ${Math.max(0, offset)}` : '';

        if (head && count) {
          const { rows: countRows } = await pool.query(
            `SELECT COUNT(*)::int AS total FROM public."${table}" ${whereSql}`,
            whereVals,
          );
          return { data: null, count: countRows[0]?.total ?? 0, error: null };
        }

        const sql = `SELECT * FROM public."${table}" ${whereSql} ${orderSql} ${limitSql} ${offsetSql}`;
        const { rows } = await pool.query(sql, whereVals);
        const withRelations = await attachRelationsPostgres(pool, table, rows, parsedSelect.relations);
        const projected = projectColumns(withRelations, parsedSelect);

        if (single) {
          if (projected.length === 0) {
            return { data: null, error: { message: 'Row not found', code: 'PGRST116' }, count: 0 };
          }
          return { data: projected[0], error: null, count: projected.length };
        }
        if (maybeSingle) {
          return { data: projected[0] ?? null, error: null, count: projected.length };
        }
        return {
          data: projected,
          error: null,
          count: count ? projected.length : undefined,
        };
      }

      if (action === 'insert' || action === 'upsert') {
        const rowsToInsert = Array.isArray(values) ? values : [values || {}];
        const insertedRows = [];

        for (const item of rowsToInsert) {
          const cleanItem = { ...item };
          if (table === 'resort_ops_guests' && cleanItem.name && !cleanItem.full_name) {
            cleanItem.full_name = cleanItem.name;
            delete cleanItem.name;
          }
          const keys = Object.keys(cleanItem).filter((k) => cleanItem[k] !== undefined).map((k) => assertIdentifier(k, 'column'));
          const vals = keys.map((k) => cleanItem[k]);
          const colsSql = keys.length > 0 ? `(${keys.map((k) => `"${k}"`).join(', ')})` : '';
          const placeholders = keys.length > 0 ? `VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})` : 'DEFAULT VALUES';

          let conflictSql = '';
          if (action === 'upsert') {
            const conflictCol = assertIdentifier(onConflict || 'id', 'column');
            const updateAssigns = keys
              .filter((k) => k !== conflictCol)
              .map((k) => `"${k}" = EXCLUDED."${k}"`);
            conflictSql = updateAssigns.length > 0
              ? `ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateAssigns.join(', ')}`
              : `ON CONFLICT ("${conflictCol}") DO NOTHING`;
          }

          const { rows } = await pool.query(
            `INSERT INTO public."${table}" ${colsSql} ${placeholders} ${conflictSql} RETURNING *`,
            vals,
          );
          if (rows[0]) insertedRows.push(rows[0]);
        }

        const withRelations = await attachRelationsPostgres(pool, table, insertedRows, parsedSelect.relations);
        const projected = projectColumns(withRelations, parsedSelect);
        if (single || maybeSingle) {
          return { data: projected[0] ?? null, error: null };
        }
        return { data: projected, error: null };
      }

      if (action === 'update') {
        const patch = { ...(values || {}) };
        const keys = Object.keys(patch).filter((k) => patch[k] !== undefined).map((k) => assertIdentifier(k, 'column'));
        if (keys.length === 0) return { data: [], error: null };
        const setSql = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const setVals = keys.map((k) => patch[k]);
        const { whereSql, values: whereVals } = buildWhereClause(filters, keys.length + 1);

        const { rows } = await pool.query(
          `UPDATE public."${table}" SET ${setSql} ${whereSql} RETURNING *`,
          [...setVals, ...whereVals],
        );
        const withRelations = await attachRelationsPostgres(pool, table, rows, parsedSelect.relations);
        const projected = projectColumns(withRelations, parsedSelect);
        if (single || maybeSingle) {
          return { data: projected[0] ?? null, error: null };
        }
        return { data: projected, error: null };
      }

      if (action === 'delete') {
        const { whereSql, values: whereVals } = buildWhereClause(filters, 1);
        const { rows } = await pool.query(
          `DELETE FROM public."${table}" ${whereSql} RETURNING *`,
          whereVals,
        );
        if (single || maybeSingle) {
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      }
    } catch (err) {
      return {
        data: null,
        error: { message: err.message || String(err), code: err.code || 'DB_ERROR' },
      };
    }
  }

  // ── Embedded Store Execution ──────────────────────────────────────────────
  const store = await getEmbeddedStore();
  if (!Array.isArray(store[table])) {
    store[table] = [];
  }
  const tableRows = store[table];

  if (action === 'select') {
    let matched = tableRows.filter((row) => filters.every((f) => matchesFilter(row, f)));

    if (head && count) {
      return { data: null, count: matched.length, error: null };
    }

    if (orders && orders.length > 0) {
      matched = [...matched].sort((a, b) => {
        for (const o of orders) {
          const av = a?.[o.column];
          const bv = b?.[o.column];
          if (av === bv) continue;
          if (av == null) return 1;
          if (bv == null) return -1;
          const cmp = av < bv ? -1 : 1;
          return o.ascending === false ? -cmp : cmp;
        }
        return 0;
      });
    }

    const totalCount = matched.length;
    if (offset != null && Number.isFinite(offset)) {
      matched = matched.slice(offset);
    }
    if (limit != null && Number.isFinite(limit)) {
      matched = matched.slice(0, limit);
    }

    const withRelations = attachRelationsInMemory(store, table, matched, parsedSelect.relations);
    const projected = projectColumns(withRelations, parsedSelect);

    if (single) {
      if (projected.length === 0) {
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' }, count: 0 };
      }
      return { data: projected[0], error: null, count: 1 };
    }
    if (maybeSingle) {
      return { data: projected[0] ?? null, error: null, count: projected.length };
    }
    return {
      data: projected,
      error: null,
      count: count ? totalCount : undefined,
    };
  }

  if (action === 'insert' || action === 'upsert') {
    const inputList = Array.isArray(values) ? values : [values || {}];
    const now = new Date().toISOString();
    const resultRows = [];

    for (const item of inputList) {
      // Check unique constraint on webhook_events.event_id
      if (table === 'webhook_events' && item.event_id) {
        const dup = tableRows.find((r) => r.event_id === item.event_id);
        if (dup && action === 'insert') {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
      }

      const conflictCol = onConflict || 'id';
      if (action === 'upsert' && item[conflictCol]) {
        const existingIdx = tableRows.findIndex((r) => String(r[conflictCol]) === String(item[conflictCol]));
        if (existingIdx >= 0) {
          tableRows[existingIdx] = {
            ...tableRows[existingIdx],
            ...item,
            updated_at: now,
          };
          resultRows.push(tableRows[existingIdx]);
          continue;
        }
      }

      const newRow = {
        id: item.id || randomUUID(),
        created_at: item.created_at || now,
        ...item,
      };
      if (table === 'resort_ops_guests') {
        if (newRow.full_name && !newRow.name) newRow.name = newRow.full_name;
        if (newRow.name && !newRow.full_name) newRow.full_name = newRow.name;
      }
      tableRows.push(newRow);
      resultRows.push(newRow);
    }

    await persistEmbeddedStore();
    const withRelations = attachRelationsInMemory(store, table, resultRows, parsedSelect.relations);
    const projected = projectColumns(withRelations, parsedSelect);

    if (single || maybeSingle) {
      return { data: projected[0] ?? null, error: null };
    }
    return { data: projected, error: null };
  }

  if (action === 'update') {
    const now = new Date().toISOString();
    const updatedRows = [];
    for (let i = 0; i < tableRows.length; i++) {
      if (filters.every((f) => matchesFilter(tableRows[i], f))) {
        tableRows[i] = {
          ...tableRows[i],
          ...(values || {}),
          updated_at: values?.updated_at ?? now,
        };
        updatedRows.push(tableRows[i]);
      }
    }
    await persistEmbeddedStore();
    const withRelations = attachRelationsInMemory(store, table, updatedRows, parsedSelect.relations);
    const projected = projectColumns(withRelations, parsedSelect);
    if (single || maybeSingle) {
      return { data: projected[0] ?? null, error: null };
    }
    return { data: projected, error: null };
  }

  if (action === 'delete') {
    const remaining = [];
    const deleted = [];
    for (const row of tableRows) {
      if (filters.every((f) => matchesFilter(row, f))) {
        deleted.push(row);
      } else {
        remaining.push(row);
      }
    }
    store[table] = remaining;
    await persistEmbeddedStore();
    if (single || maybeSingle) {
      return { data: deleted[0] ?? null, error: null };
    }
    return { data: deleted, error: null };
  }

  return { data: null, error: { message: `Unsupported action: ${action}` } };
}

/**
 * Execute an RPC stored procedure (such as `decrement_stock`).
 */
export async function executeRpc(fnName, args = {}) {
  const pool = getPgPool();
  if (fnName === 'decrement_stock') {
    const ingredientId = args.p_ingredient_id;
    const amount = Number(args.p_amount || 0);
    if (!ingredientId) return { data: null, error: { message: 'p_ingredient_id is required' } };

    if (pool) {
      try {
        await pool.query('SELECT public.decrement_stock($1, $2)', [ingredientId, amount]);
        return { data: true, error: null };
      } catch (err) {
        return { data: null, error: { message: err.message } };
      }
    }

    const store = await getEmbeddedStore();
    const ingredients = store.ingredients || [];
    const target = ingredients.find((ing) => String(ing.id) === String(ingredientId));
    if (target) {
      target.current_stock = Math.max(0, Number(target.current_stock || 0) - amount);
      await persistEmbeddedStore();
    }
    return { data: true, error: null };
  }

  return { data: null, error: { message: `Unknown RPC function: ${fnName}` } };
}

/**
 * Create a chainable server-side query builder compatible with `.from(table)...`
 * so all backend services & agents can query Neon PostgreSQL / Embedded Store
 * with a clean, familiar API and zero Supabase dependency.
 */
export function createInternalClient({ invokeFunction, onMutation } = {}) {
  function from(table) {
    const state = {
      table,
      action: 'select',
      select: '*',
      filters: [],
      orders: [],
      limit: null,
      offset: null,
      values: null,
      onConflict: null,
      single: false,
      maybeSingle: false,
      head: false,
      count: null,
    };

    const builder = {
      select(cols = '*', opts = {}) {
        state.select = cols || '*';
        if (opts?.head) state.head = true;
        if (opts?.count) state.count = opts.count;
        return builder;
      },
      insert(payload) {
        state.action = 'insert';
        state.values = payload;
        return builder;
      },
      update(payload) {
        state.action = 'update';
        state.values = payload;
        return builder;
      },
      upsert(payload, opts = {}) {
        state.action = 'upsert';
        state.values = payload;
        if (opts?.onConflict) state.onConflict = opts.onConflict;
        return builder;
      },
      delete() {
        state.action = 'delete';
        return builder;
      },
      eq(column, value) {
        state.filters.push({ op: 'eq', column, value });
        return builder;
      },
      neq(column, value) {
        state.filters.push({ op: 'neq', column, value });
        return builder;
      },
      gt(column, value) {
        state.filters.push({ op: 'gt', column, value });
        return builder;
      },
      gte(column, value) {
        state.filters.push({ op: 'gte', column, value });
        return builder;
      },
      lt(column, value) {
        state.filters.push({ op: 'lt', column, value });
        return builder;
      },
      lte(column, value) {
        state.filters.push({ op: 'lte', column, value });
        return builder;
      },
      like(column, value) {
        state.filters.push({ op: 'like', column, value });
        return builder;
      },
      ilike(column, value) {
        state.filters.push({ op: 'ilike', column, value });
        return builder;
      },
      is(column, value) {
        state.filters.push({ op: 'is', column, value });
        return builder;
      },
      in(column, value) {
        state.filters.push({ op: 'in', column, value });
        return builder;
      },
      not(column, operator, value) {
        state.filters.push({ op: 'not', column, operator, value });
        return builder;
      },
      or(expr) {
        state.filters.push({ op: 'or', value: expr });
        return builder;
      },
      order(column, opts = {}) {
        state.orders.push({ column, ascending: opts?.ascending !== false });
        return builder;
      },
      limit(n) {
        state.limit = n;
        return builder;
      },
      range(fromIdx, toIdx) {
        state.offset = fromIdx;
        state.limit = toIdx - fromIdx + 1;
        return builder;
      },
      single() {
        state.single = true;
        return builder;
      },
      maybeSingle() {
        state.maybeSingle = true;
        return builder;
      },
      async execute() {
        const res = await executeQuery(state);
        if (!res.error && state.action !== 'select' && onMutation) {
          onMutation({
            table: state.table,
            eventType: state.action === 'delete' ? 'DELETE' : state.action === 'update' ? 'UPDATE' : 'INSERT',
            new: Array.isArray(res.data) ? res.data[0] ?? null : res.data ?? null,
          });
        }
        return res;
      },
      then(onFulfilled, onRejected) {
        return builder.execute().then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  return {
    from,
    rpc(fnName, args) {
      return executeRpc(fnName, args);
    },
    functions: {
      async invoke(name, opts = {}) {
        if (!invokeFunction) {
          return { data: null, error: { message: 'Function dispatcher not attached' } };
        }
        return invokeFunction(name, opts);
      },
    },
  };
}
