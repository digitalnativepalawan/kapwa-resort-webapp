import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { deductInventoryForOrder } from '@/lib/inventoryDeduction';
import { getStaffSession } from '@/lib/session';
import { toast } from 'sonner';
import { useResortProfile } from '@/hooks/useResortProfile';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ServiceOrderCard from './ServiceOrderCard';
import ServiceOrderDetail from './ServiceOrderDetail';

const KANBAN_COLS_DEFAULT = ['New', 'Preparing', 'Ready'] as const;
const KANBAN_COLS_RECEPTION = ['New', 'Preparing', 'Ready'] as const;

const COL_COLORS: Record<string, string> = {
  New: 'border-t-gold',
  Preparing: 'border-t-orange-400',
  Ready: 'border-t-emerald-400',
  'Bill Out': 'border-t-amber-400',
};

interface ServiceBoardProps {
  department: 'kitchen' | 'bar' | 'reception' | 'cashier';
}

const ServiceBoard = ({ department }: ServiceBoardProps) => {
  const qc = useQueryClient();
  const { data: resortProfile } = useResortProfile();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);

  // Read staff permissions from session
  const permissions = useMemo(() => {
    const s = getStaffSession();
    return s?.permissions || ['admin'];
  }, []);

  // Audio unlock
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    };
    document.addEventListener('touchstart', unlock, { once: true });
    document.addEventListener('click', unlock, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
    };
  }, []);

  const playChime = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(department === 'bar' ? 660 : department === 'reception' ? 784 : 880, now);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.4);
  }, [department]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`service-board-${department}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['service-orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, department]);

  // Auto-refresh every 5s
  const { data: orders = [] } = useQuery({
    queryKey: ['service-orders'],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['New', 'Preparing', 'Ready', 'Served', 'Paid'])
        .gte('created_at', start.toISOString())
        .order('created_at', { ascending: true })
        .limit(300);
      return data || [];
    },
    refetchInterval: 5000,
  });

  // Filter for department relevance
  const relevantOrders = useMemo(() => {
    if (department === 'reception' || department === 'cashier') return orders;
    return orders.filter(o => {
      const items = (o.items as any[]) || [];
      return items.some(i => {
        const d = (i as any).department || 'kitchen';
        return d === department || d === 'both';
      });
    });
  }, [orders, department]);

  // Bucket into columns
  const columns = useMemo(() => {
    const cols: Record<string, any[]> = { New: [], Preparing: [], Ready: [], 'Bill Out': [], Completed: [] };

    if (department === 'kitchen' || department === 'bar') {
      const field = department === 'kitchen' ? 'kitchen_status' : 'bar_status';
      relevantOrders.forEach(o => {
        const deptStatus = o[field] as string;
        // Once dept is done (ready) or order is served/paid → skip (not shown)
        if (o.status === 'Paid' || o.status === 'Served') {
          // Skip completed orders entirely
          return;
        } else if (deptStatus === 'ready') {
          // Dept finished — skip, don't show
          return;
        } else if (deptStatus === 'pending' && (o.status === 'New' || o.status === 'Preparing')) {
          cols.New.push(o);
        } else if (deptStatus === 'preparing') {
          cols.Preparing.push(o);
        }
      });
    } else {
      // Reception/Cashier view
      relevantOrders.forEach(o => {
        if (o.status === 'New') cols.New.push(o);
        else if (o.status === 'Preparing') cols.Preparing.push(o);
        else if (o.status === 'Ready') cols.Ready.push(o);
        else if (o.status === 'Paid' || o.status === 'Served') {
          // Skip completed orders entirely
          return;
        }
      });
    }
    return cols;
  }, [relevantOrders, department]);

  const hasNew = columns.New.length > 0;

  // Chime only once when new orders appear (not repeatedly)
  const prevHasNewRef = useRef(false);
  useEffect(() => {
    if (hasNew && !prevHasNewRef.current) {
      playChime();
    }
    prevHasNewRef.current = hasNew;
  }, [hasNew, playChime]);

  const handleAction = async (orderId: string, action: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const updateData: any = {};

    if (action === 'kitchen-start') {
      updateData.kitchen_status = 'preparing';
      if (order.status === 'New') updateData.status = 'Preparing';
      const items = ((order.items as any[]) || []).filter((i: any) => {
        const d = i.department || 'kitchen';
        return d === 'kitchen' || d === 'both';
      });
      if (items.length > 0) await deductInventoryForOrder(orderId, items, 'kitchen');
    } else if (action === 'kitchen-ready') {
      updateData.kitchen_status = 'ready';
      const barItems = ((order.items as any[]) || []).some((i: any) => i.department === 'bar' || i.department === 'both');
      if (!barItems || order.bar_status === 'ready') {
        updateData.status = 'Ready';
      }
    } else if (action === 'bar-start') {
      updateData.bar_status = 'preparing';
      if (order.status === 'New') updateData.status = 'Preparing';
      const items = ((order.items as any[]) || []).filter((i: any) => {
        const d = i.department || 'kitchen';
        return d === 'bar' || d === 'both';
      });
      if (items.length > 0) await deductInventoryForOrder(orderId, items, 'bar');
    } else if (action === 'bar-ready') {
      updateData.bar_status = 'ready';
      const kitchenItems = ((order.items as any[]) || []).some((i: any) => {
        const d = i.department || 'kitchen';
        return d === 'kitchen' || d === 'both';
      });
      if (!kitchenItems || order.kitchen_status === 'ready') {
        updateData.status = 'Ready';
      }
    } else if (action === 'mark-served') {
      updateData.status = 'Served';
    }

    // Telegram notification when order becomes Ready
    if (updateData.status === 'Ready') {
      import('@/lib/telegram').then(({ notifyTelegram }) => {
        const items = ((order.items as any[]) || []).map((i: any) => i.name || i.item_name).join(', ');
        notifyTelegram('reception,managers,waitstaff', `✅ Order Ready\n${order.guest_name || 'Guest'} - ${items} is ready for delivery`);
      });
    }

    if (action === 'mark-paid') {
      updateData.status = 'Paid';
      updateData.closed_at = new Date().toISOString();
    }

    await supabase.from('orders').update(updateData).eq('id', orderId);
    qc.invalidateQueries({ queryKey: ['service-orders'] });
    toast.success('Order updated');
  };

  const totalActive = columns.New.length + columns.Preparing.length + columns.Ready.length + columns['Bill Out'].length;
  const KANBAN_COLS = department === 'reception' ? KANBAN_COLS_RECEPTION : KANBAN_COLS_DEFAULT;

  return (
    <div className="h-full flex flex-col">
      {/* Summary strip */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-card/50 flex-shrink-0">
        <span className="font-display text-sm text-foreground tracking-wider">
          {totalActive} Active
        </span>
        {columns.New.length > 0 && (
          <span className="font-body text-xs text-gold font-bold blink-dot">
            {columns.New.length} NEW
          </span>
        )}
        {columns.Ready.length > 0 && (
          <span className="font-body text-xs text-emerald-400 font-bold">
            {columns.Ready.length} READY
          </span>
        )}
        {columns['Bill Out'].length > 0 && (
          <span className="font-body text-xs text-amber-400 font-bold">
            {columns['Bill Out'].length} BILL OUT
          </span>
        )}
      </div>

      {/* Kanban columns — horizontal on tablet, vertical on phone */}
      <div className="flex-1 overflow-auto">
        {/* Tablet/Desktop: horizontal kanban */}
        <div className="hidden md:grid gap-3 p-4 md:grid-cols-3">
          {KANBAN_COLS.map(col => (
            <div key={col} className={`flex flex-col border-t-4 ${COL_COLORS[col]} rounded-t-lg bg-secondary/30`}>
              <div className="px-3 py-2 flex items-center justify-between">
                <h3 className="font-display text-sm tracking-wider text-foreground">{col}</h3>
                <span className="font-body text-xs text-muted-foreground font-bold bg-muted rounded-full w-6 h-6 flex items-center justify-center">
                  {columns[col].length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 max-h-[60vh]">
                {columns[col].map(order => (
                    <ServiceOrderCard
                    key={order.id}
                    order={order}
                    department={department}
                    permissions={permissions}
                    onAction={handleAction}
                    onOpenDetail={setDetailOrder}
                    resortProfile={resortProfile}
                    compact
                  />
                ))}
                {columns[col].length === 0 && (
                  <p className="font-body text-xs text-muted-foreground text-center py-8">No orders</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile: tabbed view */}
        <MobileTabView columns={columns} department={department} permissions={permissions} onAction={handleAction} onOpenDetail={setDetailOrder} resortProfile={resortProfile} />
      </div>

      {/* Detail drawer */}
      <ServiceOrderDetail
        order={detailOrder}
        open={!!detailOrder}
        onOpenChange={(open) => { if (!open) setDetailOrder(null); }}
        permissions={permissions}
        department={department}
        onAction={handleAction}
        resortProfile={resortProfile}
      />
    </div>
  );
};

/** Mobile tab-based view for phones */
const MobileTabView = ({ columns, department, permissions, onAction, onOpenDetail, resortProfile }: {
  columns: Record<string, any[]>;
  department: 'kitchen' | 'bar' | 'reception' | 'cashier';
  permissions: string[];
  onAction: (orderId: string, action: string) => Promise<void>;
  onOpenDetail: (order: any) => void;
  resortProfile?: any;
}) => {
  const [tab, setTab] = useState<string>('New');

  const MOBILE_TABS = ['New', 'Preparing', 'Ready'] as const;

  return (
    <div className="md:hidden flex flex-col h-full">
      <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-hide flex-shrink-0">
        {MOBILE_TABS.map(col => (
          <button
            key={col}
            onClick={() => setTab(col)}
            className={`font-display text-xs tracking-wider px-4 min-h-[48px] rounded-lg flex items-center gap-2 whitespace-nowrap transition-colors ${
              tab === col
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground border border-border'
            } ${col === 'New' && columns.New.length > 0 && tab !== col ? 'tab-pulse' : ''}`}
          >
            {col}
            {columns[col].length > 0 && (
              <span className={`text-[11px] font-body font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                tab === col ? 'bg-foreground/20 text-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {columns[col].length}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
        {columns[tab]?.length === 0 && (
          <p className="font-body text-sm text-muted-foreground text-center py-12">No {tab.toLowerCase()} orders</p>
        )}
        {columns[tab]?.map(order => (
          <ServiceOrderCard
            key={order.id}
            order={order}
            department={department}
            permissions={permissions}
            onAction={onAction}
            onOpenDetail={onOpenDetail}
            resortProfile={resortProfile}
          />
        ))}
      </div>
    </div>
  );
};

export default ServiceBoard;
