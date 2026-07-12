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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Bot, Check, Loader2, RefreshCw, Send, ShieldAlert, X } from 'lucide-react';
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

async function runCoordinator(type: BriefType, question: string, delivery: 'preview' | 'telegram') {
  const { data, error } = await supabase.functions.invoke('ops-coordinator', {
    body: { type, question, delivery, group: 'managers' },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Operations coordinator failed.');
  return data as CoordinatorResult;
}

async function executeApprovedAction(action: AgentAction) {
  if (action.action_type === 'create_housekeeping_task') {
    const unitName = String(action.payload?.unit_name || '').trim();
    if (!unitName) throw new Error('Housekeeping action is missing a unit name.');

    const { data: existing, error: lookupError } = await from('housekeeping_orders')
      .select('id,status')
      .eq('unit_name', unitName)
      .not('status', 'in', '(completed,cancelled)')
      .limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) {
      return { skipped: true, reason: 'An active housekeeping order already exists.', record_id: existing[0].id };
    }

    const { data, error } = await from('housekeeping_orders')
      .insert({
        unit_name: unitName,
        status: 'pending_inspection',
        cleaning_notes: 'Created by KAPWA Resort Operator after management approval.',
      })
      .select('id,status,unit_name')
      .single();
    if (error) throw error;

    notifyTelegram('housekeeping', `<b>New housekeeping task</b>\n${unitName}\nCreated by KAPWA Resort Operator.`);
    return { created: true, record: data };
  }

  if (action.action_type === 'escalate_guest_request') {
    if (!action.target_id) throw new Error('Guest request action is missing its target record.');
    const { data, error } = await from('guest_requests')
      .update({ status: 'escalated', updated_at: new Date().toISOString() })
      .eq('id', action.target_id)
      .select('id,status,guest_name,request_type')
      .single();
    if (error) throw error;

    notifyTelegram('reception,managers', `<b>Urgent guest request escalated</b>\n${data.guest_name || 'Guest'} · ${data.request_type || 'Request'}`);
    return { updated: true, record: data };
  }

  throw new Error('This action requires manual management execution.');
}

export default function ResortOperatorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [briefType, setBriefType] = useState<BriefType>('morning');
  const [question, setQuestion] = useState('What needs my attention right now?');
  const [result, setResult] = useState<CoordinatorResult | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [actions, setActions] = useState<AgentAction[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(ACTIONS_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions.slice(0, 100)));
  }, [actions]);

  const coordinator = useMutation({
    mutationFn: (delivery: 'preview' | 'telegram') => runCoordinator(briefType, question, delivery),
    onSuccess: async (nextResult) => {
      setResult(nextResult);
      setActions(current => [
        ...nextResult.actions.map(action => ({ ...action, execution_result: null })),
        ...current,
      ]);
      await logAudit(
        'created',
        'ops_coordinator',
        crypto.randomUUID(),
        JSON.stringify({
          type: nextResult.type,
          delivery: nextResult.delivery,
          provider: nextResult.provider,
          model: nextResult.model,
          proposals: nextResult.actions.length,
        }),
      );
      toast.success(nextResult.delivery === 'telegram' ? 'Operations brief sent to managers on Telegram' : 'Live operations brief generated');
    },
    onError: error => toast.error(error instanceof Error ? error.message : 'Operations coordinator failed'),
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
      setActions(current => current.map(item => item.id === action.id
        ? { ...item, status: 'executed', execution_result: execution }
        : item));
      await logAudit('updated', 'resort_operator_action', action.id, JSON.stringify({ title: action.title, execution }));
      toast.success(execution.skipped ? 'Action was already satisfied' : 'Approved action executed');
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

  return (
    <div className="min-h-screen bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">KAPWA Hospitality OS</p>
            <h1 className="font-display flex items-center gap-2 text-3xl"><Bot className="h-7 w-7" />Resort Operations</h1>
            <p className="mt-1 text-sm text-muted-foreground">One coordinator for the backoffice, operational tasks, AI analysis, and Telegram.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/admin')}><ArrowLeft className="mr-2 h-4 w-4" />Admin</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Run the resort coordinator</CardTitle></CardHeader>
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
              <Button onClick={() => coordinator.mutate('preview')} disabled={coordinator.isPending || !question.trim()}>
                {coordinator.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Generate live brief
              </Button>
              <Button variant="outline" onClick={() => coordinator.mutate('telegram')} disabled={coordinator.isPending || !question.trim()}>
                <Send className="mr-2 h-4 w-4" />Generate and send to managers
              </Button>
            </div>
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
          <p>Housekeeping creation and urgent-request escalation can execute after approval and notify the correct Telegram groups. Booking changes, prices, payments, refunds, external guest replies, and deletions remain management-controlled.</p>
        </div>
      </div>
    </div>
  );
}