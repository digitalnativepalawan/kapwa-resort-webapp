import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/auditLog';
import { openWhatsApp } from '@/lib/messenger';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { RoomTransaction } from '@/hooks/useRoomTransactions';

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  unitName: string;
  guestName: string | null;
  bookingId: string | null;
  booking: any;
  transactions: RoomTransaction[];
  roomTypeId: string | null;
}

const CheckoutModal = ({ open, onOpenChange, unitId, unitName, guestName, bookingId, booking, transactions, roomTypeId }: CheckoutModalProps) => {
  const qc = useQueryClient();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const active = paymentMethods.filter(m => m.is_active && m.name !== 'Charge to Room');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedHousekeeper, setSelectedHousekeeper] = useState('');
  const [overrideChecklist, setOverrideChecklist] = useState(false);

  // Fetch ALL orders for this room (paid and unpaid)
  const { data: allRoomOrders = [] } = useQuery({
    queryKey: ['checkout-all-room-orders', unitId],
    enabled: open && !!unitId,
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, total, guest_name, status, payment_type, created_at, items')
        .eq('room_id', unitId)
        .order('created_at', { ascending: true });
      return data || [];
    },
  });

  const unpaidOrders = allRoomOrders.filter((o: any) => ['New', 'Preparing', 'Ready', 'Served'].includes(o.status));
  const paidOrders = allRoomOrders.filter((o: any) => o.status === 'Paid');

  // Check for unserved orders (not yet "Served")
  const { data: unservedOrders = [] } = useQuery({
    queryKey: ['checkout-unserved-orders', unitId],
    enabled: open && !!unitId,
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, status')
        .eq('room_id', unitId)
        .in('status', ['New', 'Preparing', 'Ready']);
      return data || [];
    },
  });

  // Check incomplete tours
  const { data: incompleteTours = [] } = useQuery({
    queryKey: ['checkout-incomplete-tours', bookingId],
    enabled: open && !!bookingId,
    queryFn: async () => {
      const { data } = await (supabase.from('guest_tours') as any)
        .select('id, tour_name, status, price')
        .eq('booking_id', bookingId)
        .in('status', ['booked', 'confirmed']);
      return data || [];
    },
  });

  // Check incomplete requests
  const { data: incompleteRequests = [] } = useQuery({
    queryKey: ['checkout-incomplete-requests', bookingId],
    enabled: open && !!bookingId,
    queryFn: async () => {
      const { data } = await (supabase.from('guest_requests') as any)
        .select('id, request_type, status, price')
        .eq('booking_id', bookingId)
        .in('status', ['pending', 'confirmed']);
      return data || [];
    },
  });

  // Check housekeeping clearance — also create pre_inspection order if none exists
  const { data: hkOrder, refetch: refetchHk } = useQuery({
    queryKey: ['checkout-hk-clearance', unitName],
    enabled: open && !!unitName,
    queryFn: async () => {
      // Check for existing active HK order
      const { data: existing } = await (supabase.from('housekeeping_orders') as any)
        .select('id, status, damage_notes, inspection_by_name')
        .eq('unit_name', unitName)
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) return existing as any;

      // Auto-create a pre_inspection order when checkout modal opens
      const { data: newOrder } = await (supabase.from('housekeeping_orders') as any)
        .insert({
          unit_name: unitName,
          room_type_id: roomTypeId || null,
          status: 'pre_inspection',
        })
        .select('id, status, damage_notes, inspection_by_name')
        .single();
      return newOrder as any;
    },
  });

  // Check guest bill agreement
  const { data: billAgreement } = useQuery({
    queryKey: ['checkout-bill-agreement', bookingId],
    enabled: open && !!bookingId,
    queryFn: async () => {
      const { data } = await supabase.from('resort_ops_bookings').select('bill_agreed_at').eq('id', bookingId!).maybeSingle();
      return data as any;
    },
  });


  // Fetch housekeeping employees
  const { data: hkEmployees = [] } = useQuery({
    queryKey: ['housekeeping-employees'],
    queryFn: async () => {
      const { data: perms } = await supabase.from('employee_permissions')
        .select('employee_id')
        .like('permission', 'housekeeping%');
      const hkIds = new Set((perms || []).map((p: any) => p.employee_id));
      const { data: emps } = await supabase.from('employees')
        .select('id, name, display_name, whatsapp_number, preferred_contact_method')
        .eq('active', true)
        .order('name');
      const all = (emps || []) as any[];
      const filtered = all.filter(e => hkIds.has(e.id));
      return filtered.length > 0 ? filtered : all;
    },
  });

  const otaPlatforms = ['booking.com', 'airbnb', 'agoda', 'expedia', 'hostelworld', 'trip.com'];
  const isOtaStay = booking?.platform && otaPlatforms.includes(booking.platform.toLowerCase());
  const visibleTransactions = isOtaStay ? transactions.filter(t => t.transaction_type !== 'accommodation') : transactions;
  const charges = visibleTransactions.filter(t => t.total_amount > 0);
  const payments = visibleTransactions.filter(t => t.total_amount < 0);
  const totalCharges = charges.reduce((s, t) => s + t.total_amount, 0);
  const totalPayments = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));
  const paidFnbTotal = paidOrders.reduce((s, o: any) => s + (o.total || 0), 0);
  const unpaidTotal = unpaidOrders.reduce((s, o: any) => s + (o.total || 0), 0);
  // Include pending tours/requests in balance (completed ones are already on the ledger)
  const pendingToursTotal = incompleteTours.reduce((s: number, t: any) => s + Number(t.price || 0), 0);
  const pendingRequestsTotal = incompleteRequests.reduce((s: number, r: any) => s + Number(r.price || 0), 0);
  const balance = totalCharges - totalPayments + unpaidTotal + pendingToursTotal + pendingRequestsTotal;

  const nights = booking ? Math.max(1, Math.ceil((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000)) : 0;
  const roomRate = booking ? Number(booking.room_rate) : 0;

  // Checklist items
  const allOrdersServed = unservedOrders.length === 0;
  const allToursCompleted = incompleteTours.length === 0;
  const allRequestsCompleted = incompleteRequests.length === 0;
  const guestAgreed = !!billAgreement?.bill_agreed_at;
  const checklistPassed = allOrdersServed && allToursCompleted && allRequestsCompleted;

  const handleCheckout = async () => {
    setSubmitting(true);
    try {
      const finalAmount = parseFloat(paymentAmount) || 0;
      if (finalAmount > 0 && paymentMethod) {
        await (supabase.from('room_transactions' as any) as any).insert({
          unit_id: unitId,
          unit_name: unitName,
          guest_name: guestName,
          booking_id: bookingId,
          transaction_type: 'payment',
          amount: -finalAmount,
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: -finalAmount,
          payment_method: paymentMethod,
          staff_name: localStorage.getItem('emp_name') || 'Staff',
          notes: 'Final checkout payment',
        });
      }

      // Batch-settle ALL unpaid room orders
      if (unpaidOrders.length > 0) {
        const orderIds = unpaidOrders.map((o: any) => o.id);
        await supabase.from('orders')
          .update({ status: 'Paid', closed_at: new Date().toISOString() })
          .in('id', orderIds);
      }

      if (bookingId) {
        const today = new Date().toISOString().split('T')[0];
        await supabase.from('resort_ops_bookings').update({
          check_out: today,
          checked_out_at: new Date().toISOString(),
        } as any).eq('id', bookingId);
      }

      await supabase.from('units').update({ status: 'to_clean' } as any).eq('id', unitId);

      // Telegram notification
      import('@/lib/telegram').then(({ notifyTelegram }) => {
        notifyTelegram('reception,managers', `🚪 Check-out\n${guestName || 'Guest'} - ${unitName}`);
      });

      // Transition existing HK order to 'cleaning' (post-checkout phase)
      const hkEmployee = hkEmployees.find((e: any) => e.id === selectedHousekeeper);

      if (hkOrder?.id) {
        await (supabase.from('housekeeping_orders' as any) as any).update({
          status: 'cleaning',
          assigned_to: selectedHousekeeper || hkOrder.assigned_to || null,
          accepted_by: selectedHousekeeper || hkOrder.accepted_by || null,
          accepted_by_name: hkEmployee ? (hkEmployee.display_name || hkEmployee.name) : (hkOrder.accepted_by_name || ''),
          accepted_at: selectedHousekeeper ? new Date().toISOString() : (hkOrder.accepted_at || null),
        }).eq('id', hkOrder.id);
      } else {
        // Fallback: create new cleaning order
        await (supabase.from('housekeeping_orders' as any) as any).insert({
          unit_name: unitName,
          room_type_id: roomTypeId || null,
          status: 'cleaning',
          assigned_to: selectedHousekeeper || null,
          accepted_by: selectedHousekeeper || null,
          accepted_by_name: hkEmployee ? (hkEmployee.display_name || hkEmployee.name) : '',
          accepted_at: selectedHousekeeper ? new Date().toISOString() : null,
        });
      }

      // Send WhatsApp notification to assigned housekeeper
      if (hkEmployee && hkEmployee.whatsapp_number) {
        const staffName = localStorage.getItem('emp_name') || 'Reception';
        const msg = `🧹 *Room ${unitName} needs cleaning*\n\nGuest "${guestName || 'Guest'}" has checked out.\nAssigned to you by ${staffName}.\n\nPlease start when ready.`;
        openWhatsApp(hkEmployee.whatsapp_number, msg);
      }

      // Cancel any pending guest requests & tours for this booking
      if (bookingId) {
        await (supabase.from('guest_requests' as any) as any)
          .update({ status: 'cancelled' })
          .eq('booking_id', bookingId)
          .eq('status', 'pending');
        await (supabase.from('guest_tours' as any) as any)
          .update({ status: 'cancelled' })
          .eq('booking_id', bookingId)
          .eq('status', 'pending');
      }

      await logAudit('updated', 'units', unitId, `Checkout completed for ${guestName || 'Guest'} in ${unitName}${hkEmployee ? ` — assigned to ${hkEmployee.display_name || hkEmployee.name}` : ''}`);

      qc.invalidateQueries({ queryKey: ['room-transactions', unitId] });
      qc.invalidateQueries({ queryKey: ['billing-room-orders'] });
      qc.invalidateQueries({ queryKey: ['service-orders'] });
      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['morning-briefing'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      qc.invalidateQueries({ queryKey: ['all-requests-experiences'] });
      qc.invalidateQueries({ queryKey: ['all-tours-experiences'] });
      qc.invalidateQueries({ queryKey: ['tour-bookings-experiences'] });
      qc.invalidateQueries({ queryKey: ['reception-guest-requests'] });
      qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
      qc.invalidateQueries({ queryKey: ['reception-tours-today'] });
      qc.invalidateQueries({ queryKey: ['occupied-guests'] });
      toast.success(`Checkout complete${hkEmployee ? ` — ${hkEmployee.display_name || hkEmployee.name} notified` : ''}`);
      onOpenChange(false);
    } catch {
      toast.error('Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider">Checkout — {unitName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">

          {/* ── Pre-Checkout Checklist ── */}
          <div className="border border-border rounded-lg p-3 space-y-2">
            <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Pre-Checkout Checklist</p>
            <ChecklistItem ok={allOrdersServed} label="All orders served & settled" detail={!allOrdersServed ? `${unservedOrders.length} order(s) not yet served` : undefined} />
            <ChecklistItem ok={allToursCompleted} label="Tours & experiences completed" detail={!allToursCompleted ? `${incompleteTours.length} tour(s) still active` : undefined} />
            <ChecklistItem ok={allRequestsCompleted} label="Guest requests completed" detail={!allRequestsCompleted ? `${incompleteRequests.length} request(s) still active` : undefined} />
            <ChecklistItem ok={guestAgreed} label="Guest reviewed & agreed to bill" detail={guestAgreed ? `Agreed ${new Date(billAgreement.bill_agreed_at).toLocaleString()}` : 'Not yet agreed on portal'} isWarning />
            <ChecklistItem
              ok={hkOrder?.status === 'inspection_cleared'}
              label="Housekeeping pre-checkout inspection"
              detail={
                hkOrder?.status === 'inspection_cleared'
                  ? `✅ Cleared by ${hkOrder.inspection_by_name || 'staff'}${hkOrder.damage_notes ? ` — Notes: ${hkOrder.damage_notes}` : ''}`
                  : hkOrder?.status === 'pre_inspection'
                  ? '⏳ Waiting for housekeeper to inspect'
                  : 'Pending'
              }
              isWarning={hkOrder?.status === 'pre_inspection'}
            />

            {!checklistPassed && !overrideChecklist && (
              <Button size="sm" variant="outline" onClick={() => setOverrideChecklist(true)}
                className="font-display text-xs tracking-wider w-full mt-2">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Override & Continue
              </Button>
            )}
          </div>

          {/* Unpaid F&B Orders */}
          {unpaidOrders.length > 0 && (
            <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2">
              <p className="font-display text-xs tracking-wider text-amber-400 uppercase flex items-center gap-1">
                🍽 {unpaidOrders.length} Unsettled Order{unpaidOrders.length > 1 ? 's' : ''} — ₱{unpaidTotal.toLocaleString()}
              </p>
              <p className="font-body text-xs text-muted-foreground">These will be settled automatically at checkout.</p>
              {unpaidOrders.map((o: any) => {
                const items = Array.isArray(o.items) ? o.items : [];
                return (
                  <div key={o.id} className="flex justify-between items-center bg-secondary/50 rounded p-2">
                    <div>
                      <p className="font-body text-xs text-foreground">
                        {items.map((i: any) => `${i.qty || 1}× ${i.name}`).join(', ') || 'F&B Order'}
                      </p>
                      <p className="font-body text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                    </div>
                    <span className="font-display text-xs text-foreground">₱{(o.total || 0).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Guest info */}
          <div className="border border-border rounded-lg p-3 bg-secondary space-y-1">
            <p className="font-display text-sm text-foreground">{guestName || 'Guest'}</p>
            {booking && (
              <p className="font-body text-xs text-muted-foreground">
                {nights} night{nights !== 1 ? 's' : ''} · ₱{roomRate.toLocaleString()}/night
                {charges.some(t => t.transaction_type === 'accommodation') && (
                  <span className="text-emerald-400 ml-1">✓ Posted to ledger</span>
                )}
              </p>
            )}
          </div>

          {/* Charges summary */}
          <div className="space-y-1.5">
            <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Room Charges</p>
            {charges.map(t => (
              <div key={t.id} className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground truncate flex-1">{t.notes || t.transaction_type}</span>
                <span className="text-foreground">₱{t.total_amount.toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between font-display text-sm">
              <span className="text-foreground">Subtotal (Room)</span>
              <span className="text-foreground">₱{totalCharges.toLocaleString()}</span>
            </div>
          </div>

          {/* Settled F&B Orders */}
          {paidOrders.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">
                ✅ Settled F&B — ₱{paidFnbTotal.toLocaleString()}
              </p>
              {paidOrders.map((o: any) => {
                const items = Array.isArray(o.items) ? o.items : [];
                return (
                  <div key={o.id} className="flex justify-between items-center bg-secondary/50 rounded p-2">
                    <div>
                      <p className="font-body text-xs text-foreground">
                        {items.map((i: any) => `${i.qty || 1}× ${i.name}`).join(', ') || 'F&B Order'}
                      </p>
                      <p className="font-body text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                    </div>
                    <span className="font-display text-xs text-emerald-400">₱{(o.total || 0).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}

          {unpaidTotal > 0 && (
            <>
              <Separator />
              <div className="flex justify-between font-display text-sm">
                <span className="text-amber-400">Unsettled F&B</span>
                <span className="text-amber-400">₱{unpaidTotal.toLocaleString()}</span>
              </div>
            </>
          )}

          {/* Payments received */}
          <div className="space-y-1.5">
            <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Payments Received</p>
            {payments.map(t => (
              <div key={t.id} className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground truncate flex-1">{t.payment_method} — {t.staff_name}</span>
                <span className="text-emerald-400">₱{Math.abs(t.total_amount).toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between font-display text-sm">
              <span className="text-foreground">Total Paid</span>
              <span className="text-emerald-400">₱{totalPayments.toLocaleString()}</span>
            </div>
          </div>

          <Separator />

          <div className="flex justify-between font-display text-lg tracking-wider">
            <span className="text-foreground">Remaining Balance</span>
            <span className={balance > 0 ? 'text-destructive' : 'text-emerald-400'}>
              ₱{Math.abs(balance).toLocaleString()}
            </span>
          </div>

          {balance > 0 && (
            <div className="space-y-3 border border-border rounded-lg p-3">
              <p className="font-display text-xs tracking-wider text-foreground uppercase">Final Payment</p>
              <Select onValueChange={setPaymentMethod} value={paymentMethod}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                  <SelectValue placeholder="Payment method" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {active.map(m => (
                    <SelectItem key={m.id} value={m.name} className="text-foreground font-body">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                placeholder={`₱${balance.toLocaleString()}`}
                className="bg-secondary border-border text-foreground font-body" />
            </div>
          )}

          {/* Assign Housekeeper */}
          <div className="border border-accent/30 bg-accent/5 rounded-lg p-3 space-y-2">
            <p className="font-display text-xs tracking-wider text-accent uppercase">🧹 Assign Housekeeper</p>
            <Select onValueChange={setSelectedHousekeeper} value={selectedHousekeeper}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                <SelectValue placeholder="Select housekeeper (optional)" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {hkEmployees.map((e: any) => (
                  <SelectItem key={e.id} value={e.id} className="text-foreground font-body">
                    {e.display_name || e.name}
                    {e.whatsapp_number ? ' 📱' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedHousekeeper && (() => {
              const emp = hkEmployees.find((e: any) => e.id === selectedHousekeeper);
              return emp?.whatsapp_number ? (
                <p className="font-body text-xs text-emerald-400">✓ Will notify via WhatsApp on checkout</p>
              ) : (
                <p className="font-body text-xs text-muted-foreground">No WhatsApp number — assignment only</p>
              );
            })()}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-display text-xs tracking-wider">Cancel</Button>
          <Button 
            onClick={handleCheckout} 
            disabled={submitting || (!checklistPassed && !overrideChecklist)} 
            variant="destructive" 
            className="font-display text-xs tracking-wider"
          >
            {submitting ? 'Processing...' : 'Confirm Checkout'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Checklist row */
const ChecklistItem = ({ ok, label, detail, isWarning }: { ok: boolean; label: string; detail?: string; isWarning?: boolean }) => (
  <div className="flex items-start gap-2">
    {ok ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
    ) : isWarning ? (
      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
    ) : (
      <XCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
    )}
    <div>
      <p className={`font-body text-xs ${ok ? 'text-foreground' : isWarning ? 'text-amber-400' : 'text-destructive'}`}>{label}</p>
      {detail && <p className="font-body text-[10px] text-muted-foreground">{detail}</p>}
    </div>
  </div>
);

export default CheckoutModal;
