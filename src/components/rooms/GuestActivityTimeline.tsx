import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { LogIn, StickyNote, MapPin, DollarSign, UtensilsCrossed, Clock } from 'lucide-react';

interface GuestActivityTimelineProps {
  booking: any;
  unit: any;
}

type TimelineEvent = {
  id: string;
  type: 'checkin' | 'note' | 'tour' | 'billing' | 'order';
  title: string;
  subtitle?: string;
  time: string;
};

const iconMap = {
  checkin: { icon: LogIn, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  note: { icon: StickyNote, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  tour: { icon: MapPin, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
  billing: { icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  order: { icon: UtensilsCrossed, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
};

const from = (t: string) => supabase.from(t as any) as any;

const GuestActivityTimeline = ({ booking, unit }: GuestActivityTimelineProps) => {
  const { data: notes = [] } = useQuery({
    queryKey: ['timeline-notes', booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await from('guest_notes').select('*').eq('booking_id', booking.id).order('created_at');
      return data || [];
    },
  });

  const { data: tours = [] } = useQuery({
    queryKey: ['timeline-tours', booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await from('guest_tours').select('*').eq('booking_id', booking.id).order('created_at');
      return data || [];
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['timeline-transactions', booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await from('room_transactions').select('*').eq('booking_id', booking.id).order('created_at');
      return data || [];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['timeline-orders', unit?.name, booking?.id],
    enabled: !!unit?.name && !!booking,
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*')
        .eq('order_type', 'Room')
        .eq('location_detail', unit.name)
        .gte('created_at', booking.check_in + 'T00:00:00')
        .lte('created_at', booking.check_out + 'T23:59:59')
        .order('created_at');
      return data || [];
    },
  });

  if (!booking) {
    return <p className="font-body text-sm text-muted-foreground text-center py-4">No active booking — timeline unavailable</p>;
  }

  // Build unified events list
  const events: TimelineEvent[] = [];

  // Check-in event
  events.push({
    id: 'checkin',
    type: 'checkin',
    title: 'Guest Checked In',
    subtitle: `${unit.name} · ${booking.platform || 'Direct'}`,
    time: booking.created_at,
  });

  notes.forEach((n: any) => {
    const isImage = n.content?.startsWith('[IMAGE]:');
    events.push({
      id: `note-${n.id}`,
      type: 'note',
      title: `Note Added · ${(n.note_type || 'general').replace('_', ' ')}`,
      subtitle: isImage ? '📷 Photo attached' : n.content?.slice(0, 80),
      time: n.created_at,
    });
  });

  tours.forEach((t: any) => {
    events.push({
      id: `tour-${t.id}`,
      type: 'tour',
      title: `Experience: ${t.tour_name}`,
      subtitle: `${t.pax} pax · ₱${Number(t.price).toLocaleString()} · ${t.status}`,
      time: t.created_at,
    });
  });

  transactions.forEach((tx: any) => {
    const isCharge = tx.total_amount > 0;
    events.push({
      id: `tx-${tx.id}`,
      type: 'billing',
      title: isCharge
        ? `Charge: ₱${tx.total_amount.toLocaleString()}`
        : `Payment: ₱${Math.abs(tx.total_amount).toLocaleString()}`,
      subtitle: tx.notes || tx.transaction_type?.replace('_', ' ') || '',
      time: tx.created_at,
    });
  });

  orders.forEach((o: any) => {
    const itemCount = Array.isArray(o.items) ? o.items.length : 0;
    events.push({
      id: `order-${o.id}`,
      type: 'order',
      title: `Order · ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
      subtitle: `₱${Number(o.total).toFixed(0)} · ${o.status}`,
      time: o.created_at,
    });
  });

  // Sort by time ascending
  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="font-body text-sm text-muted-foreground">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="font-display text-xs tracking-wider text-muted-foreground uppercase mb-3">Guest Activity</p>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-3">
          {events.map((ev) => {
            const cfg = iconMap[ev.type];
            const Icon = cfg.icon;
            return (
              <div key={ev.id} className="flex gap-3 items-start pl-0">
                {/* Icon bubble */}
                <div className={`relative z-10 w-10 h-10 rounded-full border flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0 pt-1 pb-2">
                  <p className="font-body text-sm text-foreground leading-snug">{ev.title}</p>
                  {ev.subtitle && <p className="font-body text-xs text-muted-foreground mt-0.5 truncate">{ev.subtitle}</p>}
                  <p className="font-body text-[10px] text-muted-foreground/60 mt-0.5">
                    {format(new Date(ev.time), 'MMM d · h:mm a')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GuestActivityTimeline;
