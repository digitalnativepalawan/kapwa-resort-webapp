// brain.ts — LLM judgment layer for the resort-operator agent.
//
// Two capabilities:
//   triageCase(action)      refine priority + one-line manager explanation per case
//   askAgent(question, st)  answer an admin question from live resort state
//
// Design rules (RESORT_OPERATOR_RUNTIME.md):
// 1. The deterministic planner is the floor. The LLM refines and explains; it
//    never invents actions, never crosses the approval boundary, never blocks
//    the loop. Any failure returns null / throws cleanly and the cycle continues.
// 2. Strict JSON in, validated out. Hard timeouts. Facts only from supplied state.
//
// Configuration:
//   Model + key come from ../_shared/modelGateway.ts, which reads Admin → Agent
//   Settings first and only then falls back to the OPENROUTER_API_KEY /
//   OPERATOR_MODEL secrets. index.ts calls useModelConfig() once per request.
//   AGENT_LLM_ENABLED    "false" = kill switch without removing the key
//   APP_URL              referer for OpenRouter
//
// This module keeps its own fetch rather than using the gateway's callModel
// because the triage/ask paths need hard abort timeouts — the deterministic
// planner must never be blocked waiting on a model.

import type { PlannedAction } from "./planner.ts";
import type { ResortState } from "./state.ts";
import type { ModelConfig } from "../_shared/modelGateway.ts";

/** Config resolved for the current request. Set by index.ts before planning. */
let activeConfig: ModelConfig | null = null;

export function useModelConfig(config: ModelConfig | null): void {
  activeConfig = config;
}

function apiKey(): string | null {
  return activeConfig?.apiKey ?? Deno.env.get("OPENROUTER_API_KEY") ?? null;
}

export interface TriageResult {
  priority: "low" | "medium" | "high" | "urgent";
  explanation: string;
  model: string;
  tokens: number;
  ms: number;
}

export interface AskResult {
  answer: string;
  model: string;
  tokens: number;
  ms: number;
}

const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const TRIAGE_TIMEOUT_MS = 3500;
const ASK_TIMEOUT_MS = 20000;

export function llmEnabled(): boolean {
  if ((Deno.env.get("AGENT_LLM_ENABLED") ?? "").toLowerCase() === "false") return false;
  return Boolean(apiKey());
}

async function callOpenRouter(prompt: string, maxTokens: number, timeoutMs: number): Promise<{ text: string; tokens: number } | null> {
  const key = apiKey();
  if (!key) return null;
  const model = operatorModel();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": Deno.env.get("APP_URL") ?? "https://kapwa.local",
        "X-Title": "KAPWA Resort Operator",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return null;
    return {
      text,
      tokens: (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0),
    };
  } catch (_err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function operatorModel(): string {
  return activeConfig?.model
    ?? Deno.env.get("OPERATOR_MODEL")
    ?? "anthropic/claude-haiku-4-5";
}

// ── Triage: called by the executor when a case opens ─────────────────────────

export async function triageCase(a: PlannedAction): Promise<TriageResult | null> {
  if (!llmEnabled() || !a.case) return null;
  const started = Date.now();
  const c = a.case;

  const prompt = [
    "You are the operations brain of a small beach resort in Palawan, Philippines.",
    "One operational case was just detected. Assess it.",
    "",
    `Domain: ${c.domain}`,
    `Issue type: ${c.issue_type}`,
    `Department: ${c.department || "unassigned"}`,
    `Guest: ${c.guest_name || "n/a"}`,
    `Risk (rule-based): ${c.risk || "n/a"}`,
    `Required action: ${c.required_action || "n/a"}`,
    `Due: ${c.due_at || "no deadline"}`,
    `Planner priority: ${a.priority}`,
    "",
    "Rules:",
    "- priority must be one of: low, medium, high, urgent.",
    "- Only raise or lower priority from the planner value if the details clearly justify it; otherwise keep it.",
    "- explanation: ONE sentence a resort manager reads to understand why this matters and what to do. No fluff.",
    "- Use only the facts above. Never invent guests, amounts, or statuses.",
    "",
    'Respond with ONLY this JSON, no markdown fences: {"priority":"...","explanation":"..."}',
  ].join("\n");

  const res = await callOpenRouter(prompt, 200, TRIAGE_TIMEOUT_MS);
  if (!res) return null;

  try {
    const clean = res.text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(clean);
    const priority = String(parsed.priority ?? "").toLowerCase();
    const explanation = String(parsed.explanation ?? "").trim().slice(0, 300);
    if (!VALID_PRIORITIES.has(priority) || !explanation) return null;
    return {
      priority: priority as TriageResult["priority"],
      explanation,
      model: operatorModel(),
      tokens: res.tokens,
      ms: Date.now() - started,
    };
  } catch (_err) {
    return null;
  }
}

// ── Ask: the admin chat, answering from live state ──────────────────────────

function digestState(state: ResortState): string {
  const take = <T>(arr: T[], n = 8) => (arr ?? []).slice(0, n);
  const d = {
    now: state.now,
    today: state.today,
    counts: {
      arrivals_today: state.arrivals.length,
      departures_48h: state.departures.length,
      unpaid_departures: state.unpaidDepartures.length,
      open_guest_requests: state.openGuestRequests.length,
      overdue_guest_requests: state.overdueGuestRequests.length,
      pending_housekeeping: state.pendingHousekeeping.length,
      unready_arrivals: state.unreadyArrivals.length,
      maintenance_open: state.maintenanceTasks.length,
      maintenance_overdue: state.overdueMaintenanceTasks.length,
      reservation_exceptions: state.reservationExceptionTasks.length,
      unconfirmed_tours: state.unconfirmedTours.length,
      stuck_orders: state.stuckOrders.length,
      open_tabs: state.openTabs.length,
      webhook_failures: state.webhookFailures.length,
      open_cases: state.openCases.length,
      pending_approvals: state.pendingApprovals.length,
    },
    unpaid_departures: take(state.unpaidDepartures).map((b) => ({
      guest: b.guest_name, check_out: b.check_out, balance: b.balance,
    })),
    arrivals_today: take(state.arrivals).map((a: any) => ({
      guest: a.resort_ops_guests?.name ?? "", unit: a.resort_ops_units?.name ?? "", checked_in: Boolean(a.checked_in_at),
    })),
    overdue_guest_requests: take(state.overdueGuestRequests).map((r: any) => ({
      guest: r.guest_name, type: r.request_type, details: (r.details ?? "").slice(0, 80), since: r.created_at,
    })),
    pending_housekeeping: take(state.pendingHousekeeping).map((h: any) => ({
      unit: h.unit_name, status: h.status,
    })),
    unconfirmed_tours: take(state.unconfirmedTours).map((t: any) => ({
      tour: t.tour_name, date: t.tour_date, guest: t.guest_name ?? "",
    })),
    stuck_orders: take(state.stuckOrders).map((o: any) => ({
      type: o.order_type, status: o.status, since: o.created_at, where: o.location_detail ?? "",
    })),
    open_tabs: take(state.openTabs).map((t: any) => ({
      guest: t.guest_name ?? "", where: t.location_detail ?? "", since: t.created_at ?? "",
    })),
    open_cases: take(state.openCases, 12).map((c: any) => ({
      id: c.id, domain: c.domain, status: c.status, priority: c.priority,
      action: (c.required_action ?? "").slice(0, 90),
    })),
    pending_approvals: take(state.pendingApprovals).map((c: any) => ({
      id: c.id, domain: c.domain, action: (c.required_action ?? "").slice(0, 90), risk: (c.risk ?? "").slice(0, 90),
    })),
  };
  return JSON.stringify(d);
}

export async function askAgent(question: string, state: ResortState): Promise<AskResult | null> {
  if (!llmEnabled()) return null;
  const started = Date.now();

  const prompt = [
    "You are the KAPWA Resort Operator — the single agent running a small beach resort in Palawan, Philippines.",
    "A manager is asking you a question. Answer from the LIVE STATE below and nothing else.",
    "",
    "LIVE STATE (JSON):",
    digestState(state),
    "",
    "Rules:",
    "- Use only the state above. Never invent guests, amounts, rooms, or statuses.",
    "- Currency is Philippine Peso (₱), whole numbers.",
    "- If something needs doing, name the open case (by domain + short action) or say a new case will be opened on the next cycle.",
    "- NEVER claim an action was already executed. Payments, refunds, booking changes and deletions always require management approval.",
    "- Plain text, direct resort-owner tone, maximum 180 words.",
    "",
    `Manager question: ${question}`,
  ].join("\n");

  const res = await callOpenRouter(prompt, 500, ASK_TIMEOUT_MS);
  if (!res) return null;

  return {
    answer: res.text,
    model: operatorModel(),
    tokens: res.tokens,
    ms: Date.now() - started,
  };
}
