import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useMemo } from 'react';
import { Users, Clock, MapPin, CalendarDays, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, isToday, isBefore, startOfDay } from 'date-fns';
import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
  cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
};

type DateFilter = 'all' | 'today' | 'upcoming';
type StatusFilter = 'all' | 'confirmed' | 'pending' | 'completed' | 'cancelled';

const ToursBoard = () => {
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const qc = useQueryClient();

  const { data: tours = [], isLoading } = useQuery({
    queryKey: ['tours-board'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tour_bookings')
        .select('*')
        .order('tour_date', { ascending: true })
        .order('pickup_time', { ascending: true })
        .limit(200);
      return data || [];
    },
    refetchInterval: 15000,
  });

  const cancelTour = async (id: string) => {
    await (supabase.from('tour_bookings') as any).update({ status: 'cancelled' }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['tours-board'] });
    toast.success('Tour cancelled');
  };

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    return tours.filter((t: any) => {
      const d = new Date(t.tour_date);
      if (dateFilter === 'today' && !isToday(d)) return false;
      if (dateFilter === 'upcoming' && isBefore(d, today)) return false;
      // In default view, only show confirmed & pending
      if (statusFilter === 'all' && (t.status === 'cancelled' || t.status === 'completed')) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      return true;
    });
  }, [tours, dateFilter, statusFilter]);

  const Pill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-display tracking-wider transition-all ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <Pill label="Today" active={dateFilter === 'today'} onClick={() => setDateFilter('today')} />
          <Pill label="Upcoming" active={dateFilter === 'upcoming'} onClick={() => setDateFilter('upcoming')} />
          <Pill label="All Dates" active={dateFilter === 'all'} onClick={() => setDateFilter('all')} />
          <div className="w-px bg-border mx-1" />
          <Pill label="All Status" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          <Pill label="Confirmed" active={statusFilter === 'confirmed'} onClick={() => setStatusFilter('confirmed')} />
          <Pill label="Pending" active={statusFilter === 'pending'} onClick={() => setStatusFilter('pending')} />
          <Pill label="Completed" active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} />
          <Pill label="Cancelled" active={statusFilter === 'cancelled'} onClick={() => setStatusFilter('cancelled')} />
        </div>
      </div>

      {isLoading && <p className="text-center text-muted-foreground text-sm py-8">Loading tours…</p>}

      {!isLoading && filtered.length === 0 && (
        <p className="text-center text-muted-foreground text-sm py-12">No tour bookings found</p>
      )}

      {/* Tour Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((tour: any) => {
          const statusClass = STATUS_COLORS[tour.status] || STATUS_COLORS.pending;
          const canCancel = tour.status !== 'cancelled' && tour.status !== 'completed';
          return (
            <div
              key={tour.id}
              className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-4 space-y-3"
            >
              {/* Header: guest + status */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-sm text-foreground truncate">{tour.guest_name || 'Unknown Guest'}</p>
                </div>
                <Badge className={`shrink-0 text-[10px] uppercase tracking-wider border ${statusClass}`}>
                  {tour.status}
                </Badge>
              </div>

              {/* Tour name */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="font-body text-xs truncate">{tour.tour_name || '—'}</span>
              </div>

              {/* Date + time */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {tour.tour_date ? format(new Date(tour.tour_date), 'MMM d') : '—'}
                </span>
                {tour.pickup_time && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {tour.pickup_time}
                  </span>
                )}
              </div>

              {/* Pax */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                <span>{tour.pax} pax</span>
              </div>

              {/* Notes */}
              {tour.notes && (
                <p className="text-xs text-muted-foreground/80 italic line-clamp-2">{tour.notes}</p>
              )}

              {/* Cancel button */}
              {canCancel && (
                <Button size="sm" variant="destructive" className="font-display text-xs tracking-wider w-full min-h-[36px]"
                  onClick={() => cancelTour(tour.id)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancel
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ToursBoard;
