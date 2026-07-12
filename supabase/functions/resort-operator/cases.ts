// Shared operational case helpers. Every case moves:
// open -> assigned/in_progress/pending_approval -> resolved (verified) -> closed
// or -> escalated. History is append-only.

export interface NewCase {
  domain: string;
  issue_type: string;
  source_table: string;
  source_id: string | null;
  booking_id?: string | null;
  guest_name?: string;
  unit_label?: string;
  department?: string;
  priority?: string;
  risk?: string;
  due_at?: string | null;
  required_action?: string;
  approval_required?: boolean;
  verification_rule?: string;
}

export function historyEntry(event: string, detail: unknown = null) {
  return { at: new Date().toISOString(), event, detail };
}

/** Idempotent case creation: returns existing open case for the same source record. */
export async function openCase(supabase: any, c: NewCase) {
  const { data: existing } = await supabase
    .from("ops_cases")
    .select("*")
    .eq("domain", c.domain)
    .eq("source_table", c.source_table)
    .eq("source_id", c.source_id)
    .not("status", "in", "(resolved,closed)")
    .maybeSingle();
  if (existing) return { case: existing, created: false };

  const { data, error } = await supabase
    .from("ops_cases")
    .insert({
      ...c,
      status: c.approval_required ? "pending_approval" : "open",
      history: [historyEntry("detected", { issue_type: c.issue_type })],
    })
    .select()
    .single();
  if (error) {
    // Unique-index race: another cycle created it. Re-read.
    const { data: raced } = await supabase
      .from("ops_cases").select("*")
      .eq("domain", c.domain).eq("source_table", c.source_table).eq("source_id", c.source_id)
      .not("status", "in", "(resolved,closed)").maybeSingle();
    if (raced) return { case: raced, created: false };
    throw error;
  }
  return { case: data, created: true };
}

export async function appendHistory(supabase: any, caseId: string, event: string, detail: unknown = null, patch: Record<string, unknown> = {}) {
  const { data: row } = await supabase.from("ops_cases").select("history").eq("id", caseId).single();
  const history = Array.isArray(row?.history) ? row.history : [];
  history.push(historyEntry(event, detail));
  await supabase.from("ops_cases").update({ history, ...patch }).eq("id", caseId);
}

export async function resolveCase(supabase: any, caseId: string, evidence: Record<string, unknown>) {
  await appendHistory(supabase, caseId, "resolved", evidence, {
    status: "resolved",
    verified: true,
    verified_at: new Date().toISOString(),
    resolution_evidence: evidence,
    closed_at: new Date().toISOString(),
  });
}

export async function escalateCase(supabase: any, c: any, reason: string) {
  await appendHistory(supabase, c.id, "escalated", { reason }, {
    status: "escalated",
    escalation_level: (c.escalation_level ?? 0) + 1,
  });
}
