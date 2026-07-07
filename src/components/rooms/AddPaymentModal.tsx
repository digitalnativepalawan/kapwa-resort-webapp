import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/auditLog';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface AddPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  unitName: string;
  guestName: string | null;
  bookingId: string | null;
  currentBalance: number;
}

const AddPaymentModal = ({ open, onOpenChange, unitId, unitName, guestName, bookingId, currentBalance }: AddPaymentModalProps) => {
  const qc = useQueryClient();
  const { data: paymentMethods = [] } = usePaymentMethods();
  const active = paymentMethods.filter(m => m.is_active && m.name !== 'Charge to Room');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error('Enter a valid amount'); return; }
    if (!method) { toast.error('Select a payment method'); return; }
    setSubmitting(true);
    try {
      await (supabase.from('room_transactions' as any) as any).insert({
        unit_id: unitId,
        unit_name: unitName,
        guest_name: guestName,
        booking_id: bookingId,
        transaction_type: 'payment',
        amount: -val,
        tax_amount: 0,
        service_charge_amount: 0,
        total_amount: -val,
        payment_method: method,
        staff_name: localStorage.getItem('emp_name') || 'Staff',
        notes: notes.trim() || null,
      });
      await logAudit('created', 'room_transactions', unitId, `Payment ₱${val.toLocaleString()} via ${method} for ${unitName}`);
      qc.invalidateQueries({ queryKey: ['room-transactions', unitId] });
      toast.success('Payment recorded');
      setAmount(''); setMethod(''); setNotes('');
      onOpenChange(false);
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider">Add Payment — {unitName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="border border-border rounded-lg p-3 bg-secondary">
            <p className="font-body text-xs text-muted-foreground">Current Balance</p>
            <p className="font-display text-lg text-foreground">₱{currentBalance.toLocaleString()}</p>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Payment Amount</label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0" className="bg-secondary border-border text-foreground font-body mt-1" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Payment Method</label>
            <Select onValueChange={setMethod} value={method}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {active.map(m => (
                  <SelectItem key={m.id} value={m.name} className="text-foreground font-body">{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes" className="bg-secondary border-border text-foreground font-body mt-1" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-display text-xs tracking-wider">Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="font-display text-xs tracking-wider">
            {submitting ? 'Processing...' : 'Process Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddPaymentModal;
