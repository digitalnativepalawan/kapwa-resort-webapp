import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import OrderCard from '@/components/admin/OrderCard';
import { useResortProfile } from '@/hooks/useResortProfile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Minus } from 'lucide-react';
import TabInvoice from '@/components/admin/TabInvoice';
import { deductInventoryForOrder } from '@/lib/inventoryDeduction';
import { getStaffSession } from '@/lib/session';
import { canManage, canEdit } from '@/lib/permissions';

const STATUSES = ['New', 'Preparing', 'Ready', 'Served', 'Paid'];

const StaffOrdersView = () => {
  const qc = useQueryClient();
  const { data: resortProfile } = useResortProfile();
  const session = getStaffSession();
  const perms = session?.permissions || [];
  const isAdmin = !!session?.isAdmin;
  const canPipeline = isAdmin || canEdit(perms, 'orders');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Unlock AudioContext on first user interaction (mobile requirement)
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    };
    document.addEventListener('touchstart', unlock, { once: true });
    document.addEventListener('click', unlock, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
    };
  }, []);

  // Play a two-tone chime
  const playChime = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.2);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1108.73, now + 0.2);
    osc2.connect(gain);
    osc2.start(now + 0.2);
    osc2.stop(now + 0.5);
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('staff-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['orders-staff'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const { data: orders = [] } = useQuery({
    queryKey: ['orders-staff'],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['New', 'Preparing', 'Ready', 'Served', 'Paid'])
        .order('created_at', { ascending: false })
        .limit(200);
      
      console.log('👷 StaffOrdersView fetched', data?.length || 0, 'orders');
        // Debug: log first few order IDs and their items/departments
        if (data && data.length > 0) {
          data.slice(0,3).forEach(o => {
            console.log('  Order:', o.id.substring(0,8), 'status:', o.status, 'items:', o.items);
          });
        }
      return data || [];
    },
    refetchInterval: 5000,
  });

  const [activeStatus, setActiveStatus] = useState('New');

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { New: 0, Preparing: 0, Ready: 0, Served: 0, Paid: 0 };
    orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    return counts;
  }, [orders]);

  const hasNewOrders = statusCounts.New > 0;

  // Repeating chime every 5s while there are New orders
  useEffect(() => {
    if (hasNewOrders) {
      playChime(); // play immediately
      intervalRef.current = setInterval(playChime, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hasNewOrders, playChime]);

  const filtered = useMemo(() => orders.filter(o => o.status === activeStatus), [orders, activeStatus]);

  // --- View Tab Invoice ---
  const [viewingTabId, setViewingTabId] = useState<string | null>(null);

  // --- Add Items to Served Order ---
  const [addingToOrder, setAddingToOrder] = useState<any>(null);
  const [addCart, setAddCart] = useState<Record<string, { name: string; price: number; qty: number }>>({});

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu_items_staff'],
    queryFn: async () => {
      const { data } = await supabase.from('menu_items').select('*').eq('available', true).order('sort_order');
      return data || [];
    },
  });

  const { data: menuCategories = [] } = useQuery({
    queryKey: ['menu_categories_staff'],
    queryFn: async () => {
      const { data } = await supabase.from('menu_categories').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });

  const [addCat, setAddCat] = useState('');
  const activeCat = addCat || (menuCategories.length > 0 ? menuCategories[0].name : '');
  const catItems = menuItems.filter((i: any) => i.category === activeCat);

  const addCartTotal = Object.values(addCart).reduce((s, c) => s + c.price * c.qty, 0);

  const handleOpenAddItems = (order: any) => {
    setAddingToOrder(order);
    setAddCart({});
    setAddCat('');
  };

  const handleSubmitAddItems = async () => {
    if (!addingToOrder || addCartTotal === 0) return;
    const newItems = Object.entries(addCart).map(([id, c]) => {
      const menuItem = menuItems.find((m: any) => m.id === id);
      return { name: c.name, price: c.price, qty: c.qty, department: menuItem?.department || 'kitchen' };
    });
    const hasKitchen = newItems.some(i => i.department === 'kitchen' || i.department === 'both');
    const hasBar = newItems.some(i => i.department === 'bar' || i.department === 'both');
    const newTotal = newItems.reduce((s, i) => s + i.price * i.qty, 0);
    const newServiceCharge = Math.round(newTotal * 0.1);
    await supabase.from('orders').insert({
      items: newItems,
      total: newTotal,
      service_charge: newServiceCharge,
      status: 'New',
      order_type: addingToOrder.order_type,
      location_detail: addingToOrder.location_detail,
      tab_id: addingToOrder.tab_id,
      room_id: addingToOrder.room_id || null,
      guest_name: addingToOrder.guest_name || '',
      staff_name: addingToOrder.staff_name || localStorage.getItem('emp_name') || '',
      payment_type: addingToOrder.payment_type || '',
      kitchen_status: hasKitchen ? 'pending' : 'ready',
      bar_status: hasBar ? 'pending' : 'ready',
    });
    qc.invalidateQueries({ queryKey: ['orders-staff'] });
    setAddingToOrder(null);
    toast.success('New items sent to kitchen');
  };

  const advanceOrder = async (orderId: string, nextStatus: string) => {
    const updateData: any = { status: nextStatus };
    if (nextStatus === 'Closed') updateData.closed_at = new Date().toISOString();
    await supabase.from('orders').update(updateData).eq('id', orderId);

    // Deduct inventory when moving to Preparing
    if (nextStatus === 'Preparing') {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        const items = (order.items as any[]) || [];
        await deductInventoryForOrder(orderId, items);
      }
    }

    qc.invalidateQueries({ queryKey: ['orders-staff'] });
    qc.invalidateQueries({ queryKey: ['orders-admin'] });
    qc.invalidateQueries({ queryKey: ['orders-kitchen'] });
    qc.invalidateQueries({ queryKey: ['orders-bar'] });
    toast.success(`Order → ${nextStatus}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 px-4 py-3">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setActiveStatus(s)}
            className={`font-display text-xs tracking-wider px-3 min-h-[44px] rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeStatus === s
                ? 'bg-gold/20 text-gold border border-gold/40'
                : 'bg-secondary text-cream-dim border border-border'
            } ${s === 'New' && hasNewOrders && activeStatus !== s ? 'tab-pulse' : ''}`}
          >
            {s}
            {statusCounts[s] > 0 && (
              <span className={`text-[10px] font-body font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                activeStatus === s ? 'bg-gold text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {statusCounts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {filtered.length === 0 && (
          <p className="font-body text-sm text-cream-dim text-center py-12">No {activeStatus.toLowerCase()} orders</p>
        )}
        {filtered.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            onAdvance={canPipeline ? advanceOrder : undefined}
            resortProfile={resortProfile}
            onAddItems={canPipeline ? handleOpenAddItems : undefined}
            onViewTab={(tabId) => setViewingTabId(tabId)}
          />
        ))}
      </div>

      {/* Add Items Dialog */}
      <Dialog open={!!addingToOrder} onOpenChange={() => setAddingToOrder(null)}>
        <DialogContent className="bg-card border-border max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider text-center">
              Add Items to Order
            </DialogTitle>
          </DialogHeader>

          {/* Category tabs */}
          <div className="flex flex-wrap gap-1 pb-2">
            {menuCategories.map((cat: any) => (
              <button
                key={cat.id}
                onClick={() => setAddCat(cat.name)}
                className={`font-display text-xs tracking-wider px-3 py-1.5 rounded-full transition-colors ${
                  activeCat === cat.name
                    ? 'bg-gold/20 text-gold border border-gold/40'
                    : 'text-cream-dim border border-transparent hover:text-foreground'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Items list */}
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {catItems.map((item: any) => {
              const inCart = addCart[item.id];
              return (
                <div key={item.id} className="flex items-center justify-between py-2 px-1">
                  <div className="flex-1 min-w-0">
                    <span className="font-display text-sm text-foreground block">{item.name}</span>
                    <span className="font-display text-xs text-gold">₱{item.price.toLocaleString()}</span>
                  </div>
                  {inCart ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const q = inCart.qty - 1;
                          if (q <= 0) {
                            const c = { ...addCart }; delete c[item.id]; setAddCart(c);
                          } else setAddCart({ ...addCart, [item.id]: { ...inCart, qty: q } });
                        }}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-display text-sm text-foreground w-5 text-center">{inCart.qty}</span>
                      <button
                        onClick={() => setAddCart({ ...addCart, [item.id]: { ...inCart, qty: inCart.qty + 1 } })}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddCart({ ...addCart, [item.id]: { name: item.name, price: item.price, qty: 1 } })}
                      className="w-8 h-8 rounded-full border border-gold/40 flex items-center justify-center text-gold"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Submit */}
          {addCartTotal > 0 && (
            <Button onClick={handleSubmitAddItems} className="w-full font-display tracking-wider py-5">
              Add ₱{addCartTotal.toLocaleString()} to Order
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Tab Invoice Dialog */}
      <Dialog open={!!viewingTabId} onOpenChange={() => setViewingTabId(null)}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
          {viewingTabId && (
            <TabInvoice tabId={viewingTabId} onClose={() => setViewingTabId(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffOrdersView;
