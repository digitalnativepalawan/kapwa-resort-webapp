// resort-operator-execute: single write path for allow-listed operator actions.
//
// Actions:
//   CREATE_HOUSEKEEPING_ORDER  - insert housekeeping_orders (dedupe active rows for the unit)
//   ESCALATE_GUEST_REQUEST     - flip guest_requests.status -> 'escalated'
//   CREATE_TASK                - insert resort_ops_tasks
//
// Every branch writes an audit_log row. Anything outside the allow-list is rejected.
// Gated by admin JWT or by shared x-internal-secret (parity with resort-operator).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const respond = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function isAuthorized(req: Request): { ok: boolean; decidedBy: string } {
  const internal = (req.headers.get("x-internal-secret") ?? "").trim();
  const stored = (Deno.env.get("INTERNAL_FN_SECRET") ?? "").trim();
  if (internal && stored && internal === stored) {
    return { ok: true, decidedBy: "internal" };
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const payload = token ? decodeJwtPayload(token) : null;
  const admin = payload?.is_admin === true ||
    (Array.isArray(payload?.permissions) && payload.permissions.includes("admin"));
  const decidedBy = (payload?.employee_name as string) || (payload?.email as string) || "admin";
  return { ok: admin, decidedBy };
}

async function writeAudit(supabase: any, params: {
  action: "created" | "updated";
  table_name: string;
  record_id: string;
  actor: string;
  details: unknown;
}) {
  try {
    await supabase.from("audit_log").insert({
      employee_id: null,
      employee_name: `resort-operator (${params.actor})`,
      action: params.action,
      table_name: params.table_name,
      record_id: params.record_id,
      details: typeof params.details === "string" ? params.details : JSON.stringify(params.details),
    });
  } catch (err) {
    console.error("[resort-operator-execute] audit_log insert failed", err);
  }
}

// ── action handlers ────────────────────────────────────────────────────────
async function createHousekeepingOrder(supabase: any, payload: any, actor: string) {
  const unitName = String(payload?.unit_name || "").trim();
  if (!unitName) throw new Error("unit_name is required");

  const { data: existing, error: lookupError } = await supabase
    .from("housekeeping_orders")
    .select("id,status")
    .eq("unit_name", unitName)
    .not("status", "in", "(completed,cancelled)")
    .limit(1);
  if (lookupError) throw lookupError;
  if (existing && existing.length > 0) {
    return { skipped: true, reason: "Active housekeeping order already exists", record_id: existing[0].id };
  }

  const { data, error } = await supabase
    .from("housekeeping_orders")
    .insert({
      unit_name: unitName,
      status: "pending_inspection",
      cleaning_notes: "Created by Resort Operator (approved)",
      priority: String(payload?.priority || "normal"),
    })
    .select("id,status,unit_name")
    .single();
  if (error) throw error;

  await writeAudit(supabase, {
    action: "created",
    table_name: "housekeeping_orders",
    record_id: data.id,
    actor,
    details: { source: "resort-operator-execute", action_type: "CREATE_HOUSEKEEPING_ORDER", payload, record: data },
  });
  return { executed: true, record: data };
}

async function escalateGuestRequest(supabase: any, payload: any, actor: string) {
  const requestId = String(payload?.guest_request_id || payload?.id || "").trim();
  if (!requestId) throw new Error("guest_request_id is required");

  const { data, error } = await supabase
    .from("guest_requests")
    .update({ status: "escalated", escalated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .select("id,status,guest_name,request_type")
    .single();
  if (error) throw error;

  await writeAudit(supabase, {
    action: "updated",
    table_name: "guest_requests",
    record_id: data.id,
    actor,
    details: { source: "resort-operator-execute", action_type: "ESCALATE_GUEST_REQUEST", payload, record: data },
  });
  return { executed: true, record: data };
}

async function createTask(supabase: any, payload: any, actor: string) {
  const title = String(payload?.title || "").trim();
  if (!title) throw new Error("title is required");

  // Dedupe on identical open title + category.
  const category = String(payload?.category || "operations");
  const { data: existing } = await supabase
    .from("resort_ops_tasks")
    .select("id,status,title")
    .eq("title", title)
    .eq("category", category)
    .not("status", "in", "(done,cancelled)")
    .limit(1);
  if (existing && existing.length > 0) {
    return { skipped: true, reason: "Open task with same title already exists", record_id: existing[0].id };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("resort_ops_tasks")
    .insert({
      title,
      description: String(payload?.description || ""),
      category,
      priority: String(payload?.priority || "medium"),
      due_date: String(payload?.due_date || today),
      status: "pending",
    })
    .select("id,title,category,priority,status,due_date")
    .single();
  if (error) throw error;

  await writeAudit(supabase, {
    action: "created",
    table_name: "resort_ops_tasks",
    record_id: data.id,
    actor,
    details: { source: "resort-operator-execute", action_type: "CREATE_TASK", payload, record: data },
  });
  return { executed: true, record: data };
}

const HANDLERS: Record<string, (supabase: any, payload: any, actor: string) => Promise<any>> = {
  CREATE_HOUSEKEEPING_ORDER: createHousekeepingOrder,
  ESCALATE_GUEST_REQUEST: escalateGuestRequest,
  CREATE_TASK: createTask,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = isAuthorized(req);
  if (!auth.ok) return respond({ ok: false, error: "Admin access required" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return respond({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const actionType = String(body?.action_type || "").toUpperCase();
  const handler = HANDLERS[actionType];
  if (!handler) {
    return respond({ ok: false, error: `action_type not permitted: ${actionType || "(missing)"}` }, 400);
  }

  const decidedBy = String(body?.decided_by || auth.decidedBy || "admin");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const result = await handler(supabase, body?.payload ?? {}, decidedBy);
    return respond({ ok: true, action_type: actionType, source_action_id: body?.source_action_id ?? null, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[resort-operator-execute] ${actionType} failed`, message);
    return respond({ ok: false, action_type: actionType, error: message }, 500);
  }
});
