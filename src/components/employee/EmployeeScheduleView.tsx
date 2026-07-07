import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { format, startOfWeek, addDays, isToday } from 'date-fns';

const fmtTime = (t: string) => {
  try {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch { return t; }
};

type Schedule = {
  id: string; employee_id: string; schedule_date: string;
  time_in: string; time_out: string;
};

const EmployeeScheduleView = ({ employeeId }: { employeeId: string }) => {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ['emp-weekly-schedule', employeeId, startStr],
    queryFn: async () => {
      const { data } = await supabase.from('weekly_schedules').select('*')
        .eq('employee_id', employeeId)
        .gte('schedule_date', startStr).lte('schedule_date', endStr);
      return (data || []) as Schedule[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel('emp-schedule-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_schedules' }, () => {
        qc.invalidateQueries({ queryKey: ['emp-weekly-schedule'] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const goCurrentWeek = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));

  const schedulesByDate = (dateStr: string) =>
    schedules.filter(s => s.schedule_date === dateStr);

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" className="h-10 w-10 p-0" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <span className="text-lg">‹</span>
        </Button>
        <div className="flex-1 text-center">
          <span className="font-body text-xs text-accent">
            {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}
          </span>
        </div>
        <Button size="sm" variant="outline" className="h-10 w-10 p-0" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <span className="text-lg">›</span>
        </Button>
      </div>
      <Button size="sm" variant="outline" className="w-full font-display text-xs h-10" onClick={goCurrentWeek}>
        Current Week
      </Button>

      {/* 7 stacked day cards */}
      {weekDates.map(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        const dayShifts = schedulesByDate(dateStr);
        const today = isToday(d);
        return (
          <Card key={dateStr} className={`border-border ${today ? 'border-accent/50 bg-accent/5' : 'bg-card'}`}>
            <CardContent className="p-3 space-y-2">
              <div className={`font-display text-sm tracking-wider ${today ? 'text-accent' : 'text-foreground'}`}>
                {format(d, 'EEE, MMM d')}
                {today && <span className="ml-2 font-body text-[10px] text-accent">(Today)</span>}
              </div>
              {dayShifts.length === 0 && (
                <p className="font-body text-xs text-muted-foreground py-1">Off</p>
              )}
              {dayShifts.map(s => (
                <div key={s.id} className="flex items-center gap-2 bg-secondary rounded-md p-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-body text-sm text-foreground">
                    {fmtTime(s.time_in)} – {fmtTime(s.time_out)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default EmployeeScheduleView;
