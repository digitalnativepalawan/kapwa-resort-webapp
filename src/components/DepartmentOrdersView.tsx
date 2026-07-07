import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChefHat, Truck, AlertTriangle, Clock, Zap, Timer } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Home, LogOut } from 'lucide-react';
import { deductInventoryForOrder } from '@/lib/inventoryDeduction';
import { canEdit, canManage } from '@/lib/permissions';
import { getStaffSession, clearStaffSession } from '@/lib/session';

interface DepartmentOrdersViewProps {
  department: 'kitchen' | 'bar';
  embedded?: boolean;
}

type DeptStatus = 'pending' | 'preparing' | 'ready';

const DEPT_STATUS_LABELS: Record<DeptStatus, string> = {
  pending: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
};

const DEPT_STATUS_COLORS: Record<DeptStatus, string> = {
  pending: 'bg-gold/20 text-gold border-gold/40',
  preparing: 'bg-orange-500/20 text-orange-400 border-orange-400/40',
  ready: 'bg-emerald-500/20 text-emerald-400 border-emerald-400/40',
};

const DEPT_TABS: DeptStatus[] = ['pending', 'preparing', 'ready'];

const PREP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes before scheduled time

// Helper: is order scheduled for the future (outside prep window)?
const isScheduledFuture = (order: any, now: Date): boolean => {
  if (!order.scheduled_for) return false;
  const scheduledTime = new Date(order.scheduled_for).getTime();
  return (scheduledTime - now.getTime()) > PREP_WINDOW_MS;
};

const getPrepTime = (scheduledFor: string): Date => {
  return new Date(new Date(scheduledFor).getTime() - PREP_WINDOW_MS);
};

const formatScheduledTime = (date: Date): string => {
  return format(date, 'h:mm a');
};

const DepartmentOrdersView = ({ department, embedded = false }: DepartmentOrdersViewProps) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeTab, setActiveTab] = useState<DeptStatus>('pending');
  const [now, setNow] = useState(() => new Date());

  // Tick every minute to re-evaluate scheduled orders
  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(new Date()), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Read session permissions for edit access
  const sessionPerms = (() => {
    const s = getStaffSession();
    if (s) return { isAdmin: s.isAdmin || false, permissions: s.permissions || [] as string[] };
    return { isAdmin: false, permissions: [] as string[] };
  })();
  const canAct = sessionPerms.isAdmin || canEdit(sessionPerms.permissions, department) || canManage(sessionPerms.permissions, 'orders');

  const statusField = department === 'kitchen' ? 'kitchen_status' : 'bar_status';
  const otherStatusField = department === 'kitchen' ? 'bar_status' : 'kitchen_status';

  // Unlock AudioContext
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
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(department === 'bar' ? 660 : 880, t);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 0.4);
  }, [department]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`${department}-orders-realtime`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: [`orders-${department}`] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, department]);

  const { data: allOrders = [] } = useQuery({
    queryKey: [`orders-${department}`],
    queryFn: async () => {
      // Fetch recent orders regardless of date (limited to 200)
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['New', 'Preparing', 'Served'])
        .order('created_at', { ascending: false })
        .limit(200);
      console.log(`[${department}] Fetched ${data?.length || 0} orders raw`);
      return data || [];
    },
  });

  // Filter orders that have items for this department
  const orders = useMemo(() => {
    const filtered = allOrders.filter(order => {
      const items = (order.items as any[]) || [];
      const hasDeptItem = items.some(item => {
        const dept = item.department || 'kitchen';
        return dept === department || dept === 'both';
      });
      return hasDeptItem;
    });
    console.log(`[${department}] After dept filter: ${filtered.length} orders (from ${allOrders.length} raw)`);
    return filtered;
  }, [allOrders, department]);

  // Get department-specific status for an order
  const getDeptStatus = (order: any): DeptStatus => {
    const val = order[statusField] as string;
    if (val === 'preparing') return 'preparing';
    if (val === 'ready') return 'ready';
    return 'pending';
  };

  const statusCounts = useMemo(() => {
    const counts: Record<DeptStatus, number> = { pending: 0, preparing: 0, ready: 0 };
    orders.forEach(o => { counts[getDeptStatus(o)]++; });
    return counts;
  }, [orders, statusField]);

  // Count scheduled vs now for the pending tab badge
  const scheduledPendingCount = useMemo(() => {
    return orders.filter(o => getDeptStatus(o) === 'pending' && isScheduledFuture(o, now)).length;
  }, [orders, statusField, now]);

  const hasNewOrders = statusCounts.pending > 0;

  const prevHasNewRef = useRef(false);
  useEffect(() => {
    if (hasNewOrders && !prevHasNewRef.current) {
      playChime();
    }
    prevHasNewRef.current = hasNewOrders;
  }, [hasNewOrders, playChime]);

  const filtered = useMemo(() => orders.filter(o => getDeptStatus(o) === activeTab), [orders, activeTab, statusField]);

  // Split pending orders into now vs scheduled
  const { nowOrders, scheduledOrders } = useMemo(() => {
    if (activeTab !== 'pending') return { nowOrders: filtered, scheduledOrders: [] };
    const nowList = filtered.filter(o => !isScheduledFuture(o, now));
    const schedList = filtered
      .filter(o => isScheduledFuture(o, now))
      .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());
    return { nowOrders: nowList, scheduledOrders: schedList };
  }, [filtered, activeTab, now]);

  // Check if order has items for the other department
  const hasOtherDeptItems = (order: any): boolean => {
    const items = (order.items as any[]) || [];
    const otherDept = department === 'kitchen' ? 'bar' : 'kitchen';
    return items.some(item => {
      const d = item.department || 'kitchen';
      return d === otherDept || d === 'both';
    });
  };

  const advanceDeptStatus = async (order: any, nextDeptStatus: DeptStatus) => {
    const updateData: any = { [statusField]: nextDeptStatus };

    if (nextDeptStatus === 'ready') {
      const otherStatus = order[otherStatusField] as string;
      const otherHasItems = hasOtherDeptItems(order);
      if (!otherHasItems || otherStatus === 'ready') {
        updateData.status = 'Served';
      }
    }

    if (nextDeptStatus === 'preparing' && order.status === 'New') {
      updateData.status = 'Preparing';
    }

    await supabase.from('orders').update(updateData).eq('id', order.id);

    if (nextDeptStatus === 'preparing') {
      const items = (order.items as any[]) || [];
      const deptItems = items.filter((item: any) => {
        const d = item.department || 'kitchen';
        return d === department || d === 'both';
      });
      if (deptItems.length > 0) {
        await deductInventoryForOrder(order.id, deptItems);
      }
    }

    qc.invalidateQueries({ queryKey: [`orders-${department}`] });
    qc.invalidateQueries({ queryKey: ['orders-admin'] });
    qc.invalidateQueries({ queryKey: ['orders-staff'] });
    qc.invalidateQueries({ queryKey: ['orders-kitchen'] });
    qc.invalidateQueries({ queryKey: ['orders-bar'] });
    toast.success(`${department === 'kitchen' ? 'Kitchen' : 'Bar'} → ${DEPT_STATUS_LABELS[nextDeptStatus]}`);
  };

  const handleLogout = () => {
    clearStaffSession();
    navigate('/');
  };

  const deptLabel = department === 'kitchen' ? '🍳 Kitchen' : '🍹 Bar';

  // Render a single order card
  const renderOrderCard = (order: any, isScheduledCard: boolean) => {
    const allItems = (order.items as any[]) || [];
    const deptItems = allItems.filter(item => {
      const d = item.department || 'kitchen';
      return d === department || d === 'both';
    });
    const otherItems = allItems.filter(item => {
      const d = item.department || 'kitchen';
      return d !== department && d !== 'both';
    });
    const deptStatus = getDeptStatus(order);
    const isPending = deptStatus === 'pending';
    const otherDeptStatus = hasOtherDeptItems(order) ? (order[otherStatusField] as string || 'pending') : null;
    const otherDeptLabel = department === 'kitchen' ? 'Bar' : 'Kitchen';

    const scheduledFor = order.scheduled_for ? new Date(order.scheduled_for) : null;
    const prepTime = order.scheduled_for ? getPrepTime(order.scheduled_for) : null;

    return (
      <div key={order.id} className={`p-4 border rounded-lg transition-all ${
        isScheduledCard
          ? 'border-blue-400/40 bg-blue-500/5'
          : isPending
            ? 'border-gold new-order-card bg-gold/10'
            : 'border-border bg-card/50'
      }`}>
        {/* Scheduled order: detailed time badge */}
        {isScheduledCard && scheduledFor && prepTime && (
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center gap-2 bg-blue-500/20 rounded px-3 py-2 border border-blue-400/40">
              <Clock className="w-4 h-4 text-blue-400 shrink-0" />
              <div className="flex-1">
                <span className="font-display text-sm text-blue-400 tracking-wider font-bold">
                  🕒 {formatScheduledTime(scheduledFor)}
                </span>
                <span className="font-body text-xs text-blue-400/70 ml-2">
                  · {formatDistanceToNow(scheduledFor, { addSuffix: true })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-amber-500/10 rounded px-3 py-1.5 border border-amber-400/30">
              <Timer className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-body text-xs text-amber-400">
                ⏰ Prepare at {formatScheduledTime(prepTime)} · {formatDistanceToNow(prepTime, { addSuffix: true })}
              </span>
            </div>
          </div>
        )}

        {/* Non-scheduled pending: "New Order" banner */}
        {!isScheduledCard && isPending && (
          <div className="flex items-center gap-2 mb-3 bg-gold/20 rounded px-3 py-1.5 border border-gold/40">
            <AlertTriangle className="w-4 h-4 text-gold blink-dot" />
            <span className="font-display text-sm text-gold tracking-widest font-bold uppercase">New Order</span>
          </div>
        )}

        {/* Non-scheduled but has scheduled_for that's within prep window — show serve time inline */}
        {!isScheduledCard && order.scheduled_for && (
          <div className="flex items-center gap-2 mb-3 bg-blue-500/20 rounded px-3 py-1.5 border border-blue-400/40">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="font-display text-sm text-blue-400 tracking-widest font-bold uppercase">
              Serve at {formatScheduledTime(new Date(order.scheduled_for))}
            </span>
          </div>
        )}

        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="font-display text-sm text-foreground tracking-wider">
              {order.order_type} — {order.location_detail}
            </p>
            {order.guest_name && (
              <p className="font-body text-xs text-foreground/70 mt-0.5">{order.guest_name}</p>
            )}
            <p className="font-body text-xs text-cream-dim mt-0.5">
              Ordered {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={`font-body text-xs ${DEPT_STATUS_COLORS[deptStatus]}`}>
              {DEPT_STATUS_LABELS[deptStatus]}
            </Badge>
            {otherDeptStatus && (
              <Badge variant="outline" className="font-body text-[10px] bg-muted/50 text-muted-foreground border-border">
                {otherDeptLabel}: {otherDeptStatus}
              </Badge>
            )}
          </div>
        </div>

        {/* Department items — highlighted */}
        <div className="space-y-1 mb-2">
          {deptItems.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between font-body text-sm">
              <span className="text-foreground font-semibold">{item.qty}× {item.name}</span>
              <span className="text-cream-dim">₱{(item.price * item.qty).toFixed(0)}</span>
            </div>
          ))}
        </div>

        {/* Other department items — dimmed */}
        {otherItems.length > 0 && (
          <div className="space-y-0.5 mb-3 opacity-40">
            {otherItems.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between font-body text-xs">
                <span className="text-cream-dim">{item.qty}× {item.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action */}
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <span className="font-display text-sm text-gold">₱{order.total.toLocaleString()}</span>
          {canAct && deptStatus === 'pending' && !isScheduledCard && (
            <Button
              onClick={() => advanceDeptStatus(order, 'preparing')}
              className="font-body text-xs gap-1.5 bg-gold text-primary-foreground hover:bg-gold/90 font-bold"
            >
              <ChefHat className="w-4 h-4" /> Start Preparing
            </Button>
          )}
          {canAct && deptStatus === 'pending' && isScheduledCard && prepTime && (
            <span className="font-body text-xs text-muted-foreground italic">
              Not yet — prep at {formatScheduledTime(prepTime)}
            </span>
          )}
          {canAct && deptStatus === 'preparing' && (
            <Button
              onClick={() => advanceDeptStatus(order, 'ready')}
              variant="outline"
              className="font-body text-xs gap-1.5"
            >
              <Truck className="w-4 h-4" /> Mark Ready
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={embedded ? 'flex flex-col' : 'min-h-screen bg-navy-texture flex flex-col'}>
      {!embedded && (
        <header className="sticky top-0 z-30 bg-navy-deep/95 backdrop-blur-sm border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="text-cream-dim hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
              <Home className="w-5 h-5" />
            </button>
            <h1 className="font-display text-lg tracking-[0.15em] text-foreground">{deptLabel}</h1>
            <button onClick={handleLogout} className="text-cream-dim hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 px-4 py-3">
        {DEPT_TABS.map(s => (
          <button
            key={s}
            onClick={() => setActiveTab(s)}
            className={`font-display text-xs tracking-wider px-3 min-h-[44px] rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === s
                ? DEPT_STATUS_COLORS[s] + ' border'
                : 'bg-secondary text-cream-dim border border-border'
            } ${s === 'pending' && hasNewOrders && activeTab !== s ? 'tab-pulse' : ''}`}
          >
            {DEPT_STATUS_LABELS[s]}
            {statusCounts[s] > 0 && (
              <span className={`text-[10px] font-body font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                activeTab === s ? 'bg-foreground/20 text-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {s === 'pending' && scheduledPendingCount > 0
                  ? `${statusCounts[s] - scheduledPendingCount}+${scheduledPendingCount}`
                  : statusCounts[s]
                }
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {filtered.length === 0 && (
          <p className="font-body text-sm text-cream-dim text-center py-12">No {DEPT_STATUS_LABELS[activeTab].toLowerCase()} orders for {department}</p>
        )}

        {/* Pending tab: split into Due Now and Scheduled */}
        {activeTab === 'pending' && filtered.length > 0 && (
          <>
            {/* Due Now section */}
            {nowOrders.length > 0 && (
              <>
                {scheduledOrders.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 pb-1">
                    <Zap className="w-4 h-4 text-gold" />
                    <span className="font-display text-xs tracking-widest text-gold uppercase font-bold">Due Now / ASAP</span>
                    <span className="font-body text-xs text-cream-dim">({nowOrders.length})</span>
                  </div>
                )}
                {nowOrders.map(order => renderOrderCard(order, false))}
              </>
            )}

            {/* Scheduled section */}
            {scheduledOrders.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-3 pb-1">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="font-display text-xs tracking-widest text-blue-400 uppercase font-bold">Scheduled for Later</span>
                  <span className="font-body text-xs text-cream-dim">({scheduledOrders.length})</span>
                </div>
                {scheduledOrders.map(order => renderOrderCard(order, true))}
              </>
            )}

            {/* Only now orders, no section headers needed */}
            {scheduledOrders.length === 0 && nowOrders.length > 0 && nowOrders.map(order => renderOrderCard(order, false))}
          </>
        )}

        {/* Non-pending tabs: render normally */}
        {activeTab !== 'pending' && filtered.map(order => renderOrderCard(order, false))}
      </div>
    </div>
  );
};

export default DepartmentOrdersView;
