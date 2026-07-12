import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERNAL_FN_SECRET = process.env.INTERNAL_FN_SECRET;

function assertConfigured() {
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL or SUPABASE_URL is required');
  if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  if (!INTERNAL_FN_SECRET) throw new Error('INTERNAL_FN_SECRET is required for edge function calls');
}

const ALLOWED_ACTIONS = new Set([
  'CREATE_HOUSEKEEPING_ORDER',
  'ESCALATE_GUEST_REQUEST',
  'CREATE_TASK',
]);

const AUTO_EXECUTE_ACTIONS = new Set([
  // Actions that the agent may execute automatically without human approval.
  // Keep conservative: currently none by default. Adjust after review.
]);

async function supabaseRequest(path, init = {}) {
  const url = `${SUPABASE_URL}${path.startsWith('/rest') ? '' : '/rest/v1'}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`Supabase request failed (${res.status}): ${data?.message || text}`);
  }
  return data;
}

async function invokeEdgeFunction(name, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'x-internal-secret': INTERNAL_FN_SECRET,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${name} edge function returned ${res.status}: ${data?.error || text}`);
  }
  if (data?.ok === false) {
    throw new Error(data.error || `${name} edge function failed`);
  }
  return data;
}

async function logAudit(action, recordId, details) {
  try {
    await supabaseRequest('/audit_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        action,
        table_name: 'resort_operator_actions',
        record_id: String(recordId),
        details: typeof details === 'string' ? details : JSON.stringify(details),
        employee_name: 'resort-operator',
      }),
    });
  } catch (err) {
    console.error('[operator] audit log failed:', err.message);
  }
}

async function fetchOperationalState() {
  const today = new Date().toISOString().slice(0, 10);

  const [
    units,
    arrivals,
    departures,
    guestRequests,
    housekeepingOrders,
    tasks,
    cases,
  ] = await Promise.all([
    supabaseRequest('/units?select=*&active=eq.true'),
    supabaseRequest(`/resort_ops_bookings?select=*,resort_ops_guests(name),resort_ops_units(name)&check_in=eq.${today}`),
    supabaseRequest(`/resort_ops_bookings?select=id,guest_id,unit_id,check_out,room_rate,addons_total,paid_amount,resort_ops_guests(name),resort_ops_units(name)&check_out=gte.${today}&check_out=lte.${today}`),
    supabaseRequest('/guest_requests?select=*&status=not.in.(completed,cancelled,escalated)'),
    supabaseRequest('/housekeeping_orders?select=*&status=not.in.(completed,cancelled)'),
    supabaseRequest('/resort_ops_tasks?select=*&status=eq.pending'),
    supabaseRequest('/ops_cases?select=*&status=not.in.(resolved,closed)'),
  ]);

  const overdueCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const overdueRequests = (guestRequests || []).filter(r => new Date(r.created_at) < new Date(overdueCutoff));

  return {
    today,
    units: Array.isArray(units) ? units : [],
    arrivals: Array.isArray(arrivals) ? arrivals : [],
    departures: Array.isArray(departures) ? departures : [],
    guestRequests: Array.isArray(guestRequests) ? guestRequests : [],
    overdueRequests: Array.isArray(overdueRequests) ? overdueRequests : [],
    housekeepingOrders: Array.isArray(housekeepingOrders) ? housekeepingOrders : [],
    tasks: Array.isArray(tasks) ? tasks : [],
    cases: Array.isArray(cases) ? cases : [],
  };
}

function buildBrief(state) {
  const { today, arrivals, departures, units, overdueRequests, housekeepingOrders, tasks, cases } = state;
  const dirtyUnits = units.filter(u => u.status === 'dirty' || u.status === 'needs_cleaning');
  const occupiedUnits = units.filter(u => u.status === 'occupied');

  const summary = [
    `KAPWA Resort Operator brief for ${today}`,
    `Occupancy: ${occupiedUnits.length} / ${units.length}`,
    `Arrivals today: ${arrivals.length}`,
    `Departures today: ${departures.length}`,
    `Dirty units needing cleaning: ${dirtyUnits.length}`,
    `Active housekeeping orders: ${housekeepingOrders.length}`,
    `Open guest requests: ${state.guestRequests.length}`,
    `Overdue guest requests: ${overdueRequests.length}`,
    `Pending tasks: ${tasks.length}`,
    `Open operator cases: ${cases.length}`,
  ].join('\n');

  return {
    summary,
    metrics: {
      total_units: units.length,
      occupied: occupiedUnits.length,
      dirty: dirtyUnits.length,
      arrivals: arrivals.length,
      departures: departures.length,
      open_requests: state.guestRequests.length,
      overdue_requests: overdueRequests.length,
      pending_housekeeping: housekeepingOrders.length,
      pending_tasks: tasks.length,
      open_cases: cases.length,
    },
    generated_at: new Date().toISOString(),
    mode: 'deterministic',
  };
}

function buildLLMMessages({ state, brief, question }) {
  const prompt = [
    `You are the KAPWA Resort Operator AI. Analyze the following daily resort snapshot and brief.`,
    `Manager question: ${question || 'What needs my attention right now?'}`,
    brief.summary,
    `Key metrics: ${JSON.stringify(brief.metrics)}`,
    `Provide a short operational analysis, flag urgent risks, and recommend the top 2-3 priorities. Do not invent guests, bookings, or amounts; base everything on the provided snapshot.`,
  ].join('\n\n');

  return [
    { role: 'system', content: 'You are a precise resort operations analyst. Be concise and actionable. Never invent data.' },
    { role: 'user', content: prompt },
  ];
}

function proposeActions(state) {
  const actions = [];
  // CREATE_HOUSEKEEPING_ORDER: dirty units without an active housekeeping order
  const activeUnitNames = new Set(state.housekeepingOrders.map(h => h.unit_name));
  state.units
    .filter(u => (u.status === 'dirty' || u.status === 'needs_cleaning') && !activeUnitNames.has(u.unit_name))
    .forEach(unit => {
      actions.push({
        id: randomUUID(),
        action_type: 'CREATE_HOUSEKEEPING_ORDER',
        title: `Create housekeeping order for ${unit.unit_name || unit.id}`,
        description: `Unit ${unit.unit_name || unit.id} is ${unit.status} and has no active housekeeping order.`,
        target_id: unit.id,
        payload: { unit_id: unit.id, unit_name: unit.unit_name || unit.id },
        risk_level: 'medium',
        status: 'proposed',
        created_at: new Date().toISOString(),
      });
    });

  // ESCALATE_GUEST_REQUEST: overdue requests
  state.overdueRequests.forEach(req => {
    actions.push({
      id: randomUUID(),
      action_type: 'ESCALATE_GUEST_REQUEST',
      title: `Escalate overdue guest request: ${req.request_type || 'general'}`,
      description: `Guest request from ${req.guest_name || 'guest'} is past the 2-hour SLA.`,
      target_id: req.id,
      payload: { request_id: req.id },
      risk_level: 'high',
      status: 'proposed',
      created_at: new Date().toISOString(),
    });
  });

  // CREATE_TASK: overdue pending tasks without a case already
  const taskCaseIds = new Set(state.cases.filter(c => c.domain === 'task').map(c => c.source_id));
  state.tasks
    .filter(t => t.due_date && new Date(t.due_date) < new Date() && !taskCaseIds.has(t.id))
    .slice(0, 10)
    .forEach(task => {
      actions.push({
        id: randomUUID(),
        action_type: 'CREATE_TASK',
        title: `Create follow-up task: ${task.title || 'Overdue task'}`,
        description: task.description || task.title || 'Overdue pending task needs follow-up.',
        target_id: task.id,
        payload: { task_id: task.id, title: task.title, due_date: task.due_date },
        risk_level: 'medium',
        status: 'proposed',
        created_at: new Date().toISOString(),
      });
    });

  return actions;
}

export function createResortOperatorAgent({ runConfiguredModel }) {
  return {
    async getState() {
      assertConfigured();
      return fetchOperationalState();
    },

    async runCycle(settings, options = {}) {
      assertConfigured();
      const runId = randomUUID();
      const useLLM = options.useLLM !== false;
      const question = options.question || 'What needs my attention right now?';

      const state = await fetchOperationalState();
      const brief = buildBrief(state);

      let llmAnalysis = null;
      if (useLLM && settings?.enabled) {
        try {
          const messages = buildLLMMessages({ state, brief, question });
          llmAnalysis = await runConfiguredModel(settings, messages);
        } catch (err) {
          console.error('[operator] LLM analysis failed:', err.message);
          llmAnalysis = { error: err.message };
        }
      }

      const proposedActions = proposeActions(state);

      await logAudit('operator_run', runId, {
        type: options.type || 'daily',
        actions: proposedActions.length,
        question,
      });

      return {
        id: runId,
        ok: true,
        date: state.today,
        brief,
        llm_analysis: llmAnalysis,
        proposed_actions: proposedActions,
        snapshot_summary: brief.metrics,
        created_at: new Date().toISOString(),
      };
    },

    async executeAction(action, actor = 'admin') {
      assertConfigured();
      if (!ALLOWED_ACTIONS.has(action.action_type)) {
        throw new Error(`Action type ${action.action_type} is not in the allow-list`);
      }

      const result = await invokeEdgeFunction('resort-operator', {
        action: 'execute',
        action_type: action.action_type,
        payload: action.payload || {},
        actor,
      });

      await logAudit('action_executed', action.id || randomUUID(), {
        action_type: action.action_type,
        payload: action.payload,
        actor,
        result,
      });

      return { ok: true, ...result.result };
    },
  };
}
