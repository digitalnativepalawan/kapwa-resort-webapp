import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChefHat, Truck, CreditCard, CheckCircle2, AlertTriangle, Download, MessageCircle, PlusCircle, Receipt, Trash2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ResortProfile } from '@/hooks/useResortProfile';
import { generateInvoicePdf, buildInvoiceWhatsAppText } from '@/lib/generateInvoicePdf';
import { toast } from 'sonner';

const STATUS_FLOW: Record<string, { next: string; label: string; icon: React.ReactNode }> = {
  New: { next: 'Preparing', label: 'Start Preparing', icon: <ChefHat className="w-4 h-4" /> },
  Preparing: { next: 'Served', label: 'Mark Served', icon: <Truck className="w-4 h-4" /> },
  Served: { next: 'Paid', label: 'Mark Paid', icon: <CreditCard className="w-4 h-4" /> },
  Paid: { next: 'Closed', label: 'Close Order', icon: <CheckCircle2 className="w-4 h-4" /> },
};

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-gold/20 text-gold border-gold/40',
  Preparing: 'bg-orange-500/20 text-orange-400 border-orange-400/40',
  Served: 'bg-blue-500/20 text-blue-400 border-blue-400/40',
  Paid: 'bg-emerald-500/20 text-emerald-400 border-emerald-400/40',
  Closed: 'bg-muted text-muted-foreground border-border',
};

interface OrderCardProps {
  order: any;
  onAdvance?: (orderId: string, nextStatus: string) => void | Promise<void>;
  resortProfile?: ResortProfile | null;
  onAddItems?: (order: any) => void;
  onViewTab?: (tabId: string) => void;
  onDelete?: (orderId: string) => void;
}

const OrderCard = ({ order, onAdvance, resortProfile, onAddItems, onViewTab, onDelete }: OrderCardProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const canInvoice = order.status === 'Served' || order.status === 'Paid';

  const handleDownloadPdf = async () => {
    try {
      await generateInvoicePdf(order, resortProfile ?? null);
      toast.success('Invoice downloaded');
    } catch {
      toast.error('Failed to generate invoice');
    }
  };

  const handleShareWhatsApp = () => {
    const text = buildInvoiceWhatsAppText(order, resortProfile ?? null);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
  const flow = STATUS_FLOW[order.status];
  const items = (order.items as any[]) || [];
  const statusColor = STATUS_COLORS[order.status] || STATUS_COLORS.Closed;
  const isNew = order.status === 'New';

  return (
    <div className={`p-4 border rounded-lg transition-all ${
      isNew
        ? 'border-gold new-order-card bg-gold/10'
        : 'border-border bg-card/50'
    }`}>
      {/* NEW ORDER banner */}
      {isNew && (
        <div className="flex items-center gap-2 mb-3 bg-gold/20 rounded px-3 py-1.5 border border-gold/40">
          <AlertTriangle className="w-4 h-4 text-gold blink-dot" />
          <span className="font-display text-sm text-gold tracking-widest font-bold uppercase">New Order</span>
        </div>
      )}

      {/* SCHEDULED ORDER banner */}
      {order.scheduled_for && (
        <div className="flex items-center gap-2 mb-3 bg-blue-500/20 rounded px-3 py-1.5 border border-blue-400/40">
          <Clock className="w-4 h-4 text-blue-400" />
          <span className="font-display text-sm text-blue-400 tracking-widest font-bold uppercase">
            Scheduled — {order.location_detail} — {(() => {
              const d = new Date(order.scheduled_for);
              const now = new Date();
              const isToday = d.toDateString() === now.toDateString();
              const timeStr = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
              return isToday ? timeStr : `Tomorrow ${timeStr}`;
            })()}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="font-display text-sm text-foreground tracking-wider">
            {order.order_type} — {order.location_detail}
          </p>
          <p className="font-body text-xs text-cream-dim mt-0.5">
            {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {order.scheduled_for && (
            <Badge variant="outline" className="font-body text-[10px] bg-blue-500/20 text-blue-400 border-blue-400/40 gap-1">
              <Clock className="w-3 h-3" />
              {(() => {
                const d = new Date(order.scheduled_for);
                const now = new Date();
                const isToday = d.toDateString() === now.toDateString();
                const timeStr = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
                return isToday ? timeStr : `Tomorrow ${timeStr}`;
              })()}
            </Badge>
          )}
          {order.tab_id && (
            <Badge variant="outline" className="font-body text-[10px] bg-purple-500/20 text-purple-400 border-purple-400/40">
              Tab
            </Badge>
          )}
          <Badge variant="outline" className={`font-body text-xs ${statusColor}`}>
            {order.status}
          </Badge>
        </div>
      </div>

      {/* Department status badges */}
      {(order.kitchen_status || order.bar_status) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {order.kitchen_status && order.kitchen_status !== 'ready' && (
            <Badge variant="outline" className={`font-body text-[10px] ${
              order.kitchen_status === 'pending' ? 'bg-gold/20 text-gold border-gold/40' : 'bg-orange-500/20 text-orange-400 border-orange-400/40'
            }`}>
              🍳 Kitchen: {order.kitchen_status}
            </Badge>
          )}
          {order.kitchen_status === 'ready' && (
            <Badge variant="outline" className="font-body text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-400/40">
              🍳 Kitchen: ready
            </Badge>
          )}
          {order.bar_status && order.bar_status !== 'ready' && (
            <Badge variant="outline" className={`font-body text-[10px] ${
              order.bar_status === 'pending' ? 'bg-gold/20 text-gold border-gold/40' : 'bg-orange-500/20 text-orange-400 border-orange-400/40'
            }`}>
              🍹 Bar: {order.bar_status}
            </Badge>
          )}
          {order.bar_status === 'ready' && (
            <Badge variant="outline" className="font-body text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-400/40">
              🍹 Bar: ready
            </Badge>
          )}
        </div>
      )}

      {/* Items */}
      <div className="space-y-1 mb-3">
        {items.map((item: any, idx: number) => (
          <div key={idx} className="flex justify-between font-body text-sm">
            <span className="text-foreground">{item.qty}× {item.name}</span>
            <span className="text-cream-dim">₱{(item.price * item.qty).toFixed(0)}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-border space-y-2">
        {/* Total + payment */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-display text-sm text-gold">₱{order.total.toLocaleString()}</span>
          {order.payment_type && (
            <span className="font-body text-xs text-cream-dim">({order.payment_type})</span>
          )}
        </div>

        {/* Action buttons - wrapped */}
        <div className="flex flex-wrap items-center gap-1.5">
          {order.status === 'Served' && onAddItems && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAddItems(order)}
              className="font-body text-xs gap-1 border-gold/40 text-gold hover:bg-gold/10"
            >
              <PlusCircle className="w-4 h-4" />
              Add Items
            </Button>
          )}
          {order.tab_id && onViewTab && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewTab(order.tab_id)}
              className="font-body text-xs gap-1 border-purple-400/40 text-purple-400 hover:bg-purple-500/10"
            >
              <Receipt className="w-4 h-4" />
              Tab Invoice
            </Button>
          )}
          {canInvoice && (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDownloadPdf}
                className="w-9 h-9 text-cream-dim hover:text-gold"
                title="Download Invoice"
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleShareWhatsApp}
                className="w-9 h-9 text-cream-dim hover:text-emerald-400"
                title="Share on WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
            </>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant={confirmDelete ? 'destructive' : 'outline'}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 3000);
                } else {
                  onDelete(order.id);
                }
              }}
              className={`font-body text-xs gap-1 ${confirmDelete ? 'animate-pulse' : 'border-destructive/40 text-destructive hover:bg-destructive/10'}`}
            >
              <Trash2 className="w-4 h-4" />
              {confirmDelete ? 'Confirm?' : 'Delete'}
            </Button>
          )}
          {flow && onAdvance && (
            <Button
              size={isNew ? 'default' : 'sm'}
              disabled={advancing}
              onClick={async () => {
                if (advancing) return;
                setAdvancing(true);
                try {
                  await onAdvance(order.id, flow.next);
                } finally {
                  setAdvancing(false);
                }
              }}
              className={`font-body text-xs gap-1.5 relative ${isNew ? 'new-order-btn bg-gold text-primary-foreground hover:bg-gold/90 font-bold text-sm px-5' : ''}`}
            >
              {isNew && !advancing && (
                <span className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-destructive blink-dot" />
              )}
              {advancing ? 'Updating…' : <>{flow.icon} {flow.label}</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderCard;
