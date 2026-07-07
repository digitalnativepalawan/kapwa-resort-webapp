import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface AuditEntry {
  id: string;
  employee_name: string;
  action: string;
  table_name: string;
  record_id: string;
  details: string;
  created_at: string;
}

const AuditLogView = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [staffFilter, setStaffFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: async () => {
      const { data } = await (supabase.from('audit_log' as any) as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      return (data || []) as AuditEntry[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('audit-log-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, () => {
        qc.invalidateQueries({ queryKey: ['audit-log'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const staffNames = [...new Set(entries.map(e => e.employee_name))].sort();
  const actions = [...new Set(entries.map(e => e.action))].sort();

  const filtered = entries.filter(e => {
    if (staffFilter !== 'all' && e.employee_name !== staffFilter) return false;
    if (actionFilter !== 'all' && e.action !== actionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.details.toLowerCase().includes(q) || e.table_name.toLowerCase().includes(q) || e.employee_name.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = entries.filter(e => e.created_at.startsWith(today));
  const mostActive = todayEntries.reduce((acc, e) => {
    acc[e.employee_name] = (acc[e.employee_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topStaff = Object.entries(mostActive).sort((a, b) => b[1] - a[1])[0];

  const actionColor = (a: string) => {
    if (a === 'created') return 'bg-green-500/20 text-green-400';
    if (a === 'updated') return 'bg-blue-500/20 text-blue-400';
    if (a === 'deleted') return 'bg-red-500/20 text-red-400';
    return 'bg-secondary text-muted-foreground';
  };

  return (
    <div className="space-y-4">
      <h3 className="font-display text-sm tracking-wider text-foreground">Audit Log</h3>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="border border-border rounded-lg p-3 bg-secondary">
          <p className="font-body text-xs text-muted-foreground">Today's Actions</p>
          <p className="font-display text-lg text-foreground">{todayEntries.length}</p>
        </div>
        <div className="border border-border rounded-lg p-3 bg-secondary">
          <p className="font-body text-xs text-muted-foreground">Most Active</p>
          <p className="font-display text-sm text-foreground">{topStaff ? `${topStaff[0]} (${topStaff[1]})` : '—'}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select onValueChange={setStaffFilter} value={staffFilter}>
          <SelectTrigger className="bg-secondary border-border text-foreground font-body w-36">
            <SelectValue placeholder="All Staff" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all" className="text-foreground font-body">All Staff</SelectItem>
            {staffNames.map(n => (
              <SelectItem key={n} value={n} className="text-foreground font-body">{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={setActionFilter} value={actionFilter}>
          <SelectTrigger className="bg-secondary border-border text-foreground font-body w-32">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all" className="text-foreground font-body">All Actions</SelectItem>
            {actions.map(a => (
              <SelectItem key={a} value={a} className="text-foreground font-body">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search..." className="bg-secondary border-border text-foreground font-body flex-1 min-w-[120px]" />
      </div>

      {/* Timeline */}
      {isLoading ? (
        <p className="font-body text-sm text-muted-foreground text-center py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground text-center py-8">No audit entries found</p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filtered.map(e => (
            <div key={e.id} className="border border-border rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-body text-xs text-muted-foreground">
                  {format(new Date(e.created_at), 'MMM d h:mma')}
                </span>
                <span className="font-display text-xs text-foreground">{e.employee_name}</span>
                <Badge variant="secondary" className={`font-body text-[10px] ${actionColor(e.action)}`}>
                  {e.action}
                </Badge>
                <Badge variant="outline" className="font-body text-[10px]">{e.table_name}</Badge>
              </div>
              {e.details && <p className="font-body text-xs text-muted-foreground">{e.details}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AuditLogView;
