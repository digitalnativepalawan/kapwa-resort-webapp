import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface OpsCase {
  id: string;
  domain: string;
  issue_type: string;
  guest_name: string;
  department: string;
  priority: string;
  risk: string;
  status: string;
  required_action: string;
  approval_required: boolean;
  due_at: string | null;
  escalation_level: number;
  created_at: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  escalated: 'destructive',
  pending_approval: 'destructive',
  open: 'outline',
  assigned: 'secondary',
  in_progress: 'secondary',
};

export default function OpsCasesPanel() {
  const [cases, setCases] = useState<OpsCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ops_cases')
      .select('*')
      .not('status', 'in', '(resolved,closed)')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) toast.error(`Failed to load cases: ${error.message}`);
    setCases((data as OpsCase[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (c: OpsCase, approve: boolean) => {
    setDecidingId(c.id);
    try {
      const { data, error } = await supabase.functions.invoke('resort-operator', {
        body: { action: 'decide', case_id: c.id, approve, decided_by: 'admin' },
      });
      if (error || data?.ok === false) throw new Error(error?.message || data?.error || 'decision failed');
      toast.success(approve ? 'Case approved' : 'Case rejected');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDecidingId(null);
    }
  };

  const approvals = cases.filter(c => c.status === 'pending_approval');
  const active = cases.filter(c => c.status !== 'pending_approval');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Live operational cases</span>
          <div className="flex items-center gap-2">
            <Badge variant={approvals.length ? 'destructive' : 'secondary'}>{approvals.length} need approval</Badge>
            <Badge variant="secondary">{active.length} tracked</Badge>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!cases.length && <p className="text-sm text-muted-foreground">No open cases. The operator loop opens cases automatically when it detects problems.</p>}
        {cases.map(c => (
          <div key={c.id} className="flex flex-col justify-between gap-3 rounded-lg border p-4 md:flex-row md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{c.required_action || c.issue_type}</p>
                <Badge variant="outline">{c.domain.replace('_', ' ')}</Badge>
                <Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'}>{c.status.replace('_', ' ')}</Badge>
                {c.priority === 'urgent' && <Badge variant="destructive">urgent</Badge>}
                {c.escalation_level > 0 && <Badge variant="destructive">esc L{c.escalation_level}</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {c.guest_name && <span>{c.guest_name} · </span>}
                {c.department && <span>{c.department} · </span>}
                {c.risk}
                {c.due_at && <span> · due {new Date(c.due_at).toLocaleString()}</span>}
              </p>
            </div>
            {c.status === 'pending_approval' && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" disabled={decidingId === c.id} onClick={() => void decide(c, true)}>
                  {decidingId === c.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Approve
                </Button>
                <Button size="sm" variant="outline" disabled={decidingId === c.id} onClick={() => void decide(c, false)}>
                  <X className="mr-1 h-4 w-4" />Reject
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
