import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle, Clock, ClipboardCheck, BarChart3, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth } from 'date-fns';
import HousekeepingInspection from '@/components/admin/HousekeepingInspection';
import { getStaffSession } from '@/lib/session';
import { hasAccess, canEdit } from '@/lib/permissions';

const from = (table: string) => supabase.from(table as any);

const HousekeeperPage = ({ embedded = false }: { embedded?: boolean }) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);

  // Unlock AudioContext on first interaction (mobile)
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
    osc.frequency.setValueAtTime(520, now);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.4);
  }, []);

  // Realtime subscription for new housekeeping orders — play chime on INSERT
  useEffect(() => {
    const channel = supabase
      .channel('housekeeping-orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'housekeeping_orders' }, () => {
        playChime();
        qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'housekeeping_orders' }, () => {
        playChime();
        qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [playChime, qc]);

  const empId = localStorage.getItem('emp_id');
  const empName = localStorage.getItem('emp_name') || 'Housekeeper';

  // Determine if this user is a manager (admin/reception/assistantGM) who can see all orders
  const session = getStaffSession();
  const perms: string[] = session?.permissions || [];
  const isManager = perms.includes('admin')
    || canEdit(perms, 'reception')
    || hasAccess(perms, 'rooms') && canEdit(perms, 'housekeeping');

  const { data: allOrders = [] } = useQuery({
    queryKey: ['housekeeping-orders-all'],
    queryFn: async () => {
      const { data } = await from('housekeeping_orders').select('*').order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 5000,
  });

  // Derive latest order per unit
  const latestByUnit = new Map<string, any>();
  allOrders.filter((o: any) => o.status !== 'completed' && o.status !== 'inspection_cleared').forEach((o: any) => {
    if (!latestByUnit.has(o.unit_name)) latestByUnit.set(o.unit_name, o);
  });

  // Separate: assigned to me vs unassigned pending
  const allActive = Array.from(latestByUnit.values());
  // Pre-inspection tasks visible to ALL housekeepers (broadcast accept without PIN)
  const pendingPreInspection = allActive.filter((o: any) => !o.accepted_by && o.status === 'pre_inspection');
  // Other pending tasks (cleaning assignments) — managers only
  const pendingOther = allActive.filter((o: any) => !o.accepted_by && o.status === 'pending_inspection');
  const pendingOrders = isManager ? [...pendingPreInspection, ...pendingOther] : pendingPreInspection;
  // In-progress: my accepted pre-inspections + my cleaning tasks (cleaning only appears after checkout)
  const myInProgress = allActive.filter((o: any) => o.accepted_by === empId && (o.status === 'cleaning' || o.status === 'pending_inspection'));

  // Sort: urgent first, then assigned-to-me first
  const sortOrders = (orders: any[]) => orders.sort((a, b) => {
    const aPri = a.priority === 'urgent' ? 0 : a.priority === 'high' ? 1 : 2;
    const bPri = b.priority === 'urgent' ? 0 : b.priority === 'high' ? 1 : 2;
    if (aPri !== bPri) return aPri - bPri;
    const aAssigned = a.assigned_to === empId ? 0 : 1;
    const bAssigned = b.assigned_to === empId ? 0 : 1;
    return aAssigned - bAssigned;
  });

  const today = new Date().toISOString().split('T')[0];
  const myCompletedToday = allOrders.filter((o: any) =>
    o.accepted_by === empId && o.status === 'completed' && o.cleaning_completed_at?.startsWith(today)
  );

  useEffect(() => {
    if (activeOrder) {
      const fresh = allOrders.find((o: any) => o.id === activeOrder.id);
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(activeOrder)) {
        setActiveOrder(fresh);
      }
    }
  }, [allOrders, activeOrder]);

  const monthStart = startOfMonth(new Date()).toISOString();
  const myCompletedMonth = allOrders.filter((o: any) =>
    o.accepted_by === empId && o.status === 'completed' && o.cleaning_completed_at >= monthStart
  );
  const avgTime = myCompletedMonth.length > 0
    ? Math.round(myCompletedMonth.reduce((sum: number, o: any) => sum + (o.time_to_complete_minutes || 0), 0) / myCompletedMonth.length)
    : 0;

  // Direct accept (no PIN) for pre_inspection tasks
  const handleDirectAccept = async (orderId: string) => {
    const myId = localStorage.getItem('emp_id');
    const myName = localStorage.getItem('emp_name') || 'Housekeeper';
    const myDisplay = localStorage.getItem('emp_display_name') || myName;
    if (!myId) {
      toast.error('Please log in first');
      return;
    }
    try {
      const { data: current } = await from('housekeeping_orders')
        .select('accepted_by, accepted_by_name')
        .eq('id', orderId)
        .single() as any;
      if (current?.accepted_by) {
        toast.error(`Already assigned to ${current.accepted_by_name || 'someone else'}`);
        qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
        return;
      }
      await from('housekeeping_orders').update({
        accepted_by: myId,
        accepted_by_name: myDisplay,
        accepted_at: new Date().toISOString(),
        status: 'pending_inspection',
      } as any).eq('id', orderId);
      qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      toast.success(`Accepted — ${myDisplay}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept');
    }
  };

  const priorityColor = (p: string) => {
    if (p === 'urgent') return 'bg-destructive text-destructive-foreground';
    if (p === 'high') return 'bg-amber-600 text-white';
    return 'bg-muted text-muted-foreground';
  };

  if (activeOrder) {
    const hkMode = activeOrder.status === 'pre_inspection' ? 'pre_inspection' : 'cleaning';
    return (
      <HousekeepingInspection
        order={activeOrder}
        mode={hkMode}
        onClose={() => {
          setActiveOrder(null);
          qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
        }}
      />
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'min-h-screen bg-background p-4 max-w-lg mx-auto'}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-display text-xl tracking-wider text-foreground">🏨 Housekeeping</h1>
            <p className="font-body text-xs text-muted-foreground">Welcome, {empName}</p>
          </div>
        </div>
      )}

      {/* Assignments — pre-inspection visible to all, others to managers */}
      <section className="mb-6">
        <h2 className="font-display text-sm tracking-wider text-muted-foreground uppercase mb-3 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" /> Assignments ({pendingOrders.length})
        </h2>
        {pendingOrders.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">No pending assignments</p>
        ) : (
          <div className="space-y-2">
            {sortOrders(pendingOrders).map((order: any) => {
              const isAssignedToMe = order.assigned_to === empId;
              return (
                <div key={order.id} className={`border rounded-lg p-4 bg-card ${
                  order.priority === 'urgent' ? 'border-destructive/60 bg-destructive/5' :
                  isAssignedToMe ? 'border-primary/50 bg-primary/5' : 'border-border'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base tracking-wider text-foreground">{order.unit_name}</span>
                      {isAssignedToMe && (
                        <Badge className="bg-primary/20 text-primary border-primary/40 font-body text-[10px]">
                          <UserCheck className="w-3 h-3 mr-0.5" /> Assigned to you
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {order.status === 'pre_inspection' && (
                        <Badge className="bg-blue-600 text-white font-body text-[10px]">🔍 Pre-Checkout</Badge>
                      )}
                      <Badge className={priorityColor(order.priority || 'normal')} variant="secondary">
                        {order.priority || 'normal'}
                      </Badge>
                    </div>
                  </div>
                  <p className="font-body text-xs text-muted-foreground mb-3">
                    Created: {format(new Date(order.created_at), 'h:mm a')}
                  </p>
                  <Button
                    onClick={() => handleDirectAccept(order.id)}
                    className={`w-full font-display tracking-wider text-sm min-h-[52px] ${
                      isAssignedToMe ? 'bg-primary hover:bg-primary/90 animate-pulse' : ''
                    }`}
                    size="lg"
                  >
                    {order.status === 'pre_inspection' ? '✋ Accept Inspection' : '✋ Accept Assignment'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* In Progress */}
      <section className="mb-6">
        <h2 className="font-display text-sm tracking-wider text-muted-foreground uppercase mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" /> In Progress ({myInProgress.length})
        </h2>
        {myInProgress.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">No rooms in progress</p>
        ) : (
          <div className="space-y-2">
            {myInProgress.map((order: any) => (
              <div key={order.id} className="border border-primary/40 rounded-lg p-4 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display text-base tracking-wider text-foreground">{order.unit_name}</span>
                  <Badge variant="outline" className="font-body text-xs">
                    {order.status === 'cleaning' ? '🧹 Cleaning' : order.status === 'pre_inspection' ? '🔍 Pre-Checkout' : '🔍 Inspection'}
                  </Badge>
                </div>
                {order.accepted_at && (
                  <p className="font-body text-xs text-muted-foreground mb-3">
                    Accepted: {format(new Date(order.accepted_at), 'h:mm a')}
                  </p>
                )}
                <Button
                  onClick={() => setActiveOrder(order)}
                  className="w-full font-display tracking-wider text-sm min-h-[52px]"
                  size="lg"
                >
                  Continue →
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Completed Today */}
      <section className="mb-6">
        <h2 className="font-display text-sm tracking-wider text-muted-foreground uppercase mb-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> Completed Today ({myCompletedToday.length})
        </h2>
        {myCompletedToday.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">No rooms completed today</p>
        ) : (
          <div className="space-y-1">
            {myCompletedToday.map((order: any) => (
              <div key={order.id} className="flex items-center gap-3 p-2 border border-border rounded bg-card">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="font-body text-sm text-foreground flex-1">{order.unit_name}</span>
                <span className="font-body text-xs text-muted-foreground">
                  {order.cleaning_completed_at && format(new Date(order.cleaning_completed_at), 'h:mm a')}
                </span>
                {order.time_to_complete_minutes && (
                  <span className="font-body text-xs text-muted-foreground">{order.time_to_complete_minutes}min</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My Stats */}
      <section>
        <h2 className="font-display text-sm tracking-wider text-muted-foreground uppercase mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> My Stats
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-border rounded-lg p-4 bg-card text-center">
            <p className="font-display text-2xl text-foreground">{myCompletedMonth.length}</p>
            <p className="font-body text-xs text-muted-foreground">Rooms this month</p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card text-center">
            <p className="font-display text-2xl text-foreground">{avgTime || '—'}</p>
            <p className="font-body text-xs text-muted-foreground">Avg min/room</p>
          </div>
        </div>
      </section>

    </div>
  );
};

export default HousekeeperPage;
