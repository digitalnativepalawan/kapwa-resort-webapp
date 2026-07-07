import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { Flame, GlassWater, Truck, CreditCard, Clock, CheckCircle2, Home, Receipt, FileText } from 'lucide-react';
import { useState } from 'react';
import { canEdit, canManage } from '@/lib/permissions';
import { generateInvoicePdf, buildInvoiceWhatsAppText } from '@/lib/generateInvoicePdf';
import type { ResortProfile } from '@/hooks/useResortProfile';

const STATUS_BORDER: Record<string, string> = {
  New: 'border-l-gold',
  Preparing: 'border-l-orange-400',
  Ready: 'border-l-emerald-400',
  Served: 'border-l-[hsl(210,70%,50%)]',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-muted-foreground',
  preparing: 'bg-orange-400',
  ready: 'bg-emerald-400',
};

interface ServiceOrderCardProps {
  order: any;
  department: 'kitchen' | 'bar' | 'reception' | 'cashier';
  permissions: string[];
  onAction?: (orderId: string, action: string) => Promise<void>;
  onOpenDetail?: (order: any) => void;
  compact?: boolean;
  resortProfile?: ResortProfile | null;
}

const ServiceOrderCard = ({ order, department, permissions, onAction, onOpenDetail, compact, resortProfile }: ServiceOrderCardProps) => {
  const [busy, setBusy] = useState(false);
  const items = (order.items as any[]) || [];
  const isNew = order.status === 'New';
  const elapsed = formatDistanceToNow(new Date(order.created_at), { addSuffix: false });

  const foodItems = items.filter((i: any) => { const d = i.department || 'kitchen'; return d === 'kitchen' || d === 'both'; });
  const barItems = items.filter((i: any) => i.department === 'bar' || i.department === 'both');

  const deptItems = (department === 'reception' || department === 'cashier') ? items : items.filter((i: any) => {
    const d = i.department || 'kitchen';
    return d === department || d === 'both';
  });

  const isRoomCharge = order.payment_type === 'Charge to Room';
  const isTab = !!order.tab_id;
  const isAutoPayable = isRoomCharge || isTab;

  const handleAction = async (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    if (!onAction || busy) return;
    setBusy(true);
    try { await onAction(order.id, action); } finally { setBusy(false); }
  };

  const canServe = canEdit(permissions, 'reception') || canEdit(permissions, 'kitchen') || canEdit(permissions, 'bar') || canManage(permissions, 'orders');

  // Primary action for current department
  let primaryAction: { label: string; action: string; icon: React.ReactNode } | null = null;

  if (department === 'kitchen' && canEdit(permissions, 'kitchen')) {
    if (order.kitchen_status === 'pending' && foodItems.length > 0) primaryAction = { label: 'Start Preparing', action: 'kitchen-start', icon: <Flame className="w-5 h-5" /> };
    else if (order.kitchen_status === 'preparing') primaryAction = { label: 'Mark Ready', action: 'kitchen-ready', icon: <CheckCircle2 className="w-5 h-5" /> };
  } else if (department === 'bar' && canEdit(permissions, 'bar')) {
    if (order.bar_status === 'pending' && barItems.length > 0) primaryAction = { label: 'Start Mixing', action: 'bar-start', icon: <GlassWater className="w-5 h-5" /> };
    else if (order.bar_status === 'preparing') primaryAction = { label: 'Mark Ready', action: 'bar-ready', icon: <CheckCircle2 className="w-5 h-5" /> };
  }

  const canMarkPaid = canEdit(permissions, 'reception') || canManage(permissions, 'orders');

  // Serve/Pay actions — any department staff can serve, only reception/admin can mark paid
  if (!primaryAction && canServe) {
    if (order.status === 'Ready') {
      primaryAction = { label: isAutoPayable ? 'Serve & Close' : 'Mark Served', action: 'mark-served', icon: <Truck className="w-5 h-5" /> };
    }
  }
  if (!primaryAction && canMarkPaid && order.status === 'Served' && !isAutoPayable) {
    primaryAction = { label: 'Mark Paid', action: 'mark-paid', icon: <CreditCard className="w-5 h-5" /> };
  }

  // Secondary cross-dept actions
  const secondaryActions: { label: string; action: string; icon: React.ReactNode }[] = [];

  if (department !== 'kitchen' && canEdit(permissions, 'kitchen') && foodItems.length > 0) {
    if (order.kitchen_status === 'pending') secondaryActions.push({ label: 'Start', action: 'kitchen-start', icon: <Flame className="w-4 h-4" /> });
    else if (order.kitchen_status === 'preparing') secondaryActions.push({ label: 'Ready', action: 'kitchen-ready', icon: <CheckCircle2 className="w-4 h-4" /> });
  }
  if (department !== 'bar' && canEdit(permissions, 'bar') && barItems.length > 0) {
    if (order.bar_status === 'pending') secondaryActions.push({ label: 'Start', action: 'bar-start', icon: <GlassWater className="w-4 h-4" /> });
    else if (order.bar_status === 'preparing') secondaryActions.push({ label: 'Ready', action: 'bar-ready', icon: <CheckCircle2 className="w-4 h-4" /> });
  }
  // Show invoice button for non-room/tab served/paid orders
  const showInvoice = !isAutoPayable && (order.status === 'Served' || order.status === 'Paid');

  if (deptItems.length === 0 && department !== 'reception' && department !== 'cashier') return null;

  const statusKey = department === 'kitchen' ? order.kitchen_status :
                    department === 'bar' ? order.bar_status : order.status;
  const borderClass = STATUS_BORDER[order.status] || 'border-l-border';

  return (
    <div
      onClick={() => onOpenDetail?.(order)}
      className={`rounded-xl border border-border/60 border-l-4 ${borderClass} transition-all cursor-pointer active:scale-[0.98] bg-card/90 backdrop-blur-sm ${
        isNew ? 'new-order-card' : ''
      } ${compact ? 'p-3' : 'p-4'}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-base text-foreground tracking-wider truncate">
            {order.order_type === 'Room' ? `${order.location_detail}` :
             order.order_type === 'DineIn' ? `${order.location_detail}` :
             `${order.location_detail || order.order_type}`}
          </p>
          {order.guest_name && (
            <p className="font-body text-xs text-muted-foreground mt-0.5 truncate">{order.guest_name}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0 ml-2">
          <Clock className="w-3 h-3" />
          <span className="font-body text-[11px] tabular-nums">{elapsed}</span>
        </div>
      </div>

      {/* Status dots + payment badge row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {foodItems.length > 0 && (
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${STATUS_DOT[order.kitchen_status] || 'bg-muted-foreground'}`} />
            <Flame className="w-3 h-3 text-muted-foreground" />
            <span className="font-body text-[11px] text-muted-foreground">{foodItems.length}</span>
          </div>
        )}
        {barItems.length > 0 && (
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${STATUS_DOT[order.bar_status] || 'bg-muted-foreground'}`} />
            <GlassWater className="w-3 h-3 text-muted-foreground" />
            <span className="font-body text-[11px] text-muted-foreground">{barItems.length}</span>
          </div>
        )}
        {/* Payment type badge */}
        {isRoomCharge && (
          <Badge variant="outline" className="font-body text-[10px] h-5 gap-1 bg-[hsl(210,70%,50%,0.15)] text-[hsl(210,70%,65%)] border-[hsl(210,70%,50%,0.3)]">
            <Home className="w-3 h-3" /> Room
          </Badge>
        )}
        {isTab && !isRoomCharge && (
          <Badge variant="outline" className="font-body text-[10px] h-5 gap-1 bg-[hsl(270,60%,55%,0.15)] text-[hsl(270,60%,70%)] border-[hsl(270,60%,55%,0.3)]">
            <Receipt className="w-3 h-3" /> Tab
          </Badge>
        )}
      </div>

      {/* Items list */}
      <div className="space-y-0.5 mb-3">
        {(department === 'reception' ? items : deptItems).slice(0, compact ? 3 : 6).map((item: any, idx: number) => (
          <div key={idx} className="flex justify-between font-body">
            <span className="text-foreground text-sm truncate mr-2">{item.qty}× {item.name}</span>
            <span className="text-muted-foreground text-sm tabular-nums flex-shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
          </div>
        ))}
        {(department === 'reception' ? items : deptItems).length > (compact ? 3 : 6) && (
          <p className="font-body text-[11px] text-muted-foreground">+{(department === 'reception' ? items : deptItems).length - (compact ? 3 : 6)} more…</p>
        )}
      </div>

      {/* Total + Actions */}
      <div className="pt-2.5 border-t border-border/50 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg text-gold tabular-nums">₱{order.total.toLocaleString()}</span>
          {primaryAction && onAction && department !== 'cashier' && (
            <Button
              onClick={(e) => handleAction(e, primaryAction!.action)}
              disabled={busy}
              size="lg"
              className={`font-display tracking-wider gap-2 text-sm min-h-[48px] px-5 rounded-xl ${
                isNew ? 'bg-gold text-primary-foreground hover:bg-gold/90 new-order-btn' : ''
              }`}
            >
              {busy ? 'Updating…' : <>{primaryAction.icon} {primaryAction.label}</>}
            </Button>
          )}
          {/* Auto-payable indicator when served */}
          {!primaryAction && isAutoPayable && order.status === 'Served' && (
            <span className="font-body text-xs text-muted-foreground italic">
              {isRoomCharge ? 'Charged to room' : 'On tab'}
            </span>
          )}
          {/* Invoice button for walk-in/dine-in */}
          {showInvoice && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                generateInvoicePdf(order, resortProfile || null);
              }}
              className="font-body text-xs gap-1 min-h-[36px] rounded-lg border-border/60"
            >
              <FileText className="w-4 h-4" /> Invoice
            </Button>
          )}
        </div>

        {/* Secondary cross-dept actions */}
        {secondaryActions.length > 0 && onAction && department !== 'cashier' && (
          <div className="flex gap-2 flex-wrap">
            {secondaryActions.map(a => (
              <Button
                key={a.action}
                variant="outline"
                size="sm"
                onClick={(e) => handleAction(e, a.action)}
                disabled={busy}
                className="font-body text-xs gap-1 min-h-[36px] rounded-lg border-border/60"
              >
                {a.icon} {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceOrderCard;
