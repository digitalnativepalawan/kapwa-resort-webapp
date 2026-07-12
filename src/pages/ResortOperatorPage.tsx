import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/auditLog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Bot, Check, ClipboardCheck, Loader2, RefreshCw, Settings, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';

const from = (table: string) => supabase.from(table as any);
const manilaDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const RUNTIME_URL = import.meta.env.VITE_AGENT_RUNTIME_URL || 'http://127.0.0.1:3000/api';
const TOKEN_KEY = 'kapwa_agent_admin_token';
const ACTIONS_KEY = 'kapwa_resort_operator_actions';

type ProposedAction = {
  action_type: string;
  title: string;
  description: string;
  target_table?: string;
  target_id?: string;
  payload?: Record<string, unknown>;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
};

type AgentAction = ProposedAction & {
  id: string;
  status: 'proposed' | 'approved' | 'rejected' | 'executed' | 'failed';
  created_at: string;
  execution_result?: Record<string, unknown> | null;
};

async function loadSnapshot() {
  const today = manilaDate();
  const [bookings, units, housekeeping, requests, disputes, tours, orders] = await Promise.all([
    from('resort_ops_bookings').select('*, resort_ops_guests(*)').lte('check_in', today).gte('check_out', today),
    from('units').select('*').eq('active', true).order('unit_name'),
    from('housekeeping_orders').select('*').neq('status', 'completed').order('created_at', { ascending: false }),
    from('guest_requests').select('*').not('status', 'in', '(completed,cancelled)').order('created_at', { ascending: false }).limit(50),
    from('bill_disputes').select('*').eq('status', 'open').order('created_at', { ascending: false }),
    from('guest_tours').select('*').eq('tour_date', today).order('pickup_time'),
    from('orders').select('*').in('status', ['pending', 'preparing']).order('created_at', { ascending: false }).limit(50),
  ]);
  const error = [bookings, units, housekeeping, requests, disputes, tours, orders].find(result => result.error)?.error;
  if (error) throw error;
  return { today, bookings: bookings.data || [], units: units.data || [], housekeeping: housekeeping.data || [], requests: requests.data || [], disputes: disputes.data || [], tours: tours.data || [], orders: orders.data || [] };
}

function buildBrief(snapshot: Awaited<ReturnType<typeof loadSnapshot>>) {
  const arrivals = snapshot.bookings.filter((b: any) => b.check_in === snapshot.today);
  const departures = snapshot.bookings.filter((b: any) => b.check_out === snapshot.today);
  const dirtyRooms = snapshot.units.filter((u: any) => ['to_clean', 'dirty'].includes(String(u.status).toLowerCase()));
  const urgentRequests = snapshot.requests.filter((r: any) => ['urgent', 'high'].includes(String(r.priority).toLowerCase()));
  const actions: ProposedAction[] = [];

  dirtyRooms.forEach((unit: any) => {
    if (!snapshot.housekeeping.some((task: any) => task.unit_name === unit.unit_name)) actions.push({
      action_type: 'create_housekeeping_task',
      title: `Create cleaning task for ${unit.unit_name}`,
      description: 'Room is marked for cleaning but has no active housekeeping order.',
      target_table: 'units',
      target_id: unit.id,
      payload: { unit_name: unit.unit_name, room_type_id: unit.room_type_id || null, status: 'pending_inspection', cleaning_notes: 'Created by KAPWA Resort Operator after management approval.' },
      risk_level: 'low',
    });
  });

  urgentRequests.forEach((request: any) => actions.push({
    action_type: 'escalate_guest_request',
    title: `Escalate guest request${request.guest_name ? ` from ${request.guest_name}` : ''}`,
    description: request.details || request.request_type || 'Urgent guest request requires staff attention.',
    target_table: 'guest_requests',
    target_id: request.id,
    payload: { status: 'escalated', updated_at: new Date().toISOString() },
    risk_level: 'medium',
  }));

  snapshot.disputes.forEach((dispute: any) => actions.push({
    action_type: 'review_bill_dispute',
    title: 'Review open bill dispute',
    description: dispute.reason || dispute.notes || 'An unresolved billing dispute needs management review.',
    target_table: 'bill_disputes',
    target_id: dispute.id,
    payload: {},
    risk_level: 'high',
  }));

  const summary = `${arrivals.length} arrival${arrivals.length === 1 ? '' : 's'} and ${departures.length} departure${departures.length === 1 ? '' : 's'} today. ${dirtyRooms.length} room${dirtyRooms.length === 1 ? '' : 's'} need cleaning; ${snapshot.housekeeping.length} housekeeping task${snapshot.housekeeping.length === 1 ? '' : 's'} remain open. ${snapshot.requests.length} guest request${snapshot.requests.length === 1 ? '' : 's'}, ${snapshot.disputes.length} open billing dispute${snapshot.disputes.length === 1 ? '' : 's'}, and ${snapshot.orders.length} active F&B order${snapshot.orders.length === 1 ? '' : 's'}. ${snapshot.tours.length} tour movement${snapshot.tours.length === 1 ? '' : 's'} scheduled today.`;
  return { summary, actions, metrics: { arrivals: arrivals.length, departures: departures.length, dirtyRooms: dirtyRooms.length, openHousekeeping: snapshot.housekeeping.length, guestRequests: snapshot.requests.length, disputes: snapshot.disputes.length, activeOrders: snapshot.orders.length, tours: snapshot.tours.length } };
}

async function executeApprovedAction(action: AgentAction) {
  if (action.action_type === 'create_housekeeping_task') {
    const unitName = String(action.payload?.unit_name || '').trim();
    if (!unitName) throw new Error('Housekeeping action is missing a unit name.');
    const { data: existing, error: lookupError } = await from('housekeeping_orders').select('id,status').eq('unit_name', unitName).neq('status', 'completed').limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) return { skipped: true, reason: 'An active housekeeping order already exists.', record_id: existing[0].id };
    const { data, error } = await from('housekeeping_orders').insert({ unit_name: unitName, room_type_id: action.payload?.room_type_id || null, status: 'pending_inspection', cleaning_notes: String(action.payload?.cleaning_notes || 'Created by KAPWA Resort Operator.') }).select('id,status,unit_name').single();
    if (error) throw error;
    return { created: true, record: data };
  }
  if (action.action_type === 'escalate_guest_request') {
    if (!action.target_id) throw new Error('Guest request action is missing a target record.');
    const { data, error } = await from('guest_requests').update({ status: 'escalated', updated_at: new Date().toISOString() }).eq('id', action.target_id).select('id,status,guest_name,request_type').single();
    if (error) throw error;
    return { updated: true, record: data };
  }
  throw new Error('This action requires manual management execution.');
}

export default function ResortOperatorPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [question, setQuestion] = useState('What needs my attention today?');
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);
  const [runtimeLabel, setRuntimeLabel] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [actions, setActions] = useState<AgentAction[]>(() => {
    try { return JSON.parse(localStorage.getItem(ACTIONS_KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions.slice(0, 100))); }, [actions]);

  const snapshotQuery = useQuery({ queryKey: ['resort-operator-snapshot'], queryFn: loadSnapshot, refetchInterval: 15000 });
  const brief = useMemo(() => snapshotQuery.data ? buildBrief(snapshotQuery.data) : null, [snapshotQuery.data]);

  const runOperator = useMutation({
    mutationFn: async () => {
      if (!snapshotQuery.data || !brief) throw new Error('Operational data is not ready.');
      let analysis = brief.summary;
      let provider: string | null = null;
      let model: string | null = null;
      const adminToken = sessionStorage.getItem(TOKEN_KEY) || '';
      if (adminToken) {
        try {
          const response = await fetch(`${RUNTIME_URL}/operator/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-kapwa-admin-token': adminToken }, body: JSON.stringify({ question, snapshot: snapshotQuery.data, deterministicSummary: brief.summary }) });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || `Runtime returned ${response.status}`);
          analysis = payload.reply || brief.summary;
          provider = payload.provider || null;
          model = payload.model || null;
        } catch (error) {
          toast.warning(`AI analysis unavailable; deterministic operations loop used. ${error instanceof Error ? error.message : ''}`);
        }
      }

      const createdAt = new Date().toISOString();
      const newActions: AgentAction[] = brief.actions.map(action => ({ ...action, id: crypto.randomUUID(), status: 'proposed', created_at: createdAt, execution_result: null }));
      await logAudit('created', 'resort_operator', crypto.randomUUID(), JSON.stringify({ question, summary: analysis, provider, model, proposed_actions: newActions.length }));
      return { ...brief, analysis, provider, model, newActions };
    },
    onSuccess: result => {
      setLastAnswer(result.analysis);
      setRuntimeLabel(result.provider && result.model ? `${result.provider} · ${result.model}` : 'Deterministic analysis');
      setActions(current => [...result.newActions, ...current]);
      toast.success(`${result.newActions.length} controlled action proposal${result.newActions.length === 1 ? '' : 's'} created`);
    },
    onError: error => toast.error(error instanceof Error ? error.message : 'Operator run failed'),
  });

  const decideAction = async (action: AgentAction, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected') {
      setActions(current => current.map(item => item.id === action.id ? { ...item, status: 'rejected' } : item));
      await logAudit('updated', 'resort_operator_action', action.id, `Rejected: ${action.title}`);
      toast.success('Action rejected');
      return;
    }

    if (!['create_housekeeping_task', 'escalate_guest_request'].includes(action.action_type)) {
      setActions(current => current.map(item => item.id === action.id ? { ...item, status: 'approved' } : item));
      await logAudit('updated', 'resort_operator_action', action.id, `Approved for manual execution: ${action.title}`);
      toast.success('Action approved for manual management execution');
      return;
    }

    setExecutingId(action.id);
    try {
      const result = await executeApprovedAction(action);
      setActions(current => current.map(item => item.id === action.id ? { ...item, status: 'executed', execution_result: result } : item));
      await logAudit('updated', 'resort_operator_action', action.id, JSON.stringify({ title: action.title, result }));
      toast.success(result.skipped ? 'Action was already satisfied' : 'Approved action executed');
      qc.invalidateQueries({ queryKey: ['resort-operator-snapshot'] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Execution failed';
      setActions(current => current.map(item => item.id === action.id ? { ...item, status: 'failed', execution_result: { error: message } } : item));
      await logAudit('updated', 'resort_operator_action', action.id, `Failed: ${message}`);
      toast.error(message);
    } finally {
      setExecutingId(null);
    }
  };

  const pending = actions.filter(action => action.status === 'proposed');
  const recent = actions.filter(action => action.status !== 'proposed').slice(0, 12);

  return <div className="min-h-screen bg-background text-foreground p-4 md:p-8"><div className="max-w-6xl mx-auto space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">KAPWA Hospitality OS</p><h1 className="font-display text-3xl flex items-center gap-2"><Bot className="w-7 h-7" />Resort Operator</h1><p className="text-sm text-muted-foreground mt-1">Uses the existing hosted resort data and executes only approved allow-listed actions.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate('/admin/agent-runtime')}><Settings className="w-4 h-4 mr-2" />AI Runtime</Button><Button variant="outline" onClick={() => snapshotQuery.refetch()} disabled={snapshotQuery.isFetching}><RefreshCw className={`w-4 h-4 mr-2 ${snapshotQuery.isFetching ? 'animate-spin' : ''}`} />Refresh</Button><Button variant="outline" onClick={() => navigate('/admin')}><ArrowLeft className="w-4 h-4 mr-2" />Admin</Button></div></div>
    {brief && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Object.entries(brief.metrics).map(([key, value]) => <Card key={key}><CardContent className="p-4"><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</p></CardContent></Card>)}</div>}
    <Card><CardHeader><CardTitle>Ask the operator</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="What needs attention today?" /><Button onClick={() => runOperator.mutate()} disabled={runOperator.isPending || !brief || !question.trim()}>{runOperator.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}Run operations loop</Button>{runtimeLabel && <Badge variant="outline">{runtimeLabel}</Badge>}{lastAnswer && <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap">{lastAnswer}</div>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center justify-between"><span>Approval queue</span><Badge variant={pending.length ? 'destructive' : 'secondary'}>{pending.length} pending</Badge></CardTitle></CardHeader><CardContent className="space-y-3">{pending.length === 0 ? <p className="text-sm text-muted-foreground">No proposed actions are waiting for approval.</p> : pending.map(action => <div key={action.id} className="rounded-lg border border-border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"><div className="space-y-1"><div className="flex items-center gap-2"><p className="font-medium">{action.title}</p><Badge variant="outline">{action.risk_level}</Badge></div><p className="text-sm text-muted-foreground">{action.description}</p></div><div className="flex gap-2"><Button size="sm" disabled={executingId === action.id} onClick={() => decideAction(action, 'approved')}>{executingId === action.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}Approve</Button><Button size="sm" variant="outline" disabled={executingId === action.id} onClick={() => decideAction(action, 'rejected')}><X className="w-4 h-4 mr-1" />Reject</Button></div></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Recent action history</CardTitle></CardHeader><CardContent className="space-y-2">{recent.length === 0 ? <p className="text-sm text-muted-foreground">No action decisions have been recorded yet.</p> : recent.map(action => <div key={action.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"><div><p className="text-sm font-medium">{action.title}</p><p className="text-xs text-muted-foreground">{action.description}</p></div><Badge variant={action.status === 'failed' ? 'destructive' : 'secondary'}>{action.status}</Badge></div>)}</CardContent></Card>
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3 text-sm"><ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" /><p>Only housekeeping task creation and urgent guest-request escalation execute automatically after approval. Bookings, billing, payments, refunds, prices, external messages, and deletions remain manual.</p></div>
  </div></div>;
}
