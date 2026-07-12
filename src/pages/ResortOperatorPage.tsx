import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/auditLog';
import { notifyTelegram } from '@/lib/telegram';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Bot, Check, Loader2, RefreshCw, Send, ShieldAlert, Sparkles, X } from 'lucide-react';
import OpsCasesPanel from '@/components/admin/OpsCasesPanel';
import { toast } from 'sonner';

const from = (table: string) => supabase.from(table as any);
const ACTIONS_KEY = 'kapwa_resort_operator_actions';
const ADMIN_TOKEN_KEY = 'kapwa_agent_admin_token';
const AGENT_RUNTIME_URL = import.meta.env.VITE_AGENT_RUNTIME_URL || 'http://localhost:3000/api';

type BriefType = 'morning' | 'evening' | 'daily';
type ActionStatus = 'proposed' | 'approved' | 'rejected' | 'executed' | 'failed';

type AgentAction = {
  id: string;
  action_type: string;
  title: string;
  description: string;
  target_id?: string;
  payload?: Record<string, unknown>;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  status: ActionStatus;
  source?: 'server' | 'coordinator';
  created_at: string;
  execution_result?: Record<string, unknown> | null;
};

type CoordinatorResult = {
  ok: boolean;
  type: BriefType;
  delivery: 'preview' | 'telegram';
  brief: string;
  provider: string;
  model: string | null;
  generated_at: string;
  actions: AgentAction[];
  data: {
    occupancy: { active: number; total: number; pct: number };
    total_unpaid: number;
    arrivals: { expected: number; checked_in: number; pending: number };
    departures: { expected: number; checked_out: number };
    housekeeping: { open: number; dirty_units: unknown[]; missing_orders: unknown[]; damage_notes: string[] };
    requests: { open: number; overdue: number; urgent: unknown[] };
    overdue_tasks: unknown[];
    tours_today: unknown[];
    fb_today: number;
    open_tabs: unknown[];
    expenses_today: { total: number; count: number };
  };
};

type FullLoopResult = {
  operations: CoordinatorResult;
  concierge: { ok: boolean; total?: number; routed?: number; escalated?: number; complaints?: number; error?: string };
  reservations: { ok: boolean; issues_found?: number; error?: string };
  completed_at: string;
};

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data?.ok === false) throw new Error(data.error || `${name} failed`);
  return data as T;
}

const runCoordinator = (type: BriefType, question: string, delivery: 'preview' | 'telegram') =>
  invokeFunction<CoordinatorResult>('ops-coordinator', { type, question, delivery, group: 'managers' });

const runFullLoop = (type: BriefType, question: string) =>
  invokeFunction<FullLoopResult & { ok: boolean }>('resort-agent-loop', { type, question });

type ServerOperatorResult = {
  id: string;
  ok: boolean;
  date: string;
  brief: {
    summary: string;
    metrics: Record<string, number>;
    generated_at: string;
    mode: string;
  };
  llm_analysis: { reply?: string; provider?: string; model?: string; error?: string } | null;
  proposed_actions: AgentAction[];
  snapshot_summary: Record<string, number>;
  created_at: string;
};

async function runServerOperator(type: BriefType, question: string, adminToken: string): Promise<ServerOperatorResult> {
  const res = await fetch(`${AGENT_RUNTIME_URL}/operator/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-kapwa-admin-token': adminToken,
    },
    body: JSON.stringify({ type, question, useLLM: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || 'Resort Operator run failed');
  const data = JSON.parse(text);
  if (data?.ok === false) throw new Error(data.error || 'Resort Operator run failed');
  return data;
}

async function executeServerAction(action: AgentAction, adminToken: string) {
  const res = await fetch(`${AGENT_RUNTIME_URL}/operator/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-kapwa-admin-token': adminToken,
    },
    body: JSON.stringify({
      action,
      actor: localStorage.getItem('emp_name') || 'admin',
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || 'Action execution failed');
  return JSON.parse(text);
}

async function executeApprovedAction(action: AgentAction) {
  if (action.action_type === 'create_housekeeping_task') {
    const unitName = String(action.payload?.unit_name || '').trim();
    if (!unitName) throw new Error('Housekeeping action is missing a unit name.');

    const { data: existing, error: lookupError } = await from('housekeeping_orders')
      .select('id,status').eq('unit_name', unitName).not('status', 'in', '(completed,cancelled)').limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) return { skipped: true, reason: 'An active housekeeping order already exists.', record_id: (existing[0] as any).id };

    const { data, error } = await from('housekeeping_orders')
      .insert({ unit_name: unitName, status: 'pending_inspection', cleaning_notes: 'Created by KAPWA Resort Operator after management approval.' })
      .select('id,status,unit_name').single();
    if (error) throw error;

    notifyTelegram('housekeeping', `<b>New housekeeping task</b>\n${unitName}\nCreated by KAPWA Resort Operator.`);
    return { created: true, record: data };
  }

  if (action.action_type === 'escalate_guest_request') {
    if (!action.target_id) throw new Error('Guest request action is missing its target record.');
    const { data, error } = await from('guest_requests')
      .update({ status: 'escalated', updated_at: new Date().toISOString() })
      .eq('id', action.target_id).select('id,status,guest_name,request_type').single();
    if (error) throw error;

    const rec = data as any;
    notifyTelegram('reception,managers', `<b>Urgent guest request escalated</b>\n${rec?.guest_name || 'Guest'} · ${rec?.request_type || 'Request'}`);
    return { updated: true, record: rec };
  }

  throw new Error('This action requires manual management execution.');
}

export default function ResortOperatorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [briefType, setBriefType] = useState<BriefType>('morning');
  const [question, setQuestion] = useState('What needs my attention right now?');
  const [result, setResult] = useState<CoordinatorResult | null>(null);
  const [fullResult, setFullResult] = useState<FullLoopResult | null>(null);
  const [serverResult, setServerResult] = useState<ServerOperatorResult | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState(() => {
    try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; }
  });
  const [actions, setActions] = useState<AgentAction[]>(() => {
    try { return JSON.parse(localStorage.getItem(ACTIONS_KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions.slice(0, 100))), [actions]);

  const recordResult = async (nextResult: CoordinatorResult, source: string) => {
    setResult(nextResult);
    setActions(current => [...nextResult.actions.map(action => ({ ...action, execution_result: null })), ...current]);
    await logAudit('created', source, crypto.randomUUID(), JSON.stringify({
      type: nextResult.type,
      delivery: nextResult.delivery,
      provider: nextResult.provider,
      model: nextResult.model,
      proposals: nextResult.actions.length,
    }));
  };

  const coordinator = useMutation({
    mutationFn: (delivery: 'preview' | 'telegram') => runCoordinator(briefType, question, delivery),
    onSuccess: async nextResult => {
      await recordResult(nextResult, 'ops_coordinator');
      toast.success(nextResult.delivery === 'telegram' ? 'Operations brief sent to managers' : 'Operations brief generated');
    },
    onError: error => toast.error(error instanceof Error ? error.message : 'Operations coordinator failed'),
  });

  const fullLoop = useMutation({
    mutationFn: () => runFullLoop(briefType, question),
    onSuccess: async nextResult => {
      setFullResult(nextResult);
      await recordResult(nextResult.operations, 'full_resort_agent_loop');
      await logAudit('created', 'agent_modules', crypto.randomUUID(), JSON.stringify({
        concierge: nextResult.concierge,
        reservations: nextResult.reservations,
      }));
      toast.success('Operations, concierge, and reservations loop completed');
    },
    onError: error => toast.error(error instanceof Error ? error.message : 'Full resort loop failed'),
  });

  const serverOperator = useMutation({
    mutationFn: () => {
      if (!adminToken.trim()) throw new Error('Agent admin token is required');
      return runServerOperator(briefType, question, adminToken);
    },
    onSuccess: async data => {
      setServerResult(data);
      const serverActions = (data.proposed_actions || []).map(action => ({ ...action, source: 'server' as const, status: 'proposed' as const, execution_result: null }));
      setActions(current => [...serverActions, ...current]);
      await logAudit('created', 'resort_operator_run', data.id, JSON.stringify({
        type: briefType,
        actions: serverActions.length,
        provider: data.llm_analysis?.provider || 'deterministic',
        model: data.llm_analysis?.model || null,
      }));
      toast.success(`${serverActions.length} Resort Operator actions proposed`);
    },
    onError: error => toast.error(error instanceof Error ? error.message : 'Resort Operator run failed'),
  });

  const decideAction = async (action: AgentAction, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected') {
      setActions(current => current.map(item => item.id === action.id ? { ...item, status: 'rejected' } : item));
      await logAudit('updated', 'resort_operator_action', action.id, `Rejected: ${action.title}`);
      toast.success('Action rejected');
      return;
    }

    setExecutingId(action.id);
    try {
      const execution = action.source === 'server'
        ? await executeServerAction(action, adminToken)
        : await executeApprovedAction(action);
      setActions(current => current.map(item => item.id === action.id ? { ...item, status: 'executed', execution_result: execution } : item));
      await logAudit('updated', 'resort_operator_action', action.id, JSON.stringify({ title: action.title, source: action.source || 'coordinator', execution }));
      const skipped = (execution as any)?.status === 'skipped' || execution?.skipped;
      toast.success(skipped ? 'Action already satisfied' : 'Approved action executed');
      queryClient.invalidateQueries();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Execution failed';
      const manual = message.includes('manual management');
      setActions(current => current.map(item => item.id === action.id
        ? { ...item, status: manual ? 'approved' : 'failed', execution_result: manual ? null : { error: message } }
        : item));
      await logAudit('updated', 'resort_operator_action', action.id, manual ? `Approved for manual execution: ${action.title}` : `Failed: ${message}`);
      manual ? toast.success('Approved for manual management execution') : toast.error(message);
    } finally {
      setExecutingId(null);
    }
  };

  const pending = actions.filter(action => action.status === 'proposed');
  const history = actions.filter(action => action.status !== 'proposed').slice(0, 12);
  const metrics = useMemo(() => result ? [
    ['Occupancy', `${result.data.occupancy.active}/${result.data.occupancy.total} · ${result.data.occupancy.pct}%`],
    ['Arrivals', result.data.arrivals.expected],
    ['Departures', result.data.departures.expected],
    ['Housekeeping', result.data.housekeeping.open],
    ['Guest requests', result.data.requests.open],
    ['Overdue tasks', result.data.overdue_tasks.length],
    ['Open tabs', result.data.open_tabs.length],
    ['Unpaid', `₱${result.data.total_unpaid.toLocaleString()}`],
  ] : [], [result]);
  const isRunning = coordinator.isPending || fullLoop.isPending || serverOperator.isPending;

  return (
    <div className="min-h-screen bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">KAPWA Hospitality OS</p>
            <h1 className="font-display flex items-center gap-2 text-3xl"><Bot className="h-7 w-7" />Resort Operations</h1>
            <p className="mt-1 text-sm text-muted-foreground">One secure loop for operations, concierge, reservations, tasks, AI analysis, and Telegram.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/admin')}><ArrowLeft className="mr-2 h-4 w-4" />Admin</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Run the resort agents</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <Select value={briefType} onValueChange={(value: BriefType) => setBriefType(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning brief</SelectItem>
                  <SelectItem value="evening">Evening brief</SelectItem>
                  <SelectItem value="daily">Daily summary</SelectItem>
                </SelectContent>
              </Select>
              <Textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about current resort operations" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => serverOperator.mutate()} disabled={isRunning || !question.trim() || !adminToken.trim()}>
                {serverOperator.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Run Daily Operator
              </Button>
              <Button variant="outline" onClick={() => fullLoop.mutate()} disabled={isRunning || !question.trim()}>
                {fullLoop.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Run full resort loop
              </Button>
              <Button variant="outline" onClick={() => coordinator.mutate('preview')} disabled={isRunning || !question.trim()}>
                {coordinator.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Operations only
              </Button>
              <Button variant="outline" onClick={() => coordinator.mutate('telegram')} disabled={isRunning || !question.trim()}>
                <Send className="mr-2 h-4 w-4" />Send brief to managers
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Input
                type="password"
                placeholder="Agent admin token (KAPWA_ADMIN_TOKEN)"
                value={adminToken}
                onChange={event => {
                  setAdminToken(event.target.value);
                  try { sessionStorage.setItem(ADMIN_TOKEN_KEY, event.target.value); } catch {}
                }}
              />
              <p className="text-xs text-muted-foreground md:text-right">Stored only in this browser session.</p>
            </div>

            {serverResult && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{serverResult.llm_analysis?.provider || 'deterministic'}{serverResult.llm_analysis?.model ? ` · ${serverResult.llm_analysis.model}` : ''}</Badge>
                  <span>{new Date(serverResult.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{serverResult.brief.summary}</p>
                {serverResult.llm_analysis?.reply && (
                  <div className="rounded-lg border-l-2 border-primary bg-background p-3">
                    <p className="text-xs font-medium text-muted-foreground">AI analysis</p>
                    <p className="whitespace-pre-wrap text-sm">{serverResult.llm_analysis.reply}</p>
                  </div>
                )}
              </div>
            )}

            {fullResult && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3"><p className="font-medium">Operations</p><p className="text-xs text-muted-foreground">{fullResult.operations.actions.length} proposed actions</p></div>
                <div className="rounded-lg border p-3"><p className="font-medium">Concierge</p><p className="text-xs text-muted-foreground">{fullResult.concierge.ok ? `${fullResult.concierge.routed ?? 0} routed · ${fullResult.concierge.escalated ?? 0} escalated · ${fullResult.concierge.complaints ?? 0} complaints` : fullResult.concierge.error || 'Failed'}</p></div>
                <div className="rounded-lg border p-3"><p className="font-medium">Reservations</p><p className="text-xs text-muted-foreground">{fullResult.reservations.ok ? `${fullResult.reservations.issues_found ?? 0} issues found` : fullResult.reservations.error || 'Failed'}</p></div>
              </div>
            )}

            {result && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{result.provider}{result.model ? ` · ${result.model}` : ''}</Badge>
                  <span>{new Date(result.generated_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.brief}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {result && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{metrics.map(([label, value]) => (
          <Card key={String(label)}><CardContent className="p-4"><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>
        ))}</div>}

        {serverResult && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Occupancy', `${serverResult.snapshot_summary.occupied ?? 0}/${serverResult.snapshot_summary.total_units ?? 0}`],
              ['Arrivals', serverResult.snapshot_summary.arrivals ?? 0],
              ['Departures', serverResult.snapshot_summary.departures ?? 0],
              ['Dirty units', serverResult.snapshot_summary.dirty ?? 0],
              ['Open requests', serverResult.snapshot_summary.open_requests ?? 0],
              ['Overdue requests', serverResult.snapshot_summary.overdue_requests ?? 0],
              ['Pending tasks', serverResult.snapshot_summary.pending_tasks ?? 0],
              ['Open cases', serverResult.snapshot_summary.open_cases ?? 0],
            ].map(([label, value]) => (
              <Card key={String(label)}><CardContent className="p-4"><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>
            ))}
          </div>
        )}

        <OpsCasesPanel />

        <Card>
          <CardHeader><CardTitle className="flex items-center justify-between"><span>Approval queue</span><Badge variant={pending.length ? 'destructive' : 'secondary'}>{pending.length} pending</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!pending.length ? <p className="text-sm text-muted-foreground">No actions are waiting for approval.</p> : pending.map(action => (
              <div key={action.id} className="flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{action.title}</p>
                    <Badge variant="outline">{action.risk_level}</Badge>
                    {action.source === 'server' && <Badge variant="secondary">server</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={executingId === action.id} onClick={() => decideAction(action, 'approved')}>{executingId === action.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Approve</Button>
                  <Button size="sm" variant="outline" disabled={executingId === action.id} onClick={() => decideAction(action, 'rejected')}><X className="mr-1 h-4 w-4" />Reject</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent action history</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!history.length ? <p className="text-sm text-muted-foreground">No decisions recorded yet.</p> : history.map(action => (
              <div key={action.id} className="flex items-start justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">{action.title}</p><p className="text-xs text-muted-foreground">{action.description}</p></div><Badge variant={action.status === 'failed' ? 'destructive' : 'secondary'}>{action.status}</Badge></div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
          <p>The Daily Operator reads live Supabase data, proposes deterministic actions, optionally asks the configured AI provider for analysis, and can execute approved safe actions (housekeeping orders, escalations, tasks). Booking changes, prices, payments, refunds, external guest replies, and deletions remain management-controlled.</p>
        </div>
      </div>
    </div>
  );
}
