import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/auditLog';
import { notifyTelegram } from '@/lib/telegram';
import { askOperator, getRuntimeSettings, runtimeHealth, isRuntimeConfigured } from '@/lib/agentRuntime';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Bot, Check, Loader2, Play, RefreshCw, Send, ShieldAlert, Sparkles, X } from 'lucide-react';
import OpsCasesPanel from '@/components/admin/OpsCasesPanel';
import { toast } from 'sonner';

const from = (table: string) => supabase.from(table as any);
const ACTIONS_KEY = 'kapwa_resort_operator_actions';


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

// Map legacy proposal shapes to the server allow-list.
function toExecutionRequest(action: AgentAction): { action_type: string; payload: Record<string, unknown> } | null {
  const type = String(action.action_type || '').toLowerCase();
  const payload = action.payload || {};
  if (type === 'create_housekeeping_task' || type === 'create_housekeeping_order') {
    return { action_type: 'CREATE_HOUSEKEEPING_ORDER', payload: { unit_name: payload.unit_name, priority: payload.priority } };
  }
  if (type === 'escalate_guest_request') {
    return { action_type: 'ESCALATE_GUEST_REQUEST', payload: { guest_request_id: action.target_id || payload.guest_request_id } };
  }
  if (type === 'create_task') {
    return {
      action_type: 'CREATE_TASK',
      payload: {
        title: payload.title || action.title,
        description: payload.description || action.description,
        category: payload.category || 'operations',
        priority: payload.priority || 'medium',
        due_date: payload.due_date,
      },
    };
  }
  return null;
}

async function executeApprovedAction(action: AgentAction) {
  const request = toExecutionRequest(action);
  if (!request) throw new Error('This action requires manual management execution.');
  const { data, error } = await supabase.functions.invoke('resort-operator-execute', {
    body: { ...request, source_action_id: action.id, decided_by: localStorage.getItem('emp_name') || 'admin' },
  });
  if (error) throw new Error(error.message || 'Execution failed');
  const result = data as any;
  if (!result?.ok) throw new Error(result?.error || 'Execution failed');
  return result;
}


export default function ResortOperatorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [briefType, setBriefType] = useState<BriefType>('morning');
  const [question, setQuestion] = useState('What needs my attention right now?');
  const [result, setResult] = useState<CoordinatorResult | null>(null);
  const [fullResult, setFullResult] = useState<FullLoopResult | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
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

  const decideAction = async (action: AgentAction, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected') {
      setActions(current => current.map(item => item.id === action.id ? { ...item, status: 'rejected' } : item));
      await logAudit('updated', 'resort_operator_action', action.id, `Rejected: ${action.title}`);
      toast.success('Action rejected');
      return;
    }

    setExecutingId(action.id);
    try {
      const execution = await executeApprovedAction(action);
      setActions(current => current.map(item => item.id === action.id ? { ...item, status: 'executed', execution_result: execution } : item));
      await logAudit('updated', 'resort_operator_action', action.id, JSON.stringify({ title: action.title, execution }));
      toast.success(execution.skipped ? 'Action already satisfied' : 'Approved action executed');
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
  const isRunning = coordinator.isPending || fullLoop.isPending;

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
              <Button onClick={() => fullLoop.mutate()} disabled={isRunning || !question.trim()}>
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

        <OpsCasesPanel />

        <Card>
          <CardHeader><CardTitle className="flex items-center justify-between"><span>Approval queue</span><Badge variant={pending.length ? 'destructive' : 'secondary'}>{pending.length} pending</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!pending.length ? <p className="text-sm text-muted-foreground">No actions are waiting for approval.</p> : pending.map(action => (
              <div key={action.id} className="flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-center">
                <div><div className="flex items-center gap-2"><p className="font-medium">{action.title}</p><Badge variant="outline">{action.risk_level}</Badge></div><p className="text-sm text-muted-foreground">{action.description}</p></div>
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
          <p>The full loop routes guest requests, creates overdue and reservations tasks, sends existing Telegram alerts, and generates management proposals. Booking changes, prices, payments, refunds, external guest replies, and deletions remain management-controlled.</p>
        </div>
      </div>
    </div>
  );
}
