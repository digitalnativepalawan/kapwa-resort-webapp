import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRoomTransactions } from '@/hooks/useRoomTransactions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';
import {
  DollarSign, RefreshCw, LogOut, UtensilsCrossed, MapPin, Bike, Truck,
  Trash2, Gift, FileText, CreditCard, Palmtree, CheckCircle, Pencil, Check, X,
  AlertTriangle, MessageSquare, ShoppingCart,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import AddPaymentModal from './AddPaymentModal';
import AdjustmentModal from './AdjustmentModal';
import CheckoutModal from './CheckoutModal';
import PrintBill from './PrintBill';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';

const from = (t: string) => supabase.from(t as any) as any;

interface RoomBillingTabProps {
  unit: any;
  booking: any;
  guestName: string | null;
  readOnly?: boolean;
}

const RoomBillingTab = ({ unit, booking, guestName, readOnly = false }: RoomBillingTabProps) => {
  const qc = useQueryClient();
  const { data: transactions = [], isLoading, refetch } = useRoomTransactions(unit?.id, booking?.id || null);
  const [showPayment, setShowPayment] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showSettlementBlock, setShowSettlementBlock] = useState(false);

  // Selective payment states
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [showPaySelected, setShowPaySelected] = useState(false);
  const [paySelectedMethod, setPaySelectedMethod] = useState('');
  const [paySelectedBusy, setPaySelectedBusy] = useState(false);
  const { data: paymentMethods = [] } = usePaymentMethods();
  const activePayMethods = paymentMethods.filter(m => m.is_active && m.name !== 'Charge to Room');

  // Inline edit states
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editOrderAmount, setEditOrderAmount] = useState('');
  const [editingTourId, setEditingTourId] = useState<string | null>(null);
  const [editTourAmount, setEditTourAmount] = useState('');
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editTxAmount, setEditTxAmount] = useState('');

  // ── ALL F&B orders for this room (including Paid) ──
  const { data: roomOrders = [] } = useQuery({
    queryKey: ['billing-room-orders', unit?.id, unit?.name, booking?.id],
    enabled: !!unit,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data: byRoom } = await supabase.from('orders').select('*')
        .eq('room_id', unit.id).in('status', ['New', 'Preparing', 'Ready', 'Served', 'Paid'])
        .order('created_at', { ascending: false });
      const { data: byLocation } = await supabase.from('orders').select('*')
        .is('room_id', null).eq('location_detail', unit.name)
        .in('status', ['New', 'Preparing', 'Ready', 'Served', 'Paid'])
        .order('created_at', { ascending: false });
      const map = new Map<string, any>();
      for (const o of [...(byRoom || []), ...(byLocation || [])]) map.set(o.id, o);
      let results = Array.from(map.values());
      if (booking) {
        const start = new Date(booking.check_in + 'T00:00:00');
        const end = new Date(booking.check_out + 'T23:59:59');
        results = results.filter(o => {
          const created = new Date(o.created_at);
          return created >= start && created <= end;
        });
      }
      return results;
    },
  });

  const unpaidOrders = roomOrders.filter(o => o.status !== 'Paid');
  const paidOrders = roomOrders.filter(o => o.status === 'Paid');

  // ── Realtime subscription for orders ──
  useEffect(() => {
    if (!unit) return;
    const channel = supabase.channel(`billing-orders-${unit.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['billing-room-orders', unit.id, unit.name, booking?.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [unit?.id, booking?.id]);

  // ── Guest tours ──
  const { data: tours = [] } = useQuery({
    queryKey: ['billing-tours', booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await from('guest_tours').select('*')
        .eq('booking_id', booking.id).order('created_at', { ascending: false });
      return data || [];
    },
  });

  // ── Guest requests (transport, rentals) ──
  const { data: requests = [] } = useQuery({
    queryKey: ['billing-requests', booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await from('guest_requests').select('*')
        .eq('booking_id', booking.id).neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const otaPlatforms = ['booking.com', 'airbnb', 'agoda', 'expedia', 'hostelworld', 'trip.com'];
  const isOtaStay = booking?.platform && otaPlatforms.includes(booking.platform.toLowerCase());
  // Filter out accommodation rows for OTA stays (backward compat for old bad entries)
  const visibleTransactions = isOtaStay ? transactions.filter(t => t.transaction_type !== 'accommodation') : transactions;
  const charges = visibleTransactions.filter(t => t.total_amount > 0);
  const payments = visibleTransactions.filter(t => t.total_amount < 0);
  const totalCharges = charges.reduce((s, t) => s + t.total_amount, 0);
  const totalPayments = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));
  const unpaidOrdersTotal = unpaidOrders
    .filter(o => o.payment_type !== 'Charge to Room')
    .reduce((s, o) => s + Number(o.total || 0) + Number(o.service_charge || 0), 0);
  const unpaidOrdersSCTotal = unpaidOrders
    .filter(o => o.payment_type !== 'Charge to Room')
    .reduce((s, o) => s + Number(o.service_charge || 0), 0);
  const unpaidOrdersSubtotal = unpaidOrdersTotal - unpaidOrdersSCTotal;
  const activeToursTotal = tours.filter((t: any) => t.status !== 'cancelled' && t.status !== 'completed').reduce((s: number, t: any) => s + Number(t.price || 0), 0);
  const activeRequestsTotal = requests.filter((r: any) => r.status !== 'cancelled' && r.status !== 'completed').reduce((s: number, r: any) => s + Number(r.price || 0), 0);
  const balance = totalCharges - totalPayments + unpaidOrdersTotal + activeToursTotal + activeRequestsTotal;

  const staffName = localStorage.getItem('emp_display_name') || localStorage.getItem('emp_name') || 'Staff';

  const handleCheckoutClick = () => {
    if (balance > 0) {
      setShowSettlementBlock(true);
    } else {
      setShowCheckout(true);
    }
  };

  // ── Actions ──
  const handleCompOrder = async (orderId: string) => {
    await supabase.from('orders').update({ status: 'Paid', payment_type: 'Comp' }).eq('id', orderId);
    await logAudit('updated', 'orders', orderId, `Comped order by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
    toast.success('Order comped');
  };

  const handleMarkPaidOrder = async (orderId: string) => {
    await supabase.from('orders').update({ status: 'Paid', payment_type: 'Cash', closed_at: new Date().toISOString() }).eq('id', orderId);
    await logAudit('updated', 'orders', orderId, `Marked order paid by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
    toast.success('Order marked as paid');
  };

  const handleDeleteOrder = async (orderId: string) => {
    await supabase.from('room_transactions').delete().eq('order_id', orderId);
    await supabase.from('inventory_logs').delete().eq('order_id', orderId);
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    await logAudit('deleted', 'orders', orderId, `Deleted order by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
    qc.invalidateQueries({ queryKey: ['room-transactions'] });
    toast.success('Order deleted');
  };

  const handleEditOrderSave = async (orderId: string) => {
    const newTotal = parseFloat(editOrderAmount);
    if (isNaN(newTotal) || newTotal < 0) { toast.error('Enter a valid amount'); return; }
    await supabase.from('orders').update({ total: newTotal }).eq('id', orderId);
    await logAudit('updated', 'orders', orderId, `Edited order total to ₱${newTotal.toLocaleString()} by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
    setEditingOrderId(null);
    toast.success('Order total updated');
  };

  const handleDeleteTour = async (tourId: string) => {
    await from('guest_tours').delete().eq('id', tourId);
    await logAudit('deleted', 'guest_tours', tourId, `Deleted tour by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-tours'] });
    toast.success('Tour deleted');
  };

  const handleCancelTour = async (tourId: string) => {
    await from('guest_tours').update({ status: 'cancelled' }).eq('id', tourId);
    qc.invalidateQueries({ queryKey: ['billing-tours'] });
    toast.success('Tour cancelled');
  };

  const handleCompleteTour = async (tourId: string) => {
    const tour = tours.find((t: any) => t.id === tourId);
    await from('guest_tours').update({ status: 'completed' }).eq('id', tourId);
    // Post tour charge to room ledger
    if (tour && Number(tour.price) > 0 && booking?.id) {
      await (supabase.from('room_transactions' as any) as any).insert({
        unit_id: unit.id,
        unit_name: unit.name,
        guest_name: guestName,
        booking_id: booking.id,
        transaction_type: 'tour',
        amount: Number(tour.price),
        tax_amount: 0,
        service_charge_amount: 0,
        total_amount: Number(tour.price),
        payment_method: '',
        staff_name: staffName,
        notes: `Tour: ${tour.tour_name}`,
      });
      qc.invalidateQueries({ queryKey: ['room-transactions', unit.id] });
    }
    await logAudit('updated', 'guest_tours', tourId, `Marked tour completed by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-tours'] });
    toast.success('Tour completed & charged to room');
  };

  const handleEditTourSave = async (tourId: string) => {
    const newPrice = parseFloat(editTourAmount);
    if (isNaN(newPrice) || newPrice < 0) { toast.error('Enter a valid amount'); return; }
    await from('guest_tours').update({ price: newPrice }).eq('id', tourId);
    await logAudit('updated', 'guest_tours', tourId, `Edited tour price to ₱${newPrice.toLocaleString()} by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-tours'] });
    setEditingTourId(null);
    toast.success('Tour price updated');
  };

  const handleDeleteRequest = async (reqId: string) => {
    await from('guest_requests').delete().eq('id', reqId);
    await logAudit('deleted', 'guest_requests', reqId, `Deleted request by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-requests'] });
    toast.success('Request deleted');
  };

  const handleCancelRequest = async (reqId: string) => {
    await from('guest_requests').update({ status: 'cancelled' }).eq('id', reqId);
    qc.invalidateQueries({ queryKey: ['billing-requests'] });
    toast.success('Request cancelled');
  };

  const handleCompleteRequest = async (reqId: string) => {
    const req = requests.find((r: any) => r.id === reqId);
    await from('guest_requests').update({ status: 'completed' }).eq('id', reqId);
    // Post request charge to room ledger if it has a price
    if (req && Number(req.price) > 0 && booking?.id) {
      await (supabase.from('room_transactions' as any) as any).insert({
        unit_id: unit.id,
        unit_name: unit.name,
        guest_name: guestName,
        booking_id: booking.id,
        transaction_type: 'service_request',
        amount: Number(req.price),
        tax_amount: 0,
        service_charge_amount: 0,
        total_amount: Number(req.price),
        payment_method: '',
        staff_name: staffName,
        notes: `${req.request_type}: ${req.details || ''}`.trim(),
      });
      qc.invalidateQueries({ queryKey: ['room-transactions', unit.id] });
    }
    await logAudit('updated', 'guest_requests', reqId, `Marked request completed by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-requests'] });
    toast.success('Request completed & charged to room');
  };

  const handleDeleteTx = async (txId: string, txType: string, amount: number) => {
    if (!confirm(`Delete this ${txType.replace('_', ' ')} entry?`)) return;
    await from('room_transactions').delete().eq('id', txId);
    await logAudit('deleted', 'room_transactions', txId, `Deleted ${txType} ₱${Math.abs(amount).toLocaleString()} for ${unit.name} by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['room-transactions', unit.id] });
    toast.success('Ledger entry deleted');
  };

  const handleEditTxSave = async (txId: string) => {
    const newAmt = parseFloat(editTxAmount);
    if (isNaN(newAmt)) { toast.error('Enter a valid amount'); return; }
    await from('room_transactions').update({ amount: newAmt, total_amount: newAmt, tax_amount: 0, service_charge_amount: 0 }).eq('id', txId);
    await logAudit('updated', 'room_transactions', txId, `Edited ledger amount to ₱${newAmt.toLocaleString()} by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['room-transactions', unit.id] });
    setEditingTxId(null);
    toast.success('Ledger entry updated');
  };

  const refreshAll = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
    qc.invalidateQueries({ queryKey: ['billing-tours'] });
    qc.invalidateQueries({ queryKey: ['billing-requests'] });
  };

  // ── Selective payment helpers ──
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  };

  const selectAllUnpaid = () => {
    if (selectedOrderIds.size === unpaidOrders.filter(o => o.payment_type !== 'Charge to Room').length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(unpaidOrders.filter(o => o.payment_type !== 'Charge to Room').map(o => o.id)));
    }
  };

  const selectedTotal = unpaidOrders
    .filter(o => selectedOrderIds.has(o.id))
    .reduce((s, o) => s + Number(o.total || 0) + Number(o.service_charge || 0), 0);

  const handlePaySelected = async () => {
    if (!paySelectedMethod || selectedOrderIds.size === 0) return;
    setPaySelectedBusy(true);
    try {
      const ids = Array.from(selectedOrderIds);
      for (const id of ids) {
        await supabase.from('orders').update({
          status: 'Paid',
          payment_type: paySelectedMethod,
          closed_at: new Date().toISOString(),
        }).eq('id', id);
      }
      // Record a payment transaction on the room ledger
      await (supabase.from('room_transactions' as any) as any).insert({
        unit_id: unit.id,
        unit_name: unit.name,
        guest_name: guestName,
        booking_id: booking?.id || null,
        transaction_type: 'payment',
        amount: -selectedTotal,
        tax_amount: 0,
        service_charge_amount: 0,
        total_amount: -selectedTotal,
        payment_method: paySelectedMethod,
        staff_name: staffName,
        notes: `Partial payment for ${ids.length} F&B order(s)`,
      });
      await logAudit('created', 'room_transactions', unit.id, `Partial payment ₱${selectedTotal.toLocaleString()} via ${paySelectedMethod} for ${ids.length} orders — ${unit.name}`);
      qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
      qc.invalidateQueries({ queryKey: ['room-transactions', unit.id] });
      setSelectedOrderIds(new Set());
      setShowPaySelected(false);
      setPaySelectedMethod('');
      toast.success(`${ids.length} order(s) paid — ₱${selectedTotal.toLocaleString()}`);
    } catch {
      toast.error('Failed to process payment');
    } finally {
      setPaySelectedBusy(false);
    }
  };

  const orderStatusColor = (s: string) => {
    switch (s) {
      case 'New': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'Preparing': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Ready': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'Served': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Paid': return 'bg-muted text-muted-foreground border-muted';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const tourStatusColor = (s: string) => {
    switch (s) {
      case 'booked': case 'pending': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'confirmed': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'completed': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'cancelled': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // ── Bill disputes ──
  const { data: disputes = [] } = useQuery({
    queryKey: ['billing-disputes', booking?.id],
    enabled: !!booking?.id,
    queryFn: async () => {
      const { data } = await from('bill_disputes').select('*')
        .eq('booking_id', booking.id).order('created_at', { ascending: false });
      return data || [];
    },
  });
  const [disputeResponse, setDisputeResponse] = useState('');
  const [respondingDisputeId, setRespondingDisputeId] = useState<string | null>(null);

  const handleResolveDispute = async (disputeId: string, newStatus: 'resolved' | 'dismissed') => {
    await from('bill_disputes').update({
      staff_response: disputeResponse.trim(),
      responded_by: staffName,
      status: newStatus,
      resolved_at: new Date().toISOString(),
    }).eq('id', disputeId);
    await logAudit('updated', 'bill_disputes', disputeId, `${newStatus} dispute — response: ${disputeResponse.trim()} by ${staffName}`);
    qc.invalidateQueries({ queryKey: ['billing-disputes', booking?.id] });
    setRespondingDisputeId(null);
    setDisputeResponse('');
    toast.success(`Dispute ${newStatus}`);
  };

  // Realtime for disputes
  useEffect(() => {
    if (!booking?.id) return;
    const channel = supabase.channel(`billing-disputes-${booking.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_disputes', filter: `booking_id=eq.${booking.id}` }, () => {
        qc.invalidateQueries({ queryKey: ['billing-disputes', booking.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [booking?.id]);

  const openDisputes = disputes.filter((d: any) => d.status === 'open');

  return (
    <div className="space-y-4">
      {/* ═══ Dispute Alert Banner ═══ */}
      {openDisputes.length > 0 && (
        <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <p className="font-display text-xs tracking-wider text-amber-400 uppercase">Bill Dispute ({openDisputes.length})</p>
          </div>
          {openDisputes.map((d: any) => (
            <div key={d.id} className="bg-card border border-amber-500/30 rounded-lg p-3 space-y-2">
              <p className="font-body text-xs text-muted-foreground">{d.guest_name} · {new Date(d.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
              <p className="font-body text-sm text-foreground">{d.guest_message}</p>
              {respondingDisputeId === d.id ? (
                <div className="space-y-2">
                  <Textarea value={disputeResponse} onChange={e => setDisputeResponse(e.target.value)}
                    placeholder="Explain what was corrected or why the charge is valid..."
                    className="bg-secondary border-border text-foreground min-h-[80px] text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleResolveDispute(d.id, 'resolved')} disabled={!disputeResponse.trim()}
                      className="font-display text-xs tracking-wider gap-1">
                      <CheckCircle className="w-3 h-3" /> Resolve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleResolveDispute(d.id, 'dismissed')} disabled={!disputeResponse.trim()}
                      className="font-display text-xs tracking-wider">
                      Dismiss
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRespondingDisputeId(null); setDisputeResponse(''); }}
                      className="font-display text-xs tracking-wider text-muted-foreground">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setRespondingDisputeId(d.id)}
                  className="font-display text-xs tracking-wider gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                  <MessageSquare className="w-3 h-3" /> Respond
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Resolved disputes */}
      {disputes.filter((d: any) => d.status !== 'open').length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-[10px] tracking-wider text-muted-foreground uppercase">Past Disputes</p>
          {disputes.filter((d: any) => d.status !== 'open').map((d: any) => (
            <div key={d.id} className="border border-border/40 rounded-lg p-2 opacity-60">
              <div className="flex justify-between items-center">
                <p className="font-body text-xs text-foreground truncate max-w-[70%]">{d.guest_message}</p>
                <Badge variant="outline" className="text-[10px]">{d.status}</Badge>
              </div>
              {d.staff_response && <p className="font-body text-[10px] text-muted-foreground mt-1">Response: {d.staff_response}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ═══ Balance Header ═══ */}
      <div className="border border-border rounded-lg p-4 bg-secondary space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body text-xs text-muted-foreground">Guest Folio Balance</p>
            <p className={`font-display text-2xl tracking-wider ${balance > 0 ? 'text-destructive' : 'text-green-400'}`}>
              ₱{Math.abs(balance).toLocaleString()}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={refreshAll} className="text-muted-foreground">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <p className="font-body text-xs text-muted-foreground">
          {guestName || 'No guest'} · {unit.name}
          {booking && ` · ${format(new Date(booking.check_in + 'T00:00:00'), 'MMM d')}–${format(new Date(booking.check_out + 'T00:00:00'), 'MMM d')}`}
        </p>
      </div>

      {/* ═══ Action Buttons ═══ */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPayment(true)}
            className="font-display text-xs tracking-wider gap-1 min-h-[44px]">
            <DollarSign className="w-3.5 h-3.5" /> Add Payment
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAdjustment(true)}
            className="font-display text-xs tracking-wider min-h-[44px]">
            Adjustment
          </Button>
          <PrintBill unitName={unit.name} guestName={guestName} booking={booking} transactions={transactions} roomOrders={roomOrders} tours={tours} requests={requests} />
          {booking && (
            <Button size="sm" variant="destructive" disabled={isLoading} onClick={handleCheckoutClick}
              className="font-display text-xs tracking-wider gap-1 min-h-[44px]">
              <LogOut className="w-3.5 h-3.5" /> Check Out
            </Button>
          )}
        </div>
      )}
      {readOnly && (
        <div className="flex flex-wrap gap-2">
          <PrintBill unitName={unit.name} guestName={guestName} booking={booking} transactions={transactions} roomOrders={roomOrders} tours={tours} requests={requests} />
        </div>
      )}

      <Separator />

      {/* ═══ SECTION: Active F&B Orders ═══ */}
      {unpaidOrders.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5" /> Active F&B Orders
            </p>
            {!readOnly && unpaidOrders.filter(o => o.payment_type !== 'Charge to Room').length > 0 && (
              <Button size="sm" variant="ghost" onClick={selectAllUnpaid}
                className="font-body text-[10px] text-muted-foreground h-6 px-2">
                {selectedOrderIds.size === unpaidOrders.filter(o => o.payment_type !== 'Charge to Room').length ? 'Deselect All' : 'Select All'}
              </Button>
            )}
          </div>

          {/* Pay Selected bar */}
          {!readOnly && selectedOrderIds.size > 0 && (
            <div className="border border-primary/40 bg-primary/5 rounded-lg p-3 space-y-2">
              {!showPaySelected ? (
                <Button size="sm" onClick={() => setShowPaySelected(true)}
                  className="w-full font-display text-xs tracking-wider gap-1.5 min-h-[44px]">
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Pay Selected ({selectedOrderIds.size} orders — ₱{selectedTotal.toLocaleString()})
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="font-display text-xs tracking-wider text-foreground">
                    Pay {selectedOrderIds.size} order(s) — ₱{selectedTotal.toLocaleString()}
                  </p>
                  <Select onValueChange={setPaySelectedMethod} value={paySelectedMethod}>
                    <SelectTrigger className="bg-secondary border-border text-foreground font-body text-sm">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {activePayMethods.map(m => (
                        <SelectItem key={m.id} value={m.name} className="text-foreground font-body">{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handlePaySelected} disabled={!paySelectedMethod || paySelectedBusy}
                      className="flex-1 font-display text-xs tracking-wider gap-1 min-h-[40px]">
                      <Check className="w-3.5 h-3.5" /> {paySelectedBusy ? 'Processing...' : 'Confirm Payment'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowPaySelected(false); setPaySelectedMethod(''); }}
                      className="font-display text-xs tracking-wider min-h-[40px]">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {unpaidOrders.map(o => {
            const items = Array.isArray(o.items) ? o.items : [];
            const isChargedToRoom = o.payment_type === 'Charge to Room';
            const isEditing = editingOrderId === o.id;
            const isSelectable = !isChargedToRoom && !readOnly;
            return (
              <div key={o.id} className="border border-border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isSelectable && (
                      <Checkbox
                        checked={selectedOrderIds.has(o.id)}
                        onCheckedChange={() => toggleOrderSelection(o.id)}
                        className="shrink-0"
                      />
                    )}
                    <span className="font-body text-xs text-muted-foreground truncate">
                      {format(new Date(o.created_at), 'MMM d h:mma')} · {o.staff_name || '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${orderStatusColor(o.status)}`}>{o.status}</Badge>
                    {isChargedToRoom && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Room</Badge>}
                  </div>
                </div>
                <p className="font-body text-xs text-foreground">
                  {items.map((i: any) => `${i.qty || 1}× ${i.name}`).join(', ')}
                </p>
                {/* Service charge breakdown */}
                <div className="font-body text-[10px] text-muted-foreground">
                  Subtotal: ₱{Number(o.total || 0).toLocaleString()} · SC 10%: ₱{Number(o.service_charge || 0).toLocaleString()} · <span className="text-foreground font-medium">Total: ₱{(Number(o.total || 0) + Number(o.service_charge || 0)).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <span className="font-body text-xs text-muted-foreground">₱</span>
                      <Input type="number" value={editOrderAmount} onChange={e => setEditOrderAmount(e.target.value)}
                        className="h-7 w-24 text-xs bg-secondary border-border" autoFocus />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400" onClick={() => handleEditOrderSave(o.id)}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setEditingOrderId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <span className="font-display text-sm text-foreground">₱{Number(o.total).toLocaleString()}</span>
                  )}
                  {!readOnly && !isEditing && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditingOrderId(o.id); setEditOrderAmount(String(o.total)); }}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3 h-3" />
                      </Button>
                      {o.status === 'Served' && !isChargedToRoom && (
                        <Button size="sm" variant="ghost" onClick={() => handleMarkPaidOrder(o.id)}
                          className="h-7 px-2 text-xs text-green-400 hover:text-green-300">
                          <DollarSign className="w-3 h-3 mr-0.5" /> Paid
                        </Button>
                      )}
                      {isChargedToRoom && (
                        <Button size="sm" variant="ghost" onClick={async () => {
                          await supabase.from('orders').update({ status: 'Paid', payment_type: 'Cash', closed_at: new Date().toISOString() }).eq('id', o.id);
                          await supabase.from('room_transactions').delete().eq('order_id', o.id);
                          await logAudit('updated', 'orders', o.id, `Collected room charge payment by ${staffName}`);
                          qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
                          qc.invalidateQueries({ queryKey: ['room-transactions', unit.id] });
                          toast.success('Payment collected — removed from room folio');
                        }} className="h-7 px-2 text-xs text-green-400 hover:text-green-300">
                          <DollarSign className="w-3 h-3 mr-0.5" /> Collect Now
                        </Button>
                      )}
                      {!isChargedToRoom && (
                        <Button size="sm" variant="ghost" onClick={() => handleCompOrder(o.id)}
                          className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300">
                          <Gift className="w-3 h-3 mr-1" /> Comp
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteOrder(o.id)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ SECTION: Paid F&B Orders ═══ */}
      {paidOrders.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" /> Paid F&B Orders
          </p>
          {paidOrders.map(o => {
            const items = Array.isArray(o.items) ? o.items : [];
            const isChargedToRoom = o.payment_type === 'Charge to Room';
            return (
              <div key={o.id} className="border border-border/40 rounded-lg p-3 space-y-1.5 opacity-70">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-xs text-muted-foreground">
                    {format(new Date(o.created_at), 'MMM d h:mma')} · {o.staff_name || '—'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Paid</Badge>
                    {isChargedToRoom && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Room</Badge>}
                  </div>
                </div>
                <p className="font-body text-xs text-foreground">
                  {items.map((i: any) => `${i.qty || 1}× ${i.name}`).join(', ')}
                </p>
                <div>
                  <span className="font-display text-sm text-muted-foreground">₱{(Number(o.total || 0) + Number(o.service_charge || 0)).toLocaleString()}</span>
                  <span className="font-body text-[10px] text-muted-foreground ml-1">(incl SC ₱{Number(o.service_charge || 0).toLocaleString()})</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ SECTION: Tours & Experiences ═══ */}
      {tours.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
            <Palmtree className="w-3.5 h-3.5" /> Tours & Experiences
          </p>
          {tours.map((t: any) => {
            const isEditingTour = editingTourId === t.id;
            return (
              <div key={t.id} className="border border-border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-sm text-foreground font-medium">{t.tour_name}</span>
                  <Badge variant="outline" className={`text-[10px] ${tourStatusColor(t.status)}`}>{t.status === 'completed' ? 'Charged' : t.status}</Badge>
                </div>
                <div className="flex gap-3 font-body text-xs text-muted-foreground">
                  <span>{t.tour_date}</span>
                  <span>{t.pax} pax</span>
                  {t.pickup_time && <span>Pickup: {t.pickup_time}</span>}
                  {t.provider && <span>{t.provider}</span>}
                </div>
                <div className="flex items-center justify-between">
                  {isEditingTour ? (
                    <div className="flex items-center gap-1">
                      <span className="font-body text-xs text-muted-foreground">₱</span>
                      <Input type="number" value={editTourAmount} onChange={e => setEditTourAmount(e.target.value)}
                        className="h-7 w-24 text-xs bg-secondary border-border" autoFocus />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400" onClick={() => handleEditTourSave(t.id)}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setEditingTourId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <span className="font-display text-sm text-foreground">
                      {Number(t.price) > 0 ? `₱${Number(t.price).toLocaleString()}` : 'Free'}
                    </span>
                  )}
                  {!readOnly && !isEditingTour && t.status !== 'cancelled' && (
                    <div className="flex items-center gap-1">
                      {/* Edit price */}
                      <Button size="sm" variant="ghost" onClick={() => { setEditingTourId(t.id); setEditTourAmount(String(t.price)); }}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3 h-3" />
                      </Button>
                      {/* Complete */}
                      {t.status !== 'completed' && (
                        <Button size="sm" variant="ghost" onClick={() => handleCompleteTour(t.id)}
                          className="h-7 px-2 text-xs text-green-400 hover:text-green-300">
                          <CheckCircle className="w-3 h-3 mr-0.5" /> Done
                        </Button>
                      )}
                      {t.status !== 'completed' && (
                        <Button size="sm" variant="ghost" onClick={() => handleCancelTour(t.id)}
                          className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300">
                          Cancel
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteTour(t.id)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ SECTION: Transport & Rentals ═══ */}
      {requests.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" /> Transport & Rentals
          </p>
          {requests.map((r: any) => {
            const icon = r.request_type === 'Transport' ? <Truck className="w-3.5 h-3.5 text-blue-400" />
              : r.request_type === 'Rental' ? <Bike className="w-3.5 h-3.5 text-purple-400" />
              : <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
            return (
              <div key={r.id} className="border border-border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-sm text-foreground font-medium flex items-center gap-1.5">
                    {icon} {r.request_type}
                  </span>
                  <Badge variant="outline" className={`text-[10px] ${tourStatusColor(r.status)}`}>{r.status === 'completed' ? 'Charged' : r.status}</Badge>
                </div>
                <p className="font-body text-xs text-muted-foreground">{r.details}</p>
                <div className="flex items-center justify-between">
                  <span className="font-body text-[11px] text-muted-foreground">
                    {format(new Date(r.created_at), 'MMM d h:mma')}
                  </span>
                  {!readOnly && r.status !== 'cancelled' && (
                    <div className="flex items-center gap-1">
                      {/* Complete */}
                      {r.status !== 'completed' && (
                        <Button size="sm" variant="ghost" onClick={() => handleCompleteRequest(r.id)}
                          className="h-7 px-2 text-xs text-green-400 hover:text-green-300">
                          <CheckCircle className="w-3 h-3 mr-0.5" /> Done
                        </Button>
                      )}
                      {r.status !== 'completed' && (
                        <Button size="sm" variant="ghost" onClick={() => handleCancelRequest(r.id)}
                          className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300">
                          Cancel
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteRequest(r.id)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(unpaidOrders.length > 0 || tours.length > 0 || requests.length > 0) && <Separator />}

      {/* ═══ SECTION: Room Transactions (Ledger) ═══ */}
      <div className="space-y-2">
        <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" /> Room Ledger
        </p>
        {visibleTransactions.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground text-center py-4">No transactions yet</p>
        ) : (
          visibleTransactions.map(t => {
            const isEditingThisTx = editingTxId === t.id;
            return (
              <div key={t.id} className={`border rounded-lg p-3 space-y-1 ${t.transaction_type === 'accommodation' ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-xs text-muted-foreground">
                      {format(new Date(t.created_at), 'MMM d h:mma')} · {t.staff_name}
                    </p>
                    <p className="font-display text-sm text-foreground capitalize flex items-center gap-1.5">
                      {t.transaction_type === 'accommodation' && '🏠 '}
                      {t.transaction_type.replace('_', ' ')}
                    </p>
                    {t.notes && <p className="font-body text-xs text-muted-foreground truncate">{t.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isEditingThisTx ? (
                      <div className="flex items-center gap-1">
                        <span className="font-body text-xs text-muted-foreground">₱</span>
                        <Input type="number" value={editTxAmount} onChange={e => setEditTxAmount(e.target.value)}
                          className="h-7 w-24 text-xs bg-secondary border-border" autoFocus />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400" onClick={() => handleEditTxSave(t.id)}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setEditingTxId(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className={`font-display text-sm ${t.total_amount > 0 ? 'text-foreground' : 'text-green-400'}`}>
                          {t.total_amount > 0 ? '' : '-'}₱{Math.abs(t.total_amount).toLocaleString()}
                        </p>
                        {!readOnly && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditingTxId(t.id); setEditTxAmount(String(t.total_amount)); }}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteTx(t.id, t.transaction_type, t.total_amount)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {!isEditingThisTx && (t.tax_amount !== 0 || t.service_charge_amount !== 0) && (
                  <p className="font-body text-[10px] text-muted-foreground">
                    Sub: ₱{Math.abs(t.amount).toLocaleString()} · Tax: ₱{Math.abs(t.tax_amount).toLocaleString()} · SC: ₱{Math.abs(t.service_charge_amount).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <Separator />

      {/* ═══ Summary ═══ */}
      <div className="space-y-1.5">
        <div className="flex justify-between font-body text-sm">
          <span className="text-muted-foreground">Room Charges</span>
          <span className="text-foreground">₱{totalCharges.toLocaleString()}</span>
        </div>
        {unpaidOrdersTotal > 0 && (
          <>
            <div className="flex justify-between font-body text-sm">
              <span className="text-muted-foreground">Unpaid F&B (Subtotal)</span>
              <span className="text-amber-400">₱{unpaidOrdersSubtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-body text-sm">
              <span className="text-muted-foreground">Service Charges (10%)</span>
              <span className="text-amber-400">₱{unpaidOrdersSCTotal.toLocaleString()}</span>
            </div>
          </>
        )}
        <div className="flex justify-between font-body text-sm">
          <span className="text-muted-foreground">Total Payments</span>
          <span className="text-green-400">₱{totalPayments.toLocaleString()}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-display text-lg tracking-wider">
          <span className="text-foreground">Balance</span>
          <span className={balance > 0 ? 'text-destructive' : 'text-green-400'}>
            ₱{Math.abs(balance).toLocaleString()}
          </span>
        </div>
      </div>

      {/* ═══ Modals ═══ */}
      {!readOnly && (
        <>
          <AddPaymentModal open={showPayment} onOpenChange={setShowPayment}
            unitId={unit.id} unitName={unit.name} guestName={guestName}
            bookingId={booking?.id || null} currentBalance={balance} />
          <AdjustmentModal open={showAdjustment} onOpenChange={setShowAdjustment}
            unitId={unit.id} unitName={unit.name} guestName={guestName}
            bookingId={booking?.id || null} transactions={transactions} />
          {booking && (
            <CheckoutModal open={showCheckout} onOpenChange={setShowCheckout}
              unitId={unit.id} unitName={unit.name} guestName={guestName}
              bookingId={booking.id} booking={booking} transactions={transactions}
              roomTypeId={(unit as any).room_type_id || null} />
          )}

          {/* Settlement Block Modal — shown when folio balance > 0 at checkout */}
          <Dialog open={showSettlementBlock} onOpenChange={setShowSettlementBlock}>
            <DialogContent className="bg-card border-border max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display tracking-wider flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4" /> Outstanding Balance
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="font-body text-sm text-muted-foreground">
                  This folio has an outstanding balance. Please settle all charges before checking out.
                </p>

                {/* All room ledger charges (accommodation, room_charge, tours posted to ledger, adjustments, etc.) */}
                {charges.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Room Ledger</p>
                    {charges.map(t => (
                      <div key={t.id} className="flex justify-between font-body text-sm">
                        <span className="text-muted-foreground truncate flex-1">{t.notes || t.transaction_type}</span>
                        <span className="text-foreground">₱{t.total_amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unpaid F&B orders not yet on the ledger */}
                {unpaidOrders.filter(o => o.payment_type !== 'Charge to Room').length > 0 && (
                  <div className="space-y-1">
                    <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Unpaid F&B Orders</p>
                    {unpaidOrders.filter(o => o.payment_type !== 'Charge to Room').map(o => {
                      const items = Array.isArray(o.items) ? o.items : [];
                      return (
                        <div key={o.id} className="flex justify-between font-body text-sm">
                          <span className="text-muted-foreground truncate flex-1">
                            {items.map((i: any) => `${i.qty || 1}× ${i.name}`).join(', ') || 'F&B Order'}
                          </span>
                          <span className="text-foreground">₱{(Number(o.total || 0) + Number(o.service_charge || 0)).toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Active tours with a price */}
                {tours.filter((t: any) => t.status !== 'cancelled' && t.status !== 'completed' && Number(t.price) > 0).length > 0 && (
                  <div className="space-y-1">
                    <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Active Tours</p>
                    {tours.filter((t: any) => t.status !== 'cancelled' && t.status !== 'completed' && Number(t.price) > 0).map((t: any) => (
                      <div key={t.id} className="flex justify-between font-body text-sm">
                        <span className="text-muted-foreground truncate flex-1">{t.tour_name}</span>
                        <span className="text-foreground">₱{Number(t.price).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Active requests with a price */}
                {requests.filter((r: any) => r.status !== 'cancelled' && r.status !== 'completed' && Number(r.price) > 0).length > 0 && (
                  <div className="space-y-1">
                    <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Active Requests</p>
                    {requests.filter((r: any) => r.status !== 'cancelled' && r.status !== 'completed' && Number(r.price) > 0).map((r: any) => (
                      <div key={r.id} className="flex justify-between font-body text-sm">
                        <span className="text-muted-foreground truncate flex-1">{r.request_type}</span>
                        <span className="text-foreground">₱{Number(r.price).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="flex justify-between font-display text-base tracking-wider">
                  <span className="text-foreground">Total Outstanding</span>
                  <span className="text-destructive">₱{balance.toLocaleString()}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowSettlementBlock(false)} className="font-display text-xs tracking-wider">
                  Cancel
                </Button>
                <Button onClick={() => { setShowSettlementBlock(false); setShowPayment(true); }} className="font-display text-xs tracking-wider">
                  Settle Now
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default RoomBillingTab;
