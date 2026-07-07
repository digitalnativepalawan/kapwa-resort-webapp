import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Home, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { LuxuryCard } from '@/components/luxury';

interface OrderItem {
  name: string;
  qty: number;
  price: number;
  department?: string;
}

interface RoomCharge {
  room_id: string;
  room_name: string;
  guest_name: string;
  orders: any[];
  items: OrderItem[];
  total: number;
  oldestCreatedAt: string;
}

const PendingCharges = () => {
  const { data: pendingCharges = [], isLoading, refetch } = useQuery({
    queryKey: ['reception-pending-charges'],
    queryFn: async () => {
      // Get orders ready for billing
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('ready_for_billing', true)
        .order('created_at', { ascending: false });

      if (!orders || orders.length === 0) return [];

      // Group by room_id
      const groupedByRoom = new Map<string, RoomCharge>();

      for (const order of orders) {
        if (!order.room_id) continue;

        // Get room name
        const { data: room } = await supabase
          .from('resort_ops_units')
          .select('name')
          .eq('id', order.room_id)
          .single();

        const roomName = room?.name || 'Unknown Room';
        const items = (order.items as unknown as OrderItem[]) || [];

        if (groupedByRoom.has(order.room_id)) {
          const existing = groupedByRoom.get(order.room_id)!;
          existing.items.push(...items);
          existing.total += order.total;
          existing.orders.push(order);
          if (order.created_at < existing.oldestCreatedAt) {
            existing.oldestCreatedAt = order.created_at;
          }
        } else {
          groupedByRoom.set(order.room_id, {
            room_id: order.room_id,
            room_name: roomName,
            guest_name: order.guest_name || 'Guest',
            items: [...items],
            total: order.total,
            orders: [order],
            oldestCreatedAt: order.created_at,
          });
        }
      }

      return Array.from(groupedByRoom.values());
    },
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="p-4 text-center font-body text-sm text-muted-foreground">
        Loading pending charges...
      </div>
    );
  }

  if (pendingCharges.length === 0) {
    return (
      <LuxuryCard className="p-6 text-center">
        <p className="font-body text-sm text-muted-foreground">No pending room charges</p>
      </LuxuryCard>
    );
  }

  return (
    <LuxuryCard className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-body text-[10px] tracking-[0.28em] uppercase text-gold/80">Folio</p>
          <h3 className="font-serif-display text-lg text-foreground leading-tight">
            Pending Room Charges
          </h3>
          <p className="font-body text-xs text-muted-foreground mt-0.5">
            {pendingCharges.length} unit{pendingCharges.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="font-display text-[10px] tracking-[0.2em] uppercase text-muted-foreground hover:text-gold transition-colors"
        >
          Refresh
        </button>
      </div>

      {pendingCharges.map((room) => {
        const elapsed = formatDistanceToNow(new Date(room.oldestCreatedAt), { addSuffix: true });

        return (
          <LuxuryCard key={room.room_id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Home className="w-4 h-4 text-gold shrink-0" />
                  <p className="font-serif-display text-base text-foreground truncate">
                    {room.room_name}
                  </p>
                </div>
                <p className="font-body text-xs text-muted-foreground truncate">{room.guest_name}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge className="bg-gold/15 text-gold border border-gold/30 font-display text-[10px] tracking-widest uppercase">
                  Pending
                </Badge>
                <div className="flex items-center gap-1 font-body text-[10px] text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{elapsed}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              {room.items.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex justify-between font-body text-sm">
                  <span className="text-foreground">{item.qty}× {item.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    ₱{(item.price * item.qty).toLocaleString()}
                  </span>
                </div>
              ))}
              {room.items.length > 5 && (
                <p className="font-body text-xs text-muted-foreground">
                  +{room.items.length - 5} more items
                </p>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-border/40">
              <span className="font-body text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
                Total
              </span>
              <span className="font-serif-display text-xl text-gold tabular-nums">
                ₱{room.total.toLocaleString()}
              </span>
            </div>
          </LuxuryCard>
        );
      })}
    </LuxuryCard>
  );
};

export default PendingCharges;
