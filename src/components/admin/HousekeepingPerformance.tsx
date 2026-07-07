import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

const from = (table: string) => supabase.from(table as any);

const HousekeepingPerformance = () => {
  const [monthOffset, setMonthOffset] = useState(0);

  const targetDate = subMonths(new Date(), monthOffset);
  const rangeStart = startOfMonth(targetDate).toISOString();
  const rangeEnd = endOfMonth(targetDate).toISOString();

  const { data: orders = [] } = useQuery({
    queryKey: ['hk-performance', rangeStart],
    queryFn: async () => {
      const { data } = await from('housekeeping_orders')
        .select('*')
        .eq('status', 'completed')
        .gte('cleaning_completed_at', rangeStart)
        .lte('cleaning_completed_at', rangeEnd)
        .order('cleaning_completed_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Group by housekeeper
  const byHousekeeper: Record<string, any[]> = {};
  orders.forEach((o: any) => {
    const name = o.accepted_by_name || o.cleaning_by_name || 'Unknown';
    if (!byHousekeeper[name]) byHousekeeper[name] = [];
    byHousekeeper[name].push(o);
  });

  const stats = Object.entries(byHousekeeper).map(([name, rooms]) => {
    const times = rooms.filter((r: any) => r.time_to_complete_minutes).map((r: any) => r.time_to_complete_minutes);
    const avgTime = times.length > 0 ? Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length) : 0;
    return { name, roomsCleaned: rooms.length, avgTime };
  }).sort((a, b) => b.roomsCleaned - a.roomsCleaned);

  const months = [0, 1, 2, 3, 4, 5].map(i => {
    const d = subMonths(new Date(), i);
    return { value: String(i), label: format(d, 'MMMM yyyy') };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm tracking-wider text-muted-foreground uppercase">Housekeeping Performance</h3>
        <Select value={String(monthOffset)} onValueChange={v => setMonthOffset(parseInt(v))}>
          <SelectTrigger className="w-48 bg-secondary border-border text-foreground font-body text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {months.map(m => (
              <SelectItem key={m.value} value={m.value} className="font-body text-xs text-foreground">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-border rounded p-3 bg-card text-center">
          <p className="font-display text-2xl text-foreground">{orders.length}</p>
          <p className="font-body text-xs text-muted-foreground">Total rooms cleaned</p>
        </div>
        <div className="border border-border rounded p-3 bg-card text-center">
          <p className="font-display text-2xl text-foreground">{stats.length}</p>
          <p className="font-body text-xs text-muted-foreground">Active housekeepers</p>
        </div>
      </div>

      {/* Table */}
      {stats.length === 0 ? (
        <p className="font-body text-xs text-muted-foreground text-center py-8">No completed orders for this period</p>
      ) : (
        <div className="space-y-2">
          {stats.map((s, i) => (
            <div key={s.name} className="flex items-center gap-3 border border-border rounded p-3 bg-card">
              <span className="font-display text-lg text-muted-foreground w-6 text-center">{i + 1}</span>
              <div className="flex-1">
                <p className="font-body text-sm text-foreground">{s.name}</p>
                <p className="font-body text-xs text-muted-foreground">{s.roomsCleaned} rooms · avg {s.avgTime || '—'} min</p>
              </div>
              {i === 0 && <Badge className="bg-amber-500/20 text-amber-400 font-body text-xs">Top</Badge>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HousekeepingPerformance;
