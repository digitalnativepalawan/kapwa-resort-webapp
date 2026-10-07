import { randomUUID } from 'node:crypto';
import { createInternalClient } from '../db/adapter.js';

const ALLOWED_ACTIONS = new Set([
  'CREATE_HOUSEKEEPING_ORDER',
  'ESCALATE_GUEST_REQUEST',
  'CREATE_TASK',
]);

export function createResortOperatorAgent({ runConfiguredModel, db = createInternalClient() }) {
  async function logAudit(action, recordId, details) {
    try {
      await db.from('audit_log').insert({
        action,
        table_name: 'resort_operator_actions',
        record_id: String(recordId),
        details: typeof details === 'string' ? details : JSON.stringify(details),
        employee_name: 'resort-operator',
      });
    } catch (err) {
      console.error('[operator] audit log failed:', err.message);
    }
  }

  async function fetchOperationalState() {
    const today = new Date().toISOString().slice(0, 10);

    const [
      unitsRes,
      arrivalsRes,
      departuresRes,
      guestRequestsRes,
      housekeepingOrdersRes,
      tasksRes,
      casesRes,
    ] = await Promise.all([
      db.from('units').select('*').eq('active', true),
      db
        .from('resort_ops_bookings')
        .select('*, resort_ops_guests(name), resort_ops_units(name)')
        .eq('check_in', today),
      db
        .from('resort_ops_bookings')
        .select('id, guest_id, unit_id, check_out, room_rate, addons_total, paid_amount, resort_ops_guests(name), resort_ops_units(name)')
        .gte('check_out', today)
        .lte('check_out', today),
      db.from('guest_requests').select('*').not('status', 'in', '(completed,cancelled,escalated)'),
      db.from('housekeeping_orders').select('*').not('status', 'in', '(completed,cancelled)'),
      db.from('resort_ops_tasks').select('*').eq('status', 'pending'),
      db.from('ops_cases').select('*').not('status', 'in', '(resolved,closed)'),
    ]);

    const units = unitsRes.data || [];
    const arrivals = arrivalsRes.data || [];
    const departures = departuresRes.data || [];
    const guestRequests = guestRequestsRes.data || [];
    const housekeepingOrders = housekeepingOrdersRes.data || [];
    const tasks = tasksRes.data || [];
    const cases = casesRes.data || [];

    const overdueCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const overdueRequests = guestRequests.filter((r) => new Date(r.created_at) < new Date(overdueCutoff));

    return {
      today,
      units,
      arrivals,
      departures,
      guestRequests,
      overdueRequests,
      housekeepingOrders,
      tasks,
      cases,
    };
  }

  function buildBrief(state) {
    const { today, arrivals, departures, units, overdueRequests, housekeepingOrders, tasks, cases } = state;
    const dirtyUnits = units.filter((u) => u.status === 'dirty' || u.status === 'needs_cleaning');
    const occupiedUnits = units.filter((u) => u.status === 'occupied');

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

  function buildLLMMessages({ brief, question }) {
    const prompt = [
      'You are the KAPWA Resort Operator AI. Analyze the following daily resort snapshot and brief.',
      `Manager question: ${question || 'What needs my attention right now?'}`,
      brief.summary,
      `Key metrics: ${JSON.stringify(brief.metrics)}`,
      'Provide a short operational analysis, flag urgent risks, and recommend the top 2-3 priorities. Do not invent guests, bookings, or amounts; base everything on the provided snapshot.',
    ].join('\n\n');

    return [
      { role: 'system', content: 'You are a precise resort operations analyst. Be concise and actionable. Never invent data.' },
      { role: 'user', content: prompt },
    ];
  }

  function proposeActions(state) {
    const actions = [];
    const activeUnitNames = new Set(state.housekeepingOrders.map((h) => h.unit_name));
    state.units
      .filter((u) => (u.status === 'dirty' || u.status === 'needs_cleaning') && !activeUnitNames.has(u.unit_name))
      .forEach((unit) => {
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

    state.overdueRequests.forEach((req) => {
      actions.push({
        id: randomUUID(),
        action_type: 'ESCALATE_GUEST_REQUEST',
        title: `Escalate overdue guest request: ${req.request_type || 'general'}`,
        description: `Guest request from ${req.guest_name || 'guest'} is past the 2-hour SLA.`,
        target_id: req.id,
        payload: { request_id: req.id, guest_request_id: req.id },
        risk_level: 'high',
        status: 'proposed',
        created_at: new Date().toISOString(),
      });
    });

    const taskCaseIds = new Set(state.cases.filter((c) => c.domain === 'task').map((c) => c.source_id));
    state.tasks
      .filter((t) => t.due_date && new Date(t.due_date) < new Date() && !taskCaseIds.has(t.id))
      .slice(0, 10)
      .forEach((task) => {
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

  return {
    async getState() {
      return fetchOperationalState();
    },

    async runCycle(settings, options = {}) {
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
      if (!ALLOWED_ACTIONS.has(action.action_type)) {
        throw new Error(`Action type ${action.action_type} is not in the allow-list`);
      }

      const { data, error } = await db.functions.invoke('resort-operator-execute', {
        body: {
          action_type: action.action_type,
          payload: action.payload || {},
          decided_by: actor,
        },
      });
      if (error || data?.ok === false) {
        throw new Error(error?.message || data?.error || 'Action execution failed');
      }

      await logAudit('action_executed', action.id || randomUUID(), {
        action_type: action.action_type,
        payload: action.payload,
        actor,
        result: data,
      });

      return { ok: true, ...data };
    },
  };
}
