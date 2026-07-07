import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Clock, Flame, GlassWater, Home, Receipt, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { groupOrdersByUnit, type OrderGroup } from '@/lib/groupOrders';

const COL_COLORS: Record<string, string> = {
  New: 'border-t-gold',
  Preparing: 'border-t-orange-400',
  Ready: 'border-t-emerald-400',
};

const STATUS_BORDER: Record<string, string> = {
  New: 'border-l-gold',
  Preparing: 'border-l-orange-400',
  Ready: 'border-l-emerald-400',
  Served: 'border-l-[hsl(210,70%,50%)]',
  Paid: 'border-l-emerald-400',
};

// Check if a unit is in-house (COT or SUI)
const isInHouseUnit = (unitKey: string): boolean => {
  if (!unitKey) return false;
  const upperKey = unitKey.toUpperCase();
  return upperKey.includes('COT') || upperKey.includes('SUI');
};

const WaitstaffBoard = () => {
  const qc = useQueryClient();
  const [activeUnit, setActiveUnit] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('waitstaff-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['waitstaff-orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const { data: orders = [] } = useQuery({
    queryKey: ['waitstaff-orders'],
    queryFn: async () => {
      // Fetch recent orders regardless of date (limited to 200)
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['New', 'Preparing', 'Ready'])
        .order('created_at', { ascending: true })
        .limit(300);
      console.log(`[waitstaff] Fetched ${data?.length || 0} orders raw`);
      return data || [];
    },
    refetchInterval: 5000,
  });

  // Only active orders — completed orders are never fetched
  const { activeGroups, allUnitKeys } = useMemo(() => {
    const ag = groupOrdersByUnit(orders);
    const keys = [...new Set(ag.map(g => g.key))];
    return { activeGroups: ag, allUnitKeys: keys };
  }, [orders]);

  // Column assignment by worst status
  const columns = useMemo(() => {
    const cols: Record<string, OrderGroup[]> = { New: [], Preparing: [], Ready: [] };
    const filtered = activeUnit ? activeGroups.filter(g => g.key === activeUnit) : activeGroups;
    filtered.forEach(g => {
      const col = g.worstStatus as keyof typeof cols;
      if (cols[col]) cols[col].push(g);
      else cols.New.push(g);
    });
    return cols;
  }, [activeGroups, activeUnit]);

  const handleSendGroupToCashier = useCallback(async (group: OrderGroup) => {
    const ids = group.orders.map(o => o.id);
    
    // Check if this is an in-house guest (unit contains COT or SUI)
    const isInHouse = isInHouseUnit(group.key);
    
    if (isInHouse) {
      // Find the room_id for this unit
      const { data: unit } = await supabase
        .from('resort_ops_units')
        .select('id')
        .ilike('name', `%${group.key}%`)
        .single();
      
      const roomId = unit?.id;
      
      // For in-house guests: mark as Served (hides from Waitstaff) and flag for billing
      await supabase
        .from('orders')
        .update({ 
          status: 'Served',
          ready_for_billing: true,
          room_id: roomId
        })
        .in('id', ids);
      
      qc.invalidateQueries({ queryKey: ['waitstaff-orders'] });
      toast.success(`${group.label} — charges added to room bill`);
    } else {
      // For walk-in guests: send to cashier as before
      await supabase
        .from('orders')
        .update({ status: 'Served' })
        .in('id', ids);
      
      qc.invalidateQueries({ queryKey: ['waitstaff-orders'] });
      qc.invalidateQueries({ queryKey: ['cashier-orders'] });
      toast.success(`${group.label} sent to Cashier`);
    }
  }, [qc]);

  const totalActive = activeGroups.length;

  return (
    <div className="h-full flex flex-col">
      {/* Unit pills */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/50 flex-shrink-0 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveUnit(null)}
          className={`font-display text-xs tracking-wider px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
            !activeUnit ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground border border-border'
          }`}
        >
          All ({totalActive})
        </button>
        {allUnitKeys.map(key => {
          const group = activeGroups.find(g => g.key === key)!;
          return (
            <button
              key={key}
              onClick={() => setActiveUnit(activeUnit === key ? null : key)}
              className={`font-display text-xs tracking-wider px-3 py-1.5 rounded-full whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeUnit === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground border border-border'
              } ${group.worstStatus === 'New' && activeUnit !== key ? 'tab-pulse' : ''}`}
            >
              {group.label}
              <span className={`text-[10px] font-body font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                activeUnit === key ? 'bg-foreground/20 text-foreground' : 'bg-muted text-muted-foreground'
              }`}>{group.items.length}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto">
        {/* Desktop: 3-column kanban */}
        <div className="hidden md:grid gap-3 p-4 md:grid-cols-3">
          {(['New', 'Preparing', 'Ready'] as const).map(col => (
            <div key={col} className={`flex flex-col border-t-4 ${COL_COLORS[col]} rounded-t-lg bg-secondary/30`}>
              <div className="px-3 py-2 flex items-center justify-between">
                <h3 className="font-display text-sm tracking-wider text-foreground">{col}</h3>
                <span className="font-body text-xs text-muted-foreground font-bold bg-muted rounded-full w-6 h-6 flex items-center justify-center">
                  {columns[col].length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 max-h-[60vh]">
                {columns[col].map(group => (
                  <GroupCard key={group.key} group={group} onSendToCashier={handleSendGroupToCashier} compact />
                ))}
                {columns[col].length === 0 && (
                  <p className="font-body text-xs text-muted-foreground text-center py-8">No orders</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile view */}
        <MobileTabView
          columns={columns}
          onSendToCashier={handleSendGroupToCashier}
        />
      </div>
    </div>
  );
};

/* ── Consolidated Group Card ── */
const GroupCard = ({ group, onSendToCashier, compact }: {
  group: OrderGroup;
  onSendToCashier: (g: OrderGroup) => Promise<void>;
  compact?: boolean;
}) => {
  const [busy, setBusy] = useState(false);
  const elapsed = formatDistanceToNow(new Date(group.oldestCreatedAt), { addSuffix: false });
  const isReady = group.worstStatus === 'Ready';
  const borderClass = STATUS_BORDER[group.worstStatus] || 'border-l-border';

  const foodItems = group.items.filter(i => { const d = i.department || 'kitchen'; return d === 'kitchen' || d === 'both'; });
  const barItems = group.items.filter(i => i.department === 'bar' || i.department === 'both');

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try { await onSendToCashier(group); } finally { setBusy(false); }
  };

  // Check if this is an in-house unit (contains COT or SUI)
  const isInHouse = isInHouseUnit(group.key);
  const buttonText = isInHouse ? 'Charge to Room' : 'Send to Cashier';
  const buttonIcon = isInHouse ? <Home className="w-5 h-5" /> : <Send className="w-5 h-5" />;

  return (
    <div className={`rounded-xl border border-border/60 border-l-4 ${borderClass} bg-card/90 backdrop-blur-sm ${
      group.worstStatus === 'New' ? 'new-order-card' : ''
    } ${compact ? 'p-3' : 'p-4'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-base text-foreground tracking-wider truncate">
            {group.label}
          </p>
          {group.guestName && (
            <p className="font-body text-xs text-muted-foreground mt-0.5 truncate">{group.guestName}</p>
          )}
          {group.orders.length > 1 && (
            <p className="font-body text-[10px] text-muted-foreground">{group.orders.length} orders combined</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0 ml-2">
          <Clock className="w-3 h-3" />
          <span className="font-body text-[11px] tabular-nums">{elapsed}</span>
        </div>
      </div>

      {/* Status dots */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {foodItems.length > 0 && (
          <div className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-muted-foreground" />
            <span className="font-body text-[11px] text-muted-foreground">{foodItems.length}</span>
          </div>
        )}
        {barItems.length > 0 && (
          <div className="flex items-center gap-1">
            <GlassWater className="w-3 h-3 text-muted-foreground" />
            <span className="font-body text-[11px] text-muted-foreground">{barItems.length}</span>
          </div>
        )}
        {group.hasRoomCharge && (
          <Badge variant="outline" className="font-body text-[10px] h-5 gap-1 bg-[hsl(210,70%,50%,0.15)] text-[hsl(210,70%,65%)] border-[hsl(210,70%,50%,0.3)]">
            <Home className="w-3 h-3" /> Room
          </Badge>
        )}
        {group.hasTab && !group.hasRoomCharge && (
          <Badge variant="outline" className="font-body text-[10px] h-5 gap-1 bg-[hsl(270,60%,55%,0.15)] text-[hsl(270,60%,70%)] border-[hsl(270,60%,55%,0.3)]">
            <Receipt className="w-3 h-3" /> Tab
          </Badge>
        )}
      </div>

      {/* Items */}
      <div className="space-y-0.5 mb-3">
        {group.items.slice(0, compact ? 4 : 8).map((item, idx) => (
          <div key={idx} className="flex justify-between font-body">
            <span className="text-foreground text-sm truncate mr-2">{item.qty}× {item.name}</span>
            <span className="text-muted-foreground text-sm tabular-nums flex-shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
          </div>
        ))}
        {group.items.length > (compact ? 4 : 8) && (
          <p className="font-body text-[11px] text-muted-foreground">+{group.items.length - (compact ? 4 : 8)} more…</p>
        )}
      </div>

      {/* Total + Action */}
      <div className="pt-2.5 border-t border-border/50">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg text-gold tabular-nums">₱{group.total.toLocaleString()}</span>
          {isReady && (
            <Button
              onClick={handleSend}
              disabled={busy}
              size="lg"
              className={`font-display tracking-wider gap-2 text-sm min-h-[48px] px-5 rounded-xl ${
                isInHouse 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {busy ? 'Processing…' : <>{buttonIcon} {buttonText}</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Mobile Tab View ── */
const MobileTabView = ({ columns, onSendToCashier }: {
  columns: Record<string, OrderGroup[]>;
  onSendToCashier: (g: OrderGroup) => Promise<void>;
}) => {
  const [tab, setTab] = useState<string>('New');

  return (
    <div className="md:hidden flex flex-col h-full">
      <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-hide flex-shrink-0">
        {(['New', 'Preparing', 'Ready'] as const).map(col => (
          <button
            key={col}
            onClick={() => setTab(col)}
            className={`font-display text-xs tracking-wider px-4 min-h-[48px] rounded-lg flex items-center gap-2 whitespace-nowrap transition-colors ${
              tab === col ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground border border-border'
            } ${col === 'New' && columns.New.length > 0 && tab !== col ? 'tab-pulse' : ''}`}
          >
            {col}
            {columns[col].length > 0 && (
              <span className={`text-[11px] font-body font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                tab === col ? 'bg-foreground/20 text-foreground' : 'bg-muted text-muted-foreground'
              }`}>{columns[col].length}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
        {columns[tab]?.length === 0 && (
          <p className="font-body text-sm text-muted-foreground text-center py-12">No {tab.toLowerCase()} orders</p>
        )}
        {columns[tab]?.map(group => (
          <GroupCard key={group.key} group={group} onSendToCashier={onSendToCashier} />
        ))}
      </div>
    </div>
  );
};

export default WaitstaffBoard;
