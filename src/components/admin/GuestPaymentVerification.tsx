import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getStaffSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CheckCircle2, XCircle, Receipt } from 'lucide-react';
import { toast } from 'sonner';

const methodLabel: Record<string, string> = { stripe: 'Stripe (card)', gcash: 'GCash', qrph: 'QRPH' };

const GuestPaymentVerification = () => {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data: submissions = [] } = useQuery({
    queryKey: ['guest-payment-submissions'],
    queryFn: async () => {
      const { data } = await (supabase.from('guest_payment_submissions') as any)
        .select('*').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
    refetchInterval: 20000,
  });

  const review = async (row: any, status: 'verified' | 'rejected') => {
    setBusy(row.id);
    const staff = getStaffSession();
    const reviewer = staff?.name || staff?.display_name || 'Admin';
    try {
      const { error } = await (supabase.from('guest_payment_submissions') as any).update({
        status,
        reviewed_by: reviewer,
        reviewed_at: new Date().toISOString(),
        review_notes: notes[row.id] || '',
      }).eq('id', row.id);
      if (error) throw error;

      if (status === 'verified' && Number(row.amount) > 0) {
        // Post the payment to the room ledger so the guest bill balance drops
        await (supabase.from('room_transactions') as any).insert({
          unit_id: row.room_id || null,
          unit_name: row.unit_name || '',
          guest_name: row.guest_name || '',
          booking_id: row.booking_id || null,
          transaction_type: 'payment',
          amount: -Math.abs(Number(row.amount)),
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: -Math.abs(Number(row.amount)),
          payment_method: methodLabel[row.method] || row.method,
          staff_name: reviewer,
          notes: row.reference ? `Guest payment ref ${row.reference}` : 'Guest portal payment',
        });
      }
      qc.invalidateQueries({ queryKey: ['guest-payment-submissions'] });
      toast.success(status === 'verified' ? 'Payment verified and posted to the bill' : 'Payment rejected');
    } catch (e: any) {
      toast.error(e.message || 'Could not update payment');
    } finally {
      setBusy(null);
    }
  };

  const pending = submissions.filter((s: any) => s.status === 'pending');
  const reviewed = submissions.filter((s: any) => s.status !== 'pending');

  const Card = ({ s }: { s: any }) => (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-body text-sm text-foreground">{s.guest_name || 'Guest'} · {s.unit_name || '—'}</p>
          <p className="font-body text-xs text-muted-foreground">
            {new Date(s.created_at).toLocaleString()} · {methodLabel[s.method] || s.method}
            {s.reference ? ` · Ref ${s.reference}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="font-body text-sm text-foreground font-medium">₱{Number(s.amount || 0).toLocaleString()}</p>
          <Badge variant="outline" className={`text-[10px] ${s.status === 'pending' ? 'border-amber-500/40 text-amber-400'
            : s.status === 'verified' ? 'border-emerald-500/40 text-emerald-400' : 'border-destructive/40 text-destructive'}`}>
            {s.status}
          </Badge>
        </div>
      </div>
      <p className="font-body text-[11px] text-muted-foreground">
        {s.agreed_to_charges ? `✓ Guest agreed to all charges${s.agreed_at ? ` on ${new Date(s.agreed_at).toLocaleString()}` : ''}` : '⚠ No agreement recorded'}
      </p>
      {s.proof_image && (
        <a href={s.proof_image} target="_blank" rel="noreferrer">
          <img src={s.proof_image} alt="Proof of payment" className="max-h-48 rounded border border-border" />
        </a>
      )}
      {s.status === 'pending' ? (
        <div className="space-y-2">
          <Input value={notes[s.id] || ''} onChange={e => setNotes(n => ({ ...n, [s.id]: e.target.value }))}
            placeholder="Review note (optional)" className="bg-secondary border-border text-foreground font-body" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy === s.id} onClick={() => review(s, 'verified')} className="font-display tracking-wider flex-1">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Verify & post
            </Button>
            <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => review(s, 'rejected')} className="font-body text-destructive">
              <XCircle className="w-3 h-3 mr-1" /> Reject
            </Button>
          </div>
        </div>
      ) : (
        <p className="font-body text-[11px] text-muted-foreground">
          {s.reviewed_by ? `Reviewed by ${s.reviewed_by}` : ''}{s.review_notes ? ` — ${s.review_notes}` : ''}
        </p>
      )}
    </div>
  );

  return (
    <section>
      <h3 className="font-display text-sm tracking-wider text-foreground mb-1 flex items-center gap-2">
        <Receipt className="w-4 h-4" /> Guest Payment Verification
      </h3>
      <p className="font-body text-xs text-muted-foreground mb-4">
        Approve guest payments before check-out. Verified payments post to the room bill automatically.
      </p>
      {submissions.length === 0 && <p className="font-body text-sm text-muted-foreground">No guest payments submitted yet.</p>}
      <div className="space-y-3">
        {pending.map((s: any) => <Card key={s.id} s={s} />)}
        {reviewed.length > 0 && <p className="font-display text-xs tracking-wider text-muted-foreground uppercase pt-2">History</p>}
        {reviewed.map((s: any) => <Card key={s.id} s={s} />)}
      </div>
    </section>
  );
};

export default GuestPaymentVerification;
