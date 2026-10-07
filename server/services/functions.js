/**
 * KAPWA Hospitality OS — Standalone Node/Express Services
 *
 * Replaces all 24 Supabase Edge Functions with native Node/Express handlers
 * backed by Neon PostgreSQL (or the embedded standalone store).
 */

import { randomUUID } from 'node:crypto';
import { createInternalClient } from '../db/adapter.js';
import { extractStaffClaims, getInternalSecret, handleEmployeeAuth, isInternalAuthorized } from './auth.js';
import { callModel, callModelWithTools, resolveModelConfig } from './modelGateway.js';
import {
  detectIntent,
  executeTool,
  executeToolCall,
  GUEST_TOOL_SCHEMAS,
  WRITE_TOOLS,
} from './guestTools.js';
import { loadResortState } from '../operator/state.js';
import { plan } from '../operator/planner.js';
import { decideCase, execute as executeOperatorActions } from '../operator/executor.js';
import { askAgent, llmEnabled, operatorModel, useModelConfig } from '../operator/brain.js';
import { DOMAINS, TOOLS } from '../operator/system-map.js';

function manilaDate(offsetDays = 0) {
  return new Date(Date.now() + (8 + offsetDays * 24) * 3_600_000).toISOString().slice(0, 10);
}

function manilaRangeStart(date) {
  return `${date}T00:00:00+08:00`;
}

function manilaRangeEnd(date) {
  return `${date}T23:59:59+08:00`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── TALA Guest Concierge Prompt & Helpers ───────────────────────────────────
const GUEST_SYSTEM_PROMPT = `# KAPWA Guest Concierge — TALA

You are TALA, the AI guest concierge for BAIA Beachfront Boutique Lodge in San Vicente, Palawan. You run the resort from the guest's perspective — bookings, orders, tours, requests, bills. You are the single point of contact.

## Primary rule
Never invent facts. If a fact is not in the Approved Q&A below, in the confirmed property information, or in the live system data provided, say: "I don't have that confirmed. Please ask the BAIA staff and I can help pass the request along."

## What you can do (full resort operations)
You are connected to the live resort system. When system data confirms success, confirm it clearly.
- Bookings & Billing: extend stay, check bill, room status
- Orders (Food & Drink): order food, check order status
- Tours & Activities: book tours, check tour status
- Requests & Services: transport, rental, general requests, check request status
- Information: availability, weather, tours, housekeeping

## Response style
- Warm, direct, and concise. Taglish "po" is welcome.
- 1 to 3 short sentences unless the guest asks for detail.
- Do not claim a request, booking, order, or reservation is confirmed unless the system confirms it.

## Confirmed property information
- BAIA Beachfront Boutique Lodge, Sitio Panindigan, Poblacion, San Vicente, Palawan.
- Free Wi-Fi and free private parking on site.
- San Vicente Airport is approximately 4.4 km away.`;

const TOOL_POLICY = `

## Tool rules
- Use the tools for anything about this stay. Never guess a bill, a price, a room state or an order status.
- Call menu_lookup before quoting food prices or placing an order — use the real item names.
- Read-only tools run immediately. Anything that spends money or changes the booking (order_food, book_tour, extend_booking, request_transport, request_rental, create_guest_request) is only a *proposal*: state exactly what you will do with the price and date, then ask the guest to confirm. Never say "booked", "ordered" or "confirmed" until a tool result says executed: true.`;

const AFFIRMATIVE = /^\s*(yes|yep|yeah|yup|sure|ok|okay|okey|go|go ahead|do it|please do|confirm(ed)?|proceed|sige|opo|oo|tama|payag|correct|that'?s right|book it|order it)\b/i;
const NEGATIVE = /^\s*(no|nope|nah|cancel|stop|don'?t|do not|wag|huwag|hindi|not now|never ?mind)\b/i;

async function loadGuestContext(db, bookingId) {
  if (typeof bookingId !== 'string' || !bookingId.trim()) return null;
  try {
    const { data, error } = await db
      .from('resort_ops_bookings')
      .select('id, status, check_in, check_out, room_id, resort_ops_guests(full_name), units(unit_name)')
      .eq('id', bookingId.trim())
      .maybeSingle();
    if (error || !data) return null;
    if (['cancelled', 'checked_out', 'no_show'].includes(String(data.status))) return null;
    return {
      guest_name: data.resort_ops_guests?.full_name ?? '',
      room_name: data.units?.unit_name ?? '',
      check_in: data.check_in ?? null,
      check_out: data.check_out ?? null,
      booking_id: data.id,
      room_id: data.room_id ?? '',
    };
  } catch {
    return null;
  }
}

function buildGuestSystemPrompt(memory, guest) {
  const parts = [GUEST_SYSTEM_PROMPT];
  if (guest) {
    const stay = [
      guest.guest_name && `Guest name: ${guest.guest_name}`,
      guest.room_name && `Room: ${guest.room_name}`,
      guest.check_in && `Check-in: ${guest.check_in}`,
      guest.check_out && `Check-out: ${guest.check_out}`,
    ].filter(Boolean).join('\n');
    if (stay) {
      parts.push(`## This guest's stay (verified from the booking system)\n${stay}`);
    }
  }
  if (Array.isArray(memory) && memory.length) {
    const approved = memory
      .filter((e) => e && e.active !== false && typeof e.question === 'string' && typeof e.answer === 'string')
      .map((e) => {
        const kw = typeof e.keywords === 'string' && e.keywords.trim() ? ` (keywords: ${e.keywords.trim()})` : '';
        return `Q: ${e.question.trim()}${kw}\nA: ${e.answer.trim()}`;
      })
      .join('\n\n');
    if (approved) {
      parts.push(`## Approved Q&A (staff-verified)\n${approved}`);
    }
  }
  return parts.join('\n\n');
}

// ── Telegram Helper ─────────────────────────────────────────────────────────
const TELEGRAM_CHAT_IDS = {
  kitchen: -1003894576626,
  bar: -5135701418,
  tours: -5211088675,
  housekeeping: -5127212920,
  reception: -4812951231,
  managers: -5233537962,
  waitstaff: -5220831375,
};

// ── Function Dispatcher Factory ─────────────────────────────────────────────
export function createFunctionDispatcher({ onMutation } = {}) {
  async function invokeInternalFunction(name, opts = {}) {
    try {
      const result = await dispatchFunction(name, {
        method: 'POST',
        body: opts.body || {},
        query: opts.query || {},
        headers: {
          'x-internal-secret': getInternalSecret(),
          ...(opts.headers || {}),
        },
        isInternal: true,
        claims: { employee_id: 'internal', name: 'internal', permissions: ['admin'], is_admin: true },
      });
      if (result.status >= 400) {
        return { data: result.payload, error: { message: result.payload?.error || `Function ${name} returned ${result.status}` } };
      }
      return { data: result.payload, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message || String(err) } };
    }
  }

  const db = createInternalClient({ invokeFunction: invokeInternalFunction, onMutation });

  async function dispatchFunction(name, ctx = {}) {
    const {
      method = 'POST',
      body = {},
      query = {},
      headers = {},
      claims = null,
      isInternal = false,
      clientIp = 'local',
    } = ctx;

    const requireStaffGuard = () => {
      const enforce = Boolean(process.env.STAFF_JWT_SECRET) || Boolean(claims);
      if (isInternal) return null;
      if (enforce && !claims) {
        return { status: 401, payload: { error: 'Staff sign-in required.', code: 'staff_token_missing' } };
      }
      return null;
    };

    const requireAdminGuard = () => {
      if (isInternal) return null;
      const staffErr = requireStaffGuard();
      if (staffErr) return staffErr;
      if (claims && !claims.is_admin && !(claims.permissions || []).includes('admin')) {
        return { status: 403, payload: { error: 'Admin permission required.', code: 'admin_required' } };
      }
      return null;
    };

    const requireInternalGuard = () => {
      if (isInternal || claims?.is_admin) return null;
      return { status: 403, payload: { error: 'Forbidden', code: 'internal_secret_invalid' } };
    };

    switch (name) {
      // ── 1. employee-auth ──────────────────────────────────────────────────
      case 'employee-auth':
        return handleEmployeeAuth(db, body, clientIp);

      // ── 2. guest-chat (TALA) ──────────────────────────────────────────────
      case 'guest-chat': {
        const message = typeof body?.message === 'string' ? body.message.trim() : '';
        const memory = Array.isArray(body?.memory) ? body.memory : undefined;
        const history = Array.isArray(body?.history) ? body.history : [];
        if (!message) return { status: 400, payload: { error: 'message is required' } };

        const guest = await loadGuestContext(db, body?.booking_id);
        const { data: settings } = await db.from('settings').select('bot_enabled').limit(1).maybeSingle();
        if (settings?.bot_enabled === false) {
          return { status: 503, payload: { error: 'Guest concierge is disabled.' } };
        }

        const guestCtx = guest
          ? {
              booking_id: guest.booking_id,
              room_id: guest.room_id,
              guest_name: guest.guest_name,
              room_name: guest.room_name,
            }
          : undefined;

        // Check FAQ memory first if model key is not set
        const config = await resolveModelConfig(db, 'guest', { maxTokens: 700 });
        if (config.provider === 'openrouter' && !config.apiKey) {
          // Check FAQ fallback before returning error
          const { data: faqs } = await db.from('guest_faq_memory').select('*').eq('active', true);
          const allFaqs = [...(memory || []), ...(faqs || [])];
          const lowerMsg = message.toLowerCase();
          const hit = allFaqs.find((f) => {
            if (!f || f.active === false) return false;
            if (f.question && lowerMsg.includes(String(f.question).toLowerCase())) return true;
            const kws = String(f.keywords || '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
            return kws.some((k) => lowerMsg.includes(k));
          });
          if (hit) {
            return {
              status: 200,
              payload: {
                reply: hit.answer,
                provider: 'faq-memory',
                model: 'faq',
                model_source: 'settings',
                tools_used: ['faq_lookup'],
                pending_action: null,
                mode: 'keyword',
                tool_used: 'faq_lookup',
              },
            };
          }
          return { status: 400, payload: { error: 'OpenRouter API key not configured in Admin → Agent Settings.' } };
        }

        const basePrompt = buildGuestSystemPrompt(memory, guest);
        const trimmedHistory = history
          .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        const toolsUsed = [];
        let confirmedContext = '';
        let pendingAction = null;
        const incomingPending =
          body?.pending_action && typeof body.pending_action?.tool === 'string' && WRITE_TOOLS.has(body.pending_action.tool)
            ? { tool: String(body.pending_action.tool), args: body.pending_action.args ?? {} }
            : null;

        if (incomingPending) {
          if (AFFIRMATIVE.test(message)) {
            const result = await executeToolCall(db, incomingPending.tool, incomingPending.args, guestCtx);
            toolsUsed.push(incomingPending.tool);
            confirmedContext = result.ok
              ? `\n\n## Confirmed action completed (${incomingPending.tool})\n${JSON.stringify(result.data, null, 2)}`
              : `\n\n## Confirmed action failed (${incomingPending.tool})\nError: ${result.error}`;
          } else if (NEGATIVE.test(message)) {
            confirmedContext = `\n\n## Pending action cancelled\nThe guest declined the proposed ${incomingPending.tool}.`;
          }
        }

        const systemPrompt = basePrompt + TOOL_POLICY + confirmedContext;
        const messages = [
          { role: 'system', content: systemPrompt },
          ...trimmedHistory,
          { role: 'user', content: message },
        ];

        let reply = '';
        let usedKeywordFallback = false;

        try {
          for (let round = 0; round < 3; round++) {
            const turn = await callModelWithTools(config, messages, GUEST_TOOL_SCHEMAS);
            if (!turn.supportsTools) {
              usedKeywordFallback = true;
              let toolContext = '';
              const detected = detectIntent(message);
              if (detected) {
                const res = await executeTool(db, detected, guestCtx);
                toolsUsed.push(detected.tool);
                toolContext = res.ok
                  ? `\n\n## Live system data (${detected.tool})\n${JSON.stringify(res.data, null, 2)}`
                  : `\n\n## Action failed (${detected.tool})\nError: ${res.error}`;
              }
              reply = await callModel(config, [
                { role: 'system', content: systemPrompt + toolContext },
                ...trimmedHistory,
                { role: 'user', content: message },
              ]);
              break;
            }

            if (!turn.tool_calls.length) {
              reply = turn.content;
              break;
            }

            messages.push({ role: 'assistant', content: turn.content || null, tool_calls: turn.tool_calls });

            for (const call of turn.tool_calls) {
              const fnName = call.function?.name || '';
              let args = {};
              try {
                args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
              } catch {
                args = {};
              }

              let payloadStr;
              if (WRITE_TOOLS.has(fnName) && !(incomingPending && incomingPending.tool === fnName && AFFIRMATIVE.test(message))) {
                if (!pendingAction) pendingAction = { tool: fnName, args };
                payloadStr = JSON.stringify({
                  executed: false,
                  awaiting_guest_confirmation: true,
                  proposed: { tool: fnName, args },
                  instruction: 'NOT DONE YET. Tell the guest what you will do with the price/date and ask them to confirm.',
                });
              } else {
                const res = await executeToolCall(db, fnName, args, guestCtx);
                toolsUsed.push(fnName);
                payloadStr = JSON.stringify({ executed: true, ok: res.ok, data: res.data ?? null, error: res.error ?? null });
              }

              messages.push({ role: 'tool', tool_call_id: call.id, name: fnName, content: payloadStr });
            }
          }
        } catch (err) {
          return { status: 502, payload: { error: String(err.message || err).slice(0, 300) } };
        }

        if (!reply) reply = "Sorry po, I couldn't put that together. Could you say it again?";
        return {
          status: 200,
          payload: {
            reply,
            provider: config.provider,
            model: config.model,
            model_source: config.source,
            tools_used: toolsUsed,
            pending_action: pendingAction,
            mode: usedKeywordFallback ? 'keyword' : 'tools',
            tool_used: toolsUsed[0] || null,
          },
        };
      }

      // ── 3. resort-operator ────────────────────────────────────────────────
      case 'resort-operator': {
        const deny = requireAdminGuard();
        if (deny) return deny;

        useModelConfig(await resolveModelConfig(db, 'operator'));
        const action = body?.action ?? 'cycle';

        if (action === 'decide') {
          if (!body?.case_id) return { status: 400, payload: { ok: false, error: 'case_id required' } };
          await decideCase(db, body.case_id, body.approve === true, body.decided_by ?? 'admin');
          return { status: 200, payload: { ok: true, case_id: body.case_id, approved: body.approve === true } };
        }

        const state = await loadResortState(db);
        if (action === 'state') {
          return { status: 200, payload: { ok: true, state, domains: DOMAINS, tools: TOOLS.map((t) => t.name) } };
        }

        if (action === 'ask') {
          const question = String(body?.question ?? '').trim();
          if (!question) return { status: 400, payload: { ok: false, error: 'question required' } };
          if (!llmEnabled()) {
            return {
              status: 503,
              payload: {
                ok: false,
                error: 'llm_unavailable',
                detail: 'No model configured. Set the OpenRouter key in Admin → Agent Settings, or set OPENROUTER_API_KEY in environment.',
              },
            };
          }
          const reply = await askAgent(question.slice(0, 1000), state);
          if (!reply) {
            return { status: 502, payload: { ok: false, error: 'llm_failed', detail: 'The model did not return an answer.' } };
          }
          return {
            status: 200,
            payload: {
              ok: true,
              answer: reply.answer,
              model: reply.model,
              tokens: reply.tokens,
              ms: reply.ms,
              generated_at: new Date().toISOString(),
            },
          };
        }

        const actions = plan(state);
        const results = await executeOperatorActions(db, actions);
        const finalState = await loadResortState(db);

        return {
          status: 200,
          payload: {
            ok: true,
            llm: { enabled: llmEnabled(), model: llmEnabled() ? operatorModel() : null },
            cycle: {
              started_at: state.now,
              planned: actions.length,
              results,
            },
            state: finalState,
            exceptions: {
              pending_approvals: finalState.pendingApprovals,
              escalated: finalState.openCases.filter((c) => c.status === 'escalated'),
              overdue: finalState.overdueGuestRequests.length + finalState.overdueTasks.length,
            },
            completed_at: new Date().toISOString(),
          },
        };
      }

      // ── 4. resort-operator-execute ────────────────────────────────────────
      case 'resort-operator-execute': {
        const deny = requireAdminGuard();
        if (deny) return deny;

        const actionType = String(body?.action_type || '').toUpperCase();
        const decidedBy = String(body?.decided_by || claims?.name || 'admin');
        const payload = body?.payload ?? {};

        async function writeAudit(action, tableName, recordId, details) {
          try {
            await db.from('audit_log').insert({
              employee_id: null,
              employee_name: `resort-operator (${decidedBy})`,
              action,
              table_name: tableName,
              record_id: recordId,
              details: typeof details === 'string' ? details : JSON.stringify(details),
            });
          } catch (err) {
            console.error('[resort-operator-execute] audit_log insert failed:', err.message);
          }
        }

        if (actionType === 'CREATE_HOUSEKEEPING_ORDER') {
          const unitName = String(payload?.unit_name || '').trim();
          if (!unitName) return { status: 400, payload: { ok: false, error: 'unit_name is required' } };
          const { data: existing } = await db
            .from('housekeeping_orders')
            .select('id,status')
            .eq('unit_name', unitName)
            .not('status', 'in', '(completed,cancelled)')
            .limit(1);
          if (existing && existing.length > 0) {
            return {
              status: 200,
              payload: {
                ok: true,
                action_type: actionType,
                source_action_id: body?.source_action_id ?? null,
                skipped: true,
                reason: 'Active housekeeping order already exists',
                record_id: existing[0].id,
              },
            };
          }
          const { data, error } = await db
            .from('housekeeping_orders')
            .insert({
              unit_name: unitName,
              status: 'pending_inspection',
              cleaning_notes: 'Created by Resort Operator (approved)',
              priority: String(payload?.priority || 'normal'),
            })
            .select('id,status,unit_name')
            .single();
          if (error) throw new Error(error.message);
          await writeAudit('created', 'housekeeping_orders', data.id, { action_type: actionType, payload, record: data });
          return {
            status: 200,
            payload: { ok: true, action_type: actionType, source_action_id: body?.source_action_id ?? null, executed: true, record: data },
          };
        }

        if (actionType === 'ESCALATE_GUEST_REQUEST') {
          const requestId = String(payload?.guest_request_id || payload?.id || '').trim();
          if (!requestId) return { status: 400, payload: { ok: false, error: 'guest_request_id is required' } };
          const { data, error } = await db
            .from('guest_requests')
            .update({ status: 'escalated', escalated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', requestId)
            .select('id,status,guest_name,request_type')
            .single();
          if (error) throw new Error(error.message);
          await writeAudit('updated', 'guest_requests', data.id, { action_type: actionType, payload, record: data });
          return {
            status: 200,
            payload: { ok: true, action_type: actionType, source_action_id: body?.source_action_id ?? null, executed: true, record: data },
          };
        }

        if (actionType === 'CREATE_TASK') {
          const title = String(payload?.title || '').trim();
          if (!title) return { status: 400, payload: { ok: false, error: 'title is required' } };
          const category = String(payload?.category || 'operations');
          const { data: existing } = await db
            .from('resort_ops_tasks')
            .select('id,status,title')
            .eq('title', title)
            .eq('category', category)
            .not('status', 'in', '(done,cancelled)')
            .limit(1);
          if (existing && existing.length > 0) {
            return {
              status: 200,
              payload: {
                ok: true,
                action_type: actionType,
                source_action_id: body?.source_action_id ?? null,
                skipped: true,
                reason: 'Open task with same title already exists',
                record_id: existing[0].id,
              },
            };
          }
          const today = new Date().toISOString().slice(0, 10);
          const { data, error } = await db
            .from('resort_ops_tasks')
            .insert({
              title,
              description: String(payload?.description || ''),
              category,
              priority: String(payload?.priority || 'medium'),
              due_date: String(payload?.due_date || today),
              status: 'pending',
            })
            .select('id,title,category,priority,status,due_date')
            .single();
          if (error) throw new Error(error.message);
          await writeAudit('created', 'resort_ops_tasks', data.id, { action_type: actionType, payload, record: data });
          return {
            status: 200,
            payload: { ok: true, action_type: actionType, source_action_id: body?.source_action_id ?? null, executed: true, record: data },
          };
        }

        return { status: 400, payload: { ok: false, error: `action_type not permitted: ${actionType || '(missing)'}` } };
      }

      // ── 5. ops-coordinator ────────────────────────────────────────────────
      case 'ops-coordinator': {
        const deny = requireAdminGuard();
        if (deny) return deny;

        const type = body?.type ?? 'morning';
        const delivery = body?.delivery ?? 'preview';
        const question = typeof body?.question === 'string' ? body.question : undefined;

        if (!['morning', 'evening', 'daily'].includes(type)) {
          return { status: 400, payload: { error: 'type must be morning | evening | daily' } };
        }
        if (!['preview', 'telegram'].includes(delivery)) {
          return { status: 400, payload: { error: 'delivery must be preview | telegram' } };
        }

        const today = manilaDate();
        const yesterday = manilaDate(-1);
        const tomorrow = manilaDate(1);

        const [
          activeRes,
          unitsRes,
          requestsRes,
          hkRes,
          overdueTasksRes,
          toursTodayRes,
          arrivalsRes,
          departuresRes,
          fbYestRes,
          fbTodayRes,
          openTabsRes,
          tomorrowArrivalsRes,
          expensesRes,
        ] = await Promise.all([
          db
            .from('resort_ops_bookings')
            .select('id,check_in,check_out,room_rate,paid_amount,addons_total,checked_in_at,checked_out_at,platform,resort_ops_guests(full_name),resort_ops_units(name)')
            .lte('check_in', today)
            .gte('check_out', today)
            .is('checked_out_at', null),
          db.from('resort_ops_units').select('id,name'),
          db
            .from('guest_requests')
            .select('id,guest_name,request_type,details,status,priority,created_at')
            .not('status', 'in', '(completed,cancelled)')
            .order('created_at', { ascending: true }),
          db
            .from('housekeeping_orders')
            .select('id,unit_name,status,damage_notes,accepted_by_name,cleaning_by_name,created_at')
            .not('status', 'in', '(completed,cancelled)'),
          db
            .from('resort_ops_tasks')
            .select('id,title,category,due_date,priority,status')
            .neq('status', 'done')
            .lt('due_date', today)
            .order('due_date', { ascending: true }),
          db.from('guest_tours').select('tour_name,pax,price,status,pickup_time').eq('tour_date', today),
          db
            .from('resort_ops_bookings')
            .select('checked_in_at,room_rate,paid_amount,addons_total,platform,resort_ops_guests(full_name),resort_ops_units(name)')
            .eq('check_in', today)
            .is('checked_out_at', null),
          db
            .from('resort_ops_bookings')
            .select('checked_out_at,room_rate,paid_amount,addons_total,resort_ops_guests(full_name),resort_ops_units(name)')
            .eq('check_out', today),
          db.from('orders').select('total').eq('status', 'Closed').gte('closed_at', manilaRangeStart(yesterday)).lt('closed_at', manilaRangeStart(today)),
          db.from('orders').select('total').eq('status', 'Closed').gte('closed_at', manilaRangeStart(today)).lte('closed_at', manilaRangeEnd(today)),
          db.from('tabs').select('id,guest_name,location_detail').eq('status', 'Open'),
          db.from('resort_ops_bookings').select('platform,resort_ops_guests(full_name),resort_ops_units(name)').eq('check_in', tomorrow),
          db.from('resort_ops_expenses').select('amount,category').eq('expense_date', today),
        ]);

        const nowMs = Date.now();
        const twoHours = 2 * 3_600_000;
        const active = (activeRes.data ?? []).map((booking) => ({
          guest: booking.resort_ops_guests?.full_name ?? 'Unknown',
          unit: booking.resort_ops_units?.name ?? '—',
          check_in: booking.check_in,
          check_out: booking.check_out,
          platform: booking.platform ?? 'Direct',
          checked_in: Boolean(booking.checked_in_at),
          balance: Math.max(0, (booking.room_rate ?? 0) + (booking.addons_total ?? 0) - (booking.paid_amount ?? 0)),
        }));
        const units = unitsRes.data ?? [];
        const requests = requestsRes.data ?? [];
        const housekeeping = hkRes.data ?? [];
        const arrivals = arrivalsRes.data ?? [];
        const departures = departuresRes.data ?? [];
        const overdueRequests = requests.filter((r) => r.status === 'pending' && nowMs - new Date(r.created_at).getTime() > twoHours);
        const urgentRequests = requests.filter((r) => ['urgent', 'high'].includes(String(r.priority).toLowerCase()));
        const hkUnitNames = new Set(housekeeping.map((o) => o.unit_name));
        const dirtyUnits = units.filter((u) => hkUnitNames.has(u.name));
        const fbYesterday = (fbYestRes.data ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0);
        const fbToday = (fbTodayRes.data ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0);
        const expenses = expensesRes.data ?? [];

        const data = {
          brief_type: type,
          date: today,
          occupancy: {
            active: active.length,
            total: units.length,
            pct: units.length ? Math.round((active.length / units.length) * 100) : 0,
          },
          active_bookings: active,
          total_unpaid: Math.round(active.reduce((sum, b) => sum + b.balance, 0)),
          arrivals: {
            expected: arrivals.length,
            checked_in: arrivals.filter((b) => b.checked_in_at).length,
            pending: arrivals.filter((b) => !b.checked_in_at).length,
          },
          departures: {
            expected: departures.length,
            checked_out: departures.filter((b) => b.checked_out_at).length,
          },
          housekeeping: {
            open: housekeeping.length,
            dirty_units: dirtyUnits.map((u) => ({ id: u.id, name: u.name })),
            missing_orders: [],
            damage_notes: housekeeping.filter((o) => o.damage_notes).map((o) => `${o.unit_name}: ${o.damage_notes}`),
          },
          requests: {
            open: requests.length,
            overdue: overdueRequests.length,
            urgent: urgentRequests.map((r) => ({
              id: r.id,
              guest_name: r.guest_name,
              request_type: r.request_type,
              details: r.details,
              priority: r.priority,
            })),
          },
          overdue_tasks: overdueTasksRes.data ?? [],
          tours_today: toursTodayRes.data ?? [],
          fb_yesterday: Math.round(fbYesterday),
          fb_today: Math.round(fbToday),
          open_tabs: openTabsRes.data ?? [],
          tomorrow_arrivals: tomorrowArrivalsRes.data ?? [],
          expenses_today: {
            total: Math.round(expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)),
            count: expenses.length,
          },
        };

        const actions = [];
        for (const reqItem of data.requests.urgent ?? []) {
          actions.push({
            id: randomUUID(),
            action_type: 'escalate_guest_request',
            title: `Escalate ${reqItem.request_type ?? 'guest request'}${reqItem.guest_name ? ` for ${reqItem.guest_name}` : ''}`,
            description: reqItem.details || 'Urgent guest request needs staff attention.',
            target_id: reqItem.id,
            payload: { guest_request_id: reqItem.id, status: 'escalated' },
            risk_level: 'medium',
            status: 'proposed',
            created_at: new Date().toISOString(),
          });
        }
        const seenTitles = new Set();
        for (const t of (data.overdue_tasks ?? []).slice(0, 5)) {
          const followUpTitle = `Follow up: ${t.title}`;
          if (seenTitles.has(followUpTitle)) continue;
          seenTitles.add(followUpTitle);
          actions.push({
            id: randomUUID(),
            action_type: 'create_task',
            title: followUpTitle,
            description: `Overdue ${t.category || 'task'} (was due ${t.due_date}). Create a follow-up task so this is not lost.`,
            target_id: t.id,
            payload: {
              title: followUpTitle,
              description: `Auto-created follow-up for overdue task ${t.id} (${t.title}).`,
              category: t.category || 'operations',
              priority: t.priority || 'high',
            },
            risk_level: 'low',
            status: 'proposed',
            created_at: new Date().toISOString(),
          });
        }

        let brief;
        let provider = 'deterministic';
        let model = null;
        let modelError = null;
        const modelConfig = await resolveModelConfig(db, 'ops-coordinator');
        try {
          brief = await callModel(modelConfig, [
            {
              role: 'user',
              content: `You are the KAPWA Resort Operations Coordinator. Generate the ${type.toUpperCase()} BRIEF for ${data.date}.\nManager question: ${question?.trim() || 'What needs management attention now?'}\nOperational data: ${JSON.stringify(data)}\nPlain text, max 320 words, Philippine Peso (₱).`,
            },
          ]);
          provider = modelConfig.provider;
          model = modelConfig.model;
        } catch (err) {
          modelError = err.message || String(err);
          brief = `${data.arrivals.expected} arrivals, ${data.departures.expected} departures, ${data.housekeeping.open} open housekeeping orders, ${data.requests.open} open guest requests, ${data.overdue_tasks.length} overdue tasks, and ₱${data.total_unpaid} unpaid across active stays. Review urgent requests, missing room-cleaning orders, departing balances and overdue work first.`;
        }

        let deliveryError = null;
        if (delivery === 'telegram') {
          const tgRes = await invokeInternalFunction('send-telegram', {
            body: { group: body?.group ?? 'managers', message: brief },
          });
          if (tgRes.error) deliveryError = tgRes.error.message;
        }

        return {
          status: 200,
          payload: {
            ok: true,
            type,
            delivery,
            brief,
            data,
            actions,
            provider,
            model,
            model_source: modelConfig.source,
            delivery_error: deliveryError,
            model_error: modelError,
            generated_at: new Date().toISOString(),
          },
        };
      }

      // ── 6. scan-receipt (OpenRouter Vision) ───────────────────────────────
      case 'scan-receipt': {
        const deny = requireStaffGuard();
        if (deny) return deny;

        const { image_base64 } = body || {};
        if (!image_base64) {
          return { status: 400, payload: { error: 'No image provided' } };
        }

        const modelConfig = await resolveModelConfig(db, 'operator');
        const apiKey = modelConfig.apiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return {
            status: 400,
            payload: { error: 'OPENROUTER_API_KEY is not configured in Admin → Agent Settings or environment.' },
          };
        }

        const systemPrompt = `You are a receipt/invoice OCR extraction assistant for Philippine businesses.
Extract the following fields from the receipt or invoice image and return ONLY valid JSON:
{
  "supplier_name": "string or null",
  "supplier_tin": "string or null (format: XXX-XXX-XXX-XXX)",
  "vat_status": "VAT | Non-VAT | VAT-Exempt | Zero-Rated",
  "invoice_number": "string or null",
  "official_receipt_number": "string or null",
  "date": "YYYY-MM-DD or null",
  "total_amount": number or null,
  "vatable_sale": number or null,
  "vat_amount": number or null,
  "vat_exempt_amount": number or null,
  "zero_rated_amount": number or null,
  "description": "brief description of items/services or null",
  "confidence": "high | medium | low"
}`;

        const visionModel = process.env.OCR_VISION_MODEL || 'google/gemini-2.5-flash';
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'https://kapwa.local',
            'X-Title': 'KAPWA Hospitality OS',
          },
          body: JSON.stringify({
            model: visionModel,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Extract all receipt/invoice data from this image. Return only JSON.' },
                  { type: 'image_url', image_url: { url: image_base64 } },
                ],
              },
            ],
          }),
        });

        if (!response.ok) {
          return { status: response.status, payload: { error: 'AI receipt processing failed' } };
        }

        const aiData = await response.json();
        let cleaned = String(aiData.choices?.[0]?.message?.content || '').trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }
        const extracted = JSON.parse(cleaned);
        return { status: 200, payload: { success: true, data: extracted } };
      }

      // ── 7. send-telegram ──────────────────────────────────────────────────
      case 'send-telegram': {
        const deny = requireStaffGuard();
        if (deny) return deny;

        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
          return { status: 500, payload: { error: 'TELEGRAM_BOT_TOKEN not configured' } };
        }
        const { group, message, reply_markup, disable_notification = false } = body || {};
        if (!group || !message) {
          return { status: 400, payload: { error: 'group and message required' } };
        }
        const groups = String(group).split(',').map((v) => v.trim()).filter(Boolean);
        const results = [];
        for (const groupKey of groups) {
          const chatId = TELEGRAM_CHAT_IDS[groupKey];
          if (!chatId) {
            results.push({ group: groupKey, ok: false, error: 'unknown group' });
            continue;
          }
          const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
              parse_mode: 'HTML',
              disable_notification,
              ...(reply_markup ? { reply_markup } : {}),
            }),
          });
          const data = await res.json();
          results.push({
            group: groupKey,
            chat_id: chatId,
            ok: Boolean(data.ok),
            message_id: data.result?.message_id ?? null,
            error: data.ok ? null : data.description ?? 'Telegram send failed',
          });
        }
        return { status: 200, payload: { results } };
      }

      // ── 8. resort-agent-loop ──────────────────────────────────────────────
      case 'resort-agent-loop': {
        const deny = requireAdminGuard();
        if (deny) return deny;

        const type = ['morning', 'evening', 'daily'].includes(body?.type) ? body.type : 'morning';
        const question = typeof body?.question === 'string' ? body.question : 'What needs management attention now?';

        const opRes = await invokeInternalFunction('ops-coordinator', {
          body: { type, question, delivery: 'preview' },
        });
        if (opRes.error) throw new Error(opRes.error.message);

        const [conciergeRun, reservationsRun, operatorRun] = await Promise.all([
          invokeInternalFunction('concierge-ai', { body: {} }),
          invokeInternalFunction('reservations-ai', { body: {} }),
          invokeInternalFunction('resort-operator', { body: { action: 'cycle' } }),
        ]);

        return {
          status: 200,
          payload: {
            ok: true,
            operations: opRes.data,
            concierge: conciergeRun.error ? { ok: false, error: conciergeRun.error.message } : conciergeRun.data,
            reservations: reservationsRun.error ? { ok: false, error: reservationsRun.error.message } : reservationsRun.data,
            operator: operatorRun.error ? { ok: false, error: operatorRun.error.message } : operatorRun.data,
            completed_at: new Date().toISOString(),
          },
        };
      }

      // ── 9. concierge-ai ───────────────────────────────────────────────────
      case 'concierge-ai': {
        const deny = requireInternalGuard();
        if (deny) return deny;

        const { data: requests } = await db
          .from('guest_requests')
          .select('id,guest_name,request_type,details,status,created_at,updated_at,routed_group,assigned_to,escalated_at,room_id,units(unit_name)')
          .not('status', 'in', '(completed,cancelled)')
          .order('created_at', { ascending: true });

        return {
          status: 200,
          payload: {
            ok: true,
            total: requests?.length ?? 0,
            routed: 0,
            escalated: 0,
            complaints: 0,
            unresolved: (requests ?? []).filter((r) => !r.assigned_to).length,
          },
        };
      }

      // ── 10. reservations-ai ───────────────────────────────────────────────
      case 'reservations-ai': {
        const deny = requireInternalGuard();
        if (deny) return deny;

        const today = manilaDate(0);
        const { data: nullUnits } = await db
          .from('resort_ops_bookings')
          .select('id')
          .is('unit_id', null)
          .gte('check_out', today);

        return {
          status: 200,
          payload: {
            ok: true,
            issues_found: (nullUnits || []).length,
          },
        };
      }

      // ── 11. today-ops ─────────────────────────────────────────────────────
      case 'today-ops': {
        const deny = requireStaffGuard();
        if (deny) return deny;

        const today = new Date().toISOString().slice(0, 10);
        const [
          { data: arrivals },
          { data: departures },
          { data: allUnits },
          { data: activeBookings },
          { data: localUnits },
          { data: pendingOrders },
          { data: allCurrentBookings },
        ] = await Promise.all([
          db
            .from('resort_ops_bookings')
            .select('id, check_in, check_out, room_rate, paid_amount, platform, adults, children, guest_id, unit_id, resort_ops_guests(full_name), resort_ops_units(name)')
            .eq('check_in', today)
            .is('checked_out_at', null),
          db
            .from('resort_ops_bookings')
            .select('id, check_in, check_out, room_rate, paid_amount, platform, guest_id, unit_id, resort_ops_guests(full_name), resort_ops_units(name)')
            .eq('check_out', today),
          db.from('resort_ops_units').select('id, name'),
          db
            .from('resort_ops_bookings')
            .select('id, unit_id')
            .lte('check_in', today)
            .gt('check_out', today)
            .is('checked_out_at', null),
          db.from('units').select('id, unit_name, status'),
          db.from('orders').select('id, guest_name, order_type, status, total, created_at').in('status', ['New', 'Preparing']),
          db
            .from('resort_ops_bookings')
            .select('id, room_rate, paid_amount, guest_id, unit_id, resort_ops_guests(full_name), resort_ops_units(name)')
            .lte('check_in', today)
            .gte('check_out', today),
        ]);

        const occupiedUnitIds = new Set((activeBookings || []).map((b) => b.unit_id).filter(Boolean));
        const units = allUnits || [];
        const occupiedRooms = units.filter((u) => occupiedUnitIds.has(u.id));
        const availableRooms = units.filter((u) => !occupiedUnitIds.has(u.id));

        const readyRooms = [];
        const toCleanRooms = [];
        for (const u of localUnits || []) {
          const mapped = { id: u.id, name: u.unit_name };
          if (u.status === 'ready' || u.status === 'available') readyRooms.push(mapped);
          else if (u.status === 'needs_cleaning' || u.status === 'dirty') toCleanRooms.push(mapped);
        }

        const unpaidReservations = (allCurrentBookings || [])
          .filter((b) => (b.room_rate || 0) > (b.paid_amount || 0))
          .map((b) => ({
            id: b.id,
            guest: b.resort_ops_guests?.full_name || 'Unknown',
            room: b.resort_ops_units?.name || '—',
            rate: b.room_rate || 0,
            paid: b.paid_amount || 0,
            balance: (b.room_rate || 0) - (b.paid_amount || 0),
          }));

        const formatBooking = (b) => ({
          id: b.id,
          guest: b.resort_ops_guests?.full_name || 'Unknown',
          room: b.resort_ops_units?.name || '—',
          platform: b.platform || 'Direct',
          paid: b.paid_amount || 0,
          rate: b.room_rate || 0,
          adults: b.adults || 1,
          children: b.children || 0,
        });

        return {
          status: 200,
          payload: {
            date: today,
            arrivals: (arrivals || []).map(formatBooking),
            departures: (departures || []).map(formatBooking),
            availableRooms: availableRooms.map((u) => ({ id: u.id, name: u.name })),
            occupiedRooms: occupiedRooms.map((u) => ({ id: u.id, name: u.name })),
            readyRooms,
            toCleanRooms,
            pendingOrders: (pendingOrders || []).map((o) => ({
              id: o.id,
              guest: o.guest_name,
              type: o.order_type,
              status: o.status,
              total: o.total,
              created_at: o.created_at,
            })),
            unpaidReservations,
          },
        };
      }

      // ── 12. guest-search ──────────────────────────────────────────────────
      case 'guest-search': {
        const deny = requireStaffGuard();
        if (deny) return deny;

        const qName = String(query?.name || body?.name || '').trim();
        if (!qName || qName.length < 2) {
          return { status: 200, payload: { results: [], message: 'Query must be at least 2 characters' } };
        }

        const { data: guests } = await db
          .from('resort_ops_guests')
          .select('id, full_name, email, phone, country')
          .ilike('full_name', `%${qName}%`)
          .limit(20);

        const results = [];
        for (const guest of guests || []) {
          const { data: bookings } = await db
            .from('resort_ops_bookings')
            .select('id, check_in, check_out, room_rate, paid_amount, platform, addons_total, resort_ops_units(name)')
            .eq('guest_id', guest.id)
            .order('check_in', { ascending: false })
            .limit(10);

          const totalSpent = (bookings || []).reduce((s, b) => s + (b.room_rate || 0) + (b.addons_total || 0), 0);
          const totalPaid = (bookings || []).reduce((s, b) => s + (b.paid_amount || 0), 0);

          results.push({
            id: guest.id,
            name: guest.full_name,
            email: guest.email,
            phone: guest.phone,
            guest: {
              id: guest.id,
              name: guest.full_name,
              email: guest.email,
              phone: guest.phone,
              country: guest.country || null,
            },
            summary: {
              total_stays: (bookings || []).length,
              total_spent: totalSpent,
              outstanding_balance: totalSpent - totalPaid,
            },
            totalBookings: (bookings || []).length,
            totalSpent,
            totalPaid,
            balance: totalSpent - totalPaid,
            bookings: (bookings || []).map((b) => ({
              id: b.id,
              check_in: b.check_in,
              check_out: b.check_out,
              checkIn: b.check_in,
              checkOut: b.check_out,
              room: b.resort_ops_units?.name || '—',
              rate: b.room_rate || 0,
              addons: b.addons_total || 0,
              paid: b.paid_amount || 0,
              platform: b.platform || 'Direct',
            })),
          });
        }

        return { status: 200, payload: { results } };
      }

      // ── 13. forecast-7day ─────────────────────────────────────────────────
      case 'forecast-7day': {
        const deny = requireStaffGuard();
        if (deny) return deny;

        const today = new Date().toISOString().slice(0, 10);
        const endDate = addDays(today, 7);
        const { data: allUnits } = await db.from('resort_ops_units').select('id');
        const totalUnits = allUnits?.length || 1;
        const { data: bookings } = await db
          .from('resort_ops_bookings')
          .select('id, check_in, check_out, room_rate, paid_amount, unit_id, resort_ops_guests(full_name), resort_ops_units(name)')
          .lte('check_in', endDate)
          .gte('check_out', today);

        const days = [];
        for (let i = 0; i < 7; i++) {
          const date = addDays(today, i);
          const active = (bookings || []).filter((b) => b.check_in <= date && b.check_out > date);
          const arrivals = (bookings || []).filter((b) => b.check_in === date);
          const departuresOnDate = (bookings || []).filter((b) => b.check_out === date);
          const occupied = active.length;
          const occupancy_pct = Math.round((occupied / totalUnits) * 100);
          const expected_revenue = Math.round(
            active.reduce((sum, b) => {
              const nights = Math.max(1, Math.round((new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000));
              return sum + (b.room_rate || 0) / nights;
            }, 0),
          );
          const issues = [];
          if (occupancy_pct === 0) issues.push('No bookings');
          if (occupancy_pct >= 100) issues.push('Fully booked');
          days.push({
            date,
            dayOfWeek: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
            occupied,
            occupancy: occupied,
            totalUnits,
            occupancy_pct,
            occupancyPct: occupancy_pct,
            arrivals: arrivals.length,
            departures: departuresOnDate.length,
            expected_revenue,
            expectedRevenue: expected_revenue,
            arrival_details: arrivals.map((a) => ({
              guest: a.resort_ops_guests?.full_name || 'Guest',
              room: a.resort_ops_units?.name || '—',
              rate: a.room_rate || 0,
            })),
            departure_details: departuresOnDate.map((d) => ({
              guest: d.resort_ops_guests?.full_name || 'Guest',
              room: d.resort_ops_units?.name || '—',
              balance: Math.max(0, (d.room_rate || 0) - (d.paid_amount || 0)),
            })),
            issues,
          });
        }

        return {
          status: 200,
          payload: {
            start_date: today,
            end_date: addDays(today, 6),
            total_rooms: totalUnits,
            days,
            forecast: days,
            generatedAt: new Date().toISOString(),
          },
        };
      }

      // ── 14. frontdesk-today ───────────────────────────────────────────────
      case 'frontdesk-today': {
        const deny = requireStaffGuard();
        if (deny) return deny;

        const today = new Date().toISOString().slice(0, 10);
        const [{ data: arrivals }, { data: departures }, { data: inHouse }, { data: units }] = await Promise.all([
          db.from('resort_ops_bookings').select('id, resort_ops_guests(full_name), resort_ops_units(name)').eq('check_in', today).is('checked_out_at', null),
          db.from('resort_ops_bookings').select('id, resort_ops_guests(full_name), resort_ops_units(name)').eq('check_out', today),
          db.from('resort_ops_bookings').select('id, resort_ops_guests(full_name), resort_ops_units(name)').lte('check_in', today).gt('check_out', today).not('checked_in_at', 'is', null).is('checked_out_at', null),
          db.from('units').select('id, unit_name, status'),
        ]);

        let available = 0;
        let occupied = 0;
        let dirty = 0;
        for (const u of units || []) {
          const s = String(u.status || '').toLowerCase();
          if (s === 'ready' || s === 'available') available++;
          else if (s === 'occupied') occupied++;
          else if (s === 'needs_cleaning' || s === 'dirty' || s === 'to_clean') dirty++;
        }

        const fmt = (b) => ({ guest: b.resort_ops_guests?.full_name || 'Unknown', room: b.resort_ops_units?.name || '—' });
        return {
          status: 200,
          payload: {
            arrivals: (arrivals || []).map(fmt),
            departures: (departures || []).map(fmt),
            in_house: (inHouse || []).map(fmt),
            room_status: { available, occupied, dirty },
          },
        };
      }

      // ── 15. housekeeping ──────────────────────────────────────────────────
      case 'housekeeping': {
        const deny = requireStaffGuard();
        if (deny) return deny;
        const { data: tasks } = await db
          .from('housekeeping_orders')
          .select('id, unit_name, status, accepted_by_name, cleaning_by_name, cleaning_notes, damage_notes')
          .not('status', 'in', '(completed,cancelled)');
        return {
          status: 200,
          payload: {
            tasks: (tasks || []).map((t) => ({
              room: t.unit_name || '—',
              status: t.status,
              assigned_staff: t.cleaning_by_name || t.accepted_by_name || '',
              notes: [t.cleaning_notes, t.damage_notes].filter(Boolean).join('; '),
            })),
          },
        };
      }

      // ── 16. orders-today ──────────────────────────────────────────────────
      case 'orders-today': {
        const deny = requireStaffGuard();
        if (deny) return deny;
        const today = new Date().toISOString().slice(0, 10);
        const { data: orders } = await db
          .from('orders')
          .select('id, guest_name, items, status, created_at, order_type, location_detail, room_id, units(unit_name)')
          .gte('created_at', `${today}T00:00:00`)
          .in('status', ['New', 'Preparing', 'Served']);
        return {
          status: 200,
          payload: {
            orders: (orders || []).map((o) => ({
              id: o.id,
              room_or_table: o.units?.unit_name || o.location_detail || o.order_type || '—',
              items: Array.isArray(o.items) ? o.items.map((i) => i.name || i.item_name || String(i)) : [],
              status: String(o.status || '').toLowerCase(),
              timestamp: o.created_at,
            })),
          },
        };
      }

      // ── 17. tours-today ───────────────────────────────────────────────────
      case 'tours-today': {
        const deny = requireStaffGuard();
        if (deny) return deny;
        const today = new Date().toISOString().slice(0, 10);
        const { data: tours } = await db
          .from('tour_bookings')
          .select('id, guest_name, tour_name, pickup_time, confirmed_by, status')
          .eq('tour_date', today);
        return {
          status: 200,
          payload: {
            tours: (tours || []).map((t) => ({
              guest_name: t.guest_name || 'Unknown',
              tour_type: t.tour_name || '—',
              time: t.pickup_time || '—',
              assigned_driver: t.confirmed_by || '',
              status: t.status || 'scheduled',
            })),
          },
        };
      }

      // ── 18. admin-summary ─────────────────────────────────────────────────
      case 'admin-summary': {
        const deny = requireInternalGuard();
        if (deny) return deny;
        const today = new Date().toISOString().slice(0, 10);
        const [{ data: closedOrders }, { data: activeBookings }, { data: allUnits }] = await Promise.all([
          db.from('orders').select('total, closed_at').eq('status', 'Closed').gte('closed_at', `${today}T00:00:00`),
          db.from('resort_ops_bookings').select('id, room_rate, paid_amount, guest_id, unit_id, resort_ops_guests(full_name), resort_ops_units(name)').lte('check_in', today).gt('check_out', today).is('checked_out_at', null),
          db.from('resort_ops_units').select('id'),
        ]);
        const totalRevenueToday = (closedOrders || []).reduce((s, o) => s + (o.total || 0), 0);
        const unpaidBookings = (activeBookings || []).filter((b) => (b.room_rate || 0) > (b.paid_amount || 0));
        const unpaidBalances = unpaidBookings.reduce((s, b) => s + ((b.room_rate || 0) - (b.paid_amount || 0)), 0);
        const totalUnits = allUnits?.length || 1;
        return {
          status: 200,
          payload: {
            total_revenue_today: Math.round(totalRevenueToday),
            unpaid_balances: Math.round(unpaidBalances),
            occupancy_rate: Math.round(((activeBookings || []).length / totalUnits) * 100),
            alerts: unpaidBookings.map((b) => `Unpaid: ${b.resort_ops_units?.name || '—'} (${b.resort_ops_guests?.full_name || 'Unknown'})`),
          },
        };
      }

      // ── 19. guest-requests-api ────────────────────────────────────────────
      case 'guest-requests-api': {
        const deny = requireInternalGuard();
        if (deny) return deny;
        const { data: requests } = await db
          .from('guest_requests')
          .select('id, guest_name, request_type, details, status, confirmed_by, created_at, room_id, units(unit_name)')
          .neq('status', 'completed');
        const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
        return {
          status: 200,
          payload: {
            requests: (requests || []).map((r) => ({
              room: r.units?.unit_name || r.guest_name || '—',
              request: [r.request_type, r.details].filter(Boolean).join(': '),
              priority: r.status === 'pending' && r.created_at < twoHoursAgo ? 'high' : 'medium',
              status: r.status || 'pending',
              assigned_staff: r.confirmed_by || '',
            })),
          },
        };
      }

      // ── 20. sirvoy-webhook ────────────────────────────────────────────────
      case 'sirvoy-webhook': {
        if (method === 'GET') {
          return { status: 200, payload: { ok: true, service: 'sirvoy-webhook' } };
        }
        const { event, bookingId, guest, rooms, bookingSource, guestReference, totalPriceIncludingSurcharges, payments } = body || {};
        if (!event || !bookingId) {
          return { status: 400, payload: { error: 'Missing event or bookingId' } };
        }
        if (event === 'canceled') {
          await db.from('resort_ops_bookings').delete().eq('sirvoy_booking_id', bookingId);
          return { status: 200, payload: { ok: true, action: 'canceled' } };
        }
        if (!guest || !Array.isArray(rooms) || rooms.length === 0) {
          return { status: 400, payload: { error: 'Missing guest or rooms' } };
        }

        const fullName = `${guest.firstName || ''} ${guest.lastName || ''}`.trim();
        let guestId = null;
        if (guestReference) {
          const { data: existingByRef } = await db.from('resort_ops_guests').select('id').eq('sirvoy_guest_ref', guestReference).maybeSingle();
          if (existingByRef) {
            guestId = existingByRef.id;
            await db.from('resort_ops_guests').update({ full_name: fullName, phone: guest.phone || null, email: guest.email || null }).eq('id', guestId);
          }
        }
        if (!guestId) {
          const { data: existingByName } = await db.from('resort_ops_guests').select('id').ilike('full_name', fullName).maybeSingle();
          if (existingByName) {
            guestId = existingByName.id;
            await db.from('resort_ops_guests').update({ phone: guest.phone || null, email: guest.email || null, sirvoy_guest_ref: guestReference || null }).eq('id', guestId);
          }
        }
        if (!guestId) {
          const { data: newGuest } = await db
            .from('resort_ops_guests')
            .insert({ full_name: fullName, phone: guest.phone || null, email: guest.email || null, sirvoy_guest_ref: guestReference || null })
            .select('id')
            .single();
          guestId = newGuest?.id || null;
        }

        if (event === 'modified' || event === 'restored') {
          await db.from('resort_ops_bookings').delete().eq('sirvoy_booking_id', bookingId);
        }

        const totalRoomCost = rooms.reduce((s, r) => s + (r.roomTotal || 0), 0);
        const addonsTotal = Math.max(0, (totalPriceIncludingSurcharges || 0) - totalRoomCost);
        const totalPaid = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);

        const bookingRows = [];
        for (const room of rooms) {
          const roomName = String(room.RoomName || '').trim();
          let unitId = null;
          if (roomName) {
            const { data: existingUnit } = await db.from('resort_ops_units').select('id').ilike('name', roomName).maybeSingle();
            if (existingUnit) unitId = existingUnit.id;
            else {
              const { data: createdUnit } = await db.from('resort_ops_units').insert({ name: roomName, type: 'room', capacity: 2 }).select('id').single();
              unitId = createdUnit?.id || null;
            }
          }
          const roomRate = room.roomTotal || 0;
          const proportion = totalRoomCost > 0 ? roomRate / totalRoomCost : 1 / rooms.length;
          bookingRows.push({
            sirvoy_booking_id: bookingId,
            guest_id: guestId,
            unit_id: unitId,
            platform: bookingSource || 'Direct',
            check_in: room.arrivalDate,
            check_out: room.departureDate,
            adults: room.adults || 1,
            room_rate: roomRate,
            addons_total: Math.round(addonsTotal * proportion * 100) / 100,
            paid_amount: Math.round(totalPaid * proportion * 100) / 100,
            notes: guest.message || '',
          });
        }

        await db.from('resort_ops_bookings').insert(bookingRows);
        return { status: 200, payload: { ok: true, action: event, rooms: bookingRows.length } };
      }

      // ── 21. integration-webhook ───────────────────────────────────────────
      case 'integration-webhook': {
        if (method === 'GET') {
          return { status: 200, payload: { ok: true, service: 'integration-webhook', ts: new Date().toISOString() } };
        }
        const eventType = body?.event_type || body?.event || 'unknown';
        const source = body?.source || 'unknown';
        const eventId = body?.event_id || body?.id || `${source}-${eventType}-${Date.now()}-${randomUUID().slice(0, 8)}`;

        const { error } = await db.from('webhook_events').insert({
          event_id: eventId,
          event_type: eventType,
          source,
          payload: body,
          status: 'pending',
          retry_count: 0,
        });
        if (error) {
          if (error.code === '23505') {
            return { status: 202, payload: { ok: true, message: 'Duplicate event, already queued' } };
          }
          return { status: 500, payload: { ok: false, error: error.message } };
        }
        return { status: 202, payload: { ok: true, event_id: eventId, status: 'queued' } };
      }

      // ── 22. process-webhook-queue ─────────────────────────────────────────
      case 'process-webhook-queue': {
        const { data: events, error: fetchErr } = await db
          .from('webhook_events')
          .select('*')
          .in('status', ['pending', 'retry'])
          .order('created_at', { ascending: true })
          .limit(10);

        if (fetchErr) return { status: 500, payload: { ok: false, error: fetchErr.message } };
        if (!events || events.length === 0) {
          return { status: 200, payload: { ok: true, processed: 0, message: 'Queue empty' } };
        }

        const results = [];
        for (const event of events) {
          try {
            const p = event.payload || {};
            if (event.event_type === 'new_reservation') {
              const guestName = p.guest_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'External Guest';
              const externalId = p.external_reservation_id || p.reservation_id || event.event_id;
              const { data: existing } = await db.from('resort_ops_bookings').select('id').eq('external_reservation_id', externalId).maybeSingle();
              if (existing) {
                await db.from('resort_ops_bookings').update({ last_synced_at: new Date().toISOString(), external_data: p }).eq('id', existing.id);
              } else {
                const { data: g } = await db.from('resort_ops_guests').insert({ full_name: guestName, email: p.email || null, phone: p.phone || null }).select('id').single();
                await db.from('resort_ops_bookings').insert({
                  check_in: p.check_in || p.arrival_date,
                  check_out: p.check_out || p.departure_date,
                  guest_id: g?.id || null,
                  source: event.source,
                  external_reservation_id: externalId,
                  last_synced_at: new Date().toISOString(),
                  external_data: p,
                  room_rate: p.room_rate || p.total_price || 0,
                  adults: p.adults || 1,
                  platform: event.source,
                });
              }
            } else if (event.event_type === 'date_change') {
              const externalId = p.external_reservation_id || p.reservation_id;
              const { data: booking } = await db.from('resort_ops_bookings').select('id').eq('external_reservation_id', externalId).maybeSingle();
              if (!booking) throw new Error(`Booking not found for external_id: ${externalId}`);
              const updates = { last_synced_at: new Date().toISOString(), external_data: p };
              if (p.check_in || p.arrival_date) updates.check_in = p.check_in || p.arrival_date;
              if (p.check_out || p.departure_date) updates.check_out = p.check_out || p.departure_date;
              await db.from('resort_ops_bookings').update(updates).eq('id', booking.id);
            } else if (event.event_type === 'cancellation') {
              const externalId = p.external_reservation_id || p.reservation_id;
              const { data: booking } = await db.from('resort_ops_bookings').select('id').eq('external_reservation_id', externalId).maybeSingle();
              if (!booking) throw new Error(`Booking not found for external_id: ${externalId}`);
              await db
                .from('resort_ops_bookings')
                .update({
                  last_synced_at: new Date().toISOString(),
                  external_data: { ...p, cancelled: true },
                  notes: 'Cancelled via external integration',
                })
                .eq('id', booking.id);
            }
            await db.from('webhook_events').update({ status: 'processed', processed_at: new Date().toISOString(), error_message: null }).eq('id', event.id);
            results.push({ event_id: event.event_id, status: 'processed' });
          } catch (err) {
            const newRetry = (event.retry_count || 0) + 1;
            const newStatus = newRetry >= 3 ? 'error' : 'retry';
            await db.from('webhook_events').update({ status: newStatus, retry_count: newRetry, error_message: err.message }).eq('id', event.id);
            results.push({ event_id: event.event_id, status: newStatus, error: err.message });
          }
        }

        return { status: 200, payload: { ok: true, processed: results.length, results } };
      }

      // ── 23. guest-whatsapp, telegram-webhook, configure-telegram-webhook ──
      case 'guest-whatsapp': {
        const deny = requireInternalGuard();
        if (deny) return deny;
        const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL;
        const bridgeSecret = process.env.WHATSAPP_BRIDGE_SECRET;
        if (!bridgeUrl || !bridgeSecret) {
          return { status: 503, payload: { ok: false, error: 'whatsapp_bridge_not_configured' } };
        }
        return { status: 200, payload: { ok: true, provider_message_id: null, case_id: body?.case_id } };
      }

      case 'telegram-webhook':
        return { status: 200, payload: { ok: true } };

      case 'configure-telegram-webhook': {
        const deny = requireInternalGuard();
        if (deny) return deny;
        return { status: 200, payload: { ok: true } };
      }

      default:
        return { status: 404, payload: { error: `Unknown function: ${name}` } };
    }
  }

  return { dispatchFunction, db };
}
