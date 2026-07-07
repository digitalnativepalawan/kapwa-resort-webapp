import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/auditLog';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { RoomTransaction } from '@/hooks/useRoomTransactions';
import { format } from 'date-fns';

interface AdjustmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  unitName: string;
  guestName: string | null;
  bookingId: string | null;
  transactions: RoomTransaction[];
}

const ADJUSTMENT_TYPES = ['Discount', 'Void', 'Complimentary', 'Correction'] as const;

const QUICK_CHARGES = [
  { label: 'Accommodation', emoji: '🏠' },
  { label: 'Room Charge', emoji: '🛏' },
  { label: 'Experience', emoji: '🏄' },
  { label: 'Bar Tab', emoji: '🍹' },
  { label: 'Transport', emoji: '🚐' },
  { label: 'Laundry', emoji: '👕' },
  { label: 'Mini Bar', emoji: '🧃' },
];

const AdjustmentModal = ({ open, onOpenChange, unitId, unitName, guestName, bookingId, transactions }: AdjustmentModalProps) => {
  const qc = useQueryClient();
  // Show ALL positive transactions (not just room_charge)
  const allCharges = transactions.filter(t => t.total_amount > 0);
  const [adjType, setAdjType] = useState<string>('Discount');
  const [selectedTxId, setSelectedTxId] = useState('');
  const [reason, setReason] = useState('');
  const [managerName, setManagerName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Discount mode: percentage or fixed amount
  const [discountMode, setDiscountMode] = useState<'full' | 'percentage' | 'fixed'>('full');
  const [discountPct, setDiscountPct] = useState('');
  const [discountFixed, setDiscountFixed] = useState('');

  // Quick charge state
  const [mode, setMode] = useState<'adjustment' | 'charge'>('adjustment');
  const [chargeCategory, setChargeCategory] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeNote, setChargeNote] = useState('');

  const selectedTx = allCharges.find(t => t.id === selectedTxId);

  const computeAdjustmentAmount = (): number => {
    if (!selectedTx) return 0;
    if (discountMode === 'full') return -Math.abs(selectedTx.total_amount);
    if (discountMode === 'percentage') {
      const pct = parseFloat(discountPct);
      if (isNaN(pct) || pct <= 0 || pct > 100) return 0;
      return -Math.abs(selectedTx.total_amount * (pct / 100));
    }
    if (discountMode === 'fixed') {
      const amt = parseFloat(discountFixed);
      if (isNaN(amt) || amt <= 0) return 0;
      return -Math.min(amt, Math.abs(selectedTx.total_amount));
    }
    return 0;
  };

  const handleSubmitAdjustment = async () => {
    if (!selectedTxId) { toast.error('Select a transaction to adjust'); return; }
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    if (!selectedTx) return;

    const adjustmentAmount = computeAdjustmentAmount();
    if (adjustmentAmount === 0) { toast.error('Adjustment amount cannot be zero'); return; }

    setSubmitting(true);
    try {
      await (supabase.from('room_transactions' as any) as any).insert({
        unit_id: unitId,
        unit_name: unitName,
        guest_name: guestName,
        booking_id: bookingId,
        transaction_type: 'adjustment',
        order_id: selectedTx.order_id,
        amount: adjustmentAmount,
        tax_amount: 0,
        service_charge_amount: 0,
        total_amount: adjustmentAmount,
        payment_method: adjType,
        staff_name: localStorage.getItem('emp_name') || 'Staff',
        notes: `${adjType}${discountMode === 'percentage' ? ` (${discountPct}%)` : discountMode === 'fixed' ? ` (₱${discountFixed})` : ''}: ${reason.trim()}${managerName ? ` (Approved by: ${managerName})` : ''}`,
      });
      await logAudit('created', 'room_transactions', unitId,
        `${adjType} adjustment ₱${Math.abs(adjustmentAmount).toLocaleString()} for ${unitName} — ${reason.trim()}`);
      qc.invalidateQueries({ queryKey: ['room-transactions', unitId] });
      toast.success('Adjustment recorded');
      setSelectedTxId(''); setReason(''); setManagerName(''); setDiscountPct(''); setDiscountFixed(''); setDiscountMode('full');
      onOpenChange(false);
    } catch {
      toast.error('Failed to record adjustment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickCharge = async () => {
    if (!chargeAmount || !chargeCategory) { toast.error('Select a category and enter amount'); return; }
    const amt = parseFloat(chargeAmount);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid amount'); return; }

    setSubmitting(true);
    try {
      await (supabase.from('room_transactions' as any) as any).insert({
        unit_id: unitId,
        unit_name: unitName,
        guest_name: guestName,
        booking_id: bookingId,
        transaction_type: chargeCategory === 'Accommodation' ? 'accommodation' : 'room_charge',
        amount: amt,
        tax_amount: 0,
        service_charge_amount: 0,
        total_amount: amt,
        payment_method: 'Charge to Room',
        staff_name: localStorage.getItem('emp_name') || 'Staff',
        notes: `${chargeCategory}${chargeNote ? ': ' + chargeNote : ''}`,
      });
      await logAudit('created', 'room_transactions', unitId,
        `Quick charge ₱${amt.toLocaleString()} [${chargeCategory}] for ${unitName}`);
      qc.invalidateQueries({ queryKey: ['room-transactions', unitId] });
      toast.success('Charge added');
      setChargeAmount(''); setChargeNote(''); setChargeCategory('');
      onOpenChange(false);
    } catch {
      toast.error('Failed to add charge');
    } finally {
      setSubmitting(false);
    }
  };

  const previewAmount = computeAdjustmentAmount();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-sm">Billing — {unitName}</DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex border border-border rounded-lg overflow-hidden">
          <button onClick={() => setMode('charge')}
            className={`flex-1 py-2 font-display text-xs tracking-wider transition-colors ${mode === 'charge' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
            + Add Charge
          </button>
          <button onClick={() => setMode('adjustment')}
            className={`flex-1 py-2 font-display text-xs tracking-wider transition-colors ${mode === 'adjustment' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
            Adjustment / Void
          </button>
        </div>

        {mode === 'charge' && (
          <div className="space-y-4">
            <div>
              <label className="font-body text-xs text-muted-foreground">Charge Category</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {QUICK_CHARGES.map(c => (
                  <button key={c.label} onClick={() => setChargeCategory(c.label)}
                    className={`py-2.5 border rounded-lg font-body text-xs transition-colors text-center ${chargeCategory === c.label ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
                    <span className="block text-base">{c.emoji}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Amount (₱)</label>
              <Input type="number" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)}
                placeholder="0.00" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Note (optional)</label>
              <Textarea value={chargeNote} onChange={e => setChargeNote(e.target.value)}
                placeholder="Description or detail..." className="bg-secondary border-border text-foreground font-body mt-1" rows={2} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="font-display text-xs tracking-wider">Cancel</Button>
              <Button onClick={handleQuickCharge} disabled={submitting} className="font-display text-xs tracking-wider">
                {submitting ? 'Processing...' : 'Add Charge'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {mode === 'adjustment' && (
          <div className="space-y-4">
            <div>
              <label className="font-body text-xs text-muted-foreground">Adjustment Type</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {ADJUSTMENT_TYPES.map(t => (
                  <button key={t} onClick={() => setAdjType(t)}
                    className={`min-h-[44px] py-2 border font-display text-xs tracking-wider rounded transition-colors ${
                      adjType === t ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Select Charge to Adjust</label>
              <Select onValueChange={setSelectedTxId} value={selectedTxId}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1">
                  <SelectValue placeholder="Select a charge" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {allCharges.map(t => (
                    <SelectItem key={t.id} value={t.id} className="text-foreground font-body">
                      {format(new Date(t.created_at), 'MMM d h:mma')} — ₱{t.total_amount.toLocaleString()}
                      {' '}({t.transaction_type.replace('_', ' ')})
                      {t.notes ? ` · ${t.notes.slice(0, 25)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Discount mode selector */}
            {selectedTx && adjType === 'Discount' && (
              <div>
                <label className="font-body text-xs text-muted-foreground">Discount Amount</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <button onClick={() => setDiscountMode('full')}
                    className={`py-2 border rounded font-display text-xs tracking-wider transition-colors ${discountMode === 'full' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                    Full (100%)
                  </button>
                  <button onClick={() => setDiscountMode('percentage')}
                    className={`py-2 border rounded font-display text-xs tracking-wider transition-colors ${discountMode === 'percentage' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                    % Off
                  </button>
                  <button onClick={() => setDiscountMode('fixed')}
                    className={`py-2 border rounded font-display text-xs tracking-wider transition-colors ${discountMode === 'fixed' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                    ₱ Amount
                  </button>
                </div>
                {discountMode === 'percentage' && (
                  <Input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)}
                    placeholder="e.g. 10" className="bg-secondary border-border text-foreground font-body mt-2" max={100} min={1} />
                )}
                {discountMode === 'fixed' && (
                  <Input type="number" value={discountFixed} onChange={e => setDiscountFixed(e.target.value)}
                    placeholder="₱ amount" className="bg-secondary border-border text-foreground font-body mt-2" />
                )}
                {previewAmount !== 0 && (
                  <p className="font-body text-xs text-green-400 mt-1">
                    Adjustment: -₱{Math.abs(previewAmount).toLocaleString()} (from ₱{selectedTx.total_amount.toLocaleString()})
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="font-body text-xs text-muted-foreground">Reason (required)</label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Why is this adjustment needed?" className="bg-secondary border-border text-foreground font-body mt-1" rows={2} />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Manager Approval</label>
              <Input value={managerName} onChange={e => setManagerName(e.target.value)}
                placeholder="Manager name" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="font-display text-xs tracking-wider">Cancel</Button>
              <Button onClick={handleSubmitAdjustment} disabled={submitting} className="font-display text-xs tracking-wider">
                {submitting ? 'Processing...' : 'Process Adjustment'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AdjustmentModal;
