import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Smartphone, QrCode, Upload, CheckCircle2, Clock, XCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  bookingId: string | null;
  roomId: string | null;
  unitName: string;
  guestName: string;
  balance: number;
  billAgreedAt: string | null;
}

const fileToCompressedDataUrl = (file: File, maxSize = 1200): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Invalid image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

const GuestPaymentSection = ({ bookingId, roomId, unitName, guestName, balance, billAgreedAt }: Props) => {
  const qc = useQueryClient();
  const [method, setMethod] = useState<'stripe' | 'gcash' | 'qrph' | null>(null);
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const proofInput = useRef<HTMLInputElement>(null);

  const { data: settings } = useQuery({
    queryKey: ['guest-payment-settings'],
    queryFn: async () => {
      const { data } = await (supabase.from('guest_payment_settings') as any)
        .select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: mySubmissions = [] } = useQuery({
    queryKey: ['guest-my-payments', bookingId, unitName],
    queryFn: async () => {
      let q = (supabase.from('guest_payment_submissions') as any).select('*').order('created_at', { ascending: false });
      q = bookingId ? q.eq('booking_id', bookingId) : q.eq('unit_name', unitName);
      const { data } = await q;
      return data || [];
    },
    refetchInterval: 20000,
  });

  if (!settings) return null;
  const anyMethod = settings.stripe_enabled || settings.gcash_enabled || settings.qrph_enabled;
  if (!anyMethod) return null;

  const agreed = !!billAgreedAt;

  const pickProof = async (file: File | undefined) => {
    if (!file) return;
    try {
      setProof(await fileToCompressedDataUrl(file));
      toast.success('Proof attached');
    } catch {
      toast.error('Could not read that image');
    }
  };

  const submit = async () => {
    if (!method) return;
    if (!agreed) { toast.error('Please agree to your bill first'); return; }
    if (method !== 'stripe' && !proof && !reference.trim()) {
      toast.error('Add a reference number or upload your payment screenshot');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase.from('guest_payment_submissions') as any).insert({
        booking_id: bookingId,
        room_id: roomId,
        unit_name: unitName,
        guest_name: guestName,
        method,
        amount: Math.max(0, balance),
        reference: reference.trim(),
        proof_image: proof,
        agreed_to_charges: true,
        agreed_at: billAgreedAt,
      });
      if (error) throw error;
      setReference(''); setProof(''); setMethod(null);
      qc.invalidateQueries({ queryKey: ['guest-my-payments', bookingId, unitName] });
      toast.success('Payment submitted — reception will verify it shortly');
    } catch (e: any) {
      toast.error(e.message || 'Could not submit payment');
    } finally {
      setSubmitting(false);
    }
  };

  const MethodButton = ({ id, label, icon }: { id: 'stripe' | 'gcash' | 'qrph'; label: string; icon: React.ReactNode }) => (
    <button
      onClick={() => setMethod(method === id ? null : id)}
      className={`flex-1 flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
        method === id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'
      }`}
    >
      {icon}
      <span className="font-body text-xs text-foreground">{label}</span>
    </button>
  );

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Pay Your Bill</p>
      {settings.payment_instructions && (
        <p className="font-body text-xs text-muted-foreground">{settings.payment_instructions}</p>
      )}

      <div className="flex justify-between border-y border-border py-2">
        <span className="font-body text-sm text-muted-foreground">Amount due</span>
        <span className="font-body text-sm text-foreground font-medium">₱{Math.max(0, balance).toLocaleString()}</span>
      </div>

      {!agreed && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
          <Lock className="w-4 h-4 text-amber-400 mt-0.5" />
          <p className="font-body text-xs text-amber-400">
            Tap “I Agree to This Bill” below before paying. Payment options unlock once you agree to all charges.
          </p>
        </div>
      )}

      <div className={`space-y-3 ${agreed ? '' : 'opacity-50 pointer-events-none'}`}>
        <div className="flex gap-2">
          {settings.stripe_enabled && <MethodButton id="stripe" label="Card / Stripe" icon={<CreditCard className="w-5 h-5 text-primary" />} />}
          {settings.gcash_enabled && <MethodButton id="gcash" label="GCash" icon={<Smartphone className="w-5 h-5 text-blue-400" />} />}
          {settings.qrph_enabled && <MethodButton id="qrph" label="QRPH" icon={<QrCode className="w-5 h-5 text-emerald-400" />} />}
        </div>

        {method === 'stripe' && (
          <div className="space-y-2">
            {settings.stripe_instructions && <p className="font-body text-xs text-muted-foreground">{settings.stripe_instructions}</p>}
            {settings.stripe_link ? (
              <a href={settings.stripe_link} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full font-display tracking-wider">Open secure card payment</Button>
              </a>
            ) : (
              <p className="font-body text-xs text-muted-foreground">Please settle card payments at reception.</p>
            )}
          </div>
        )}

        {method === 'gcash' && (
          <div className="space-y-2">
            {settings.gcash_qr_image && <img src={settings.gcash_qr_image} alt="GCash QR code" className="w-48 h-48 object-contain mx-auto rounded border border-border bg-card" />}
            <p className="font-body text-xs text-muted-foreground text-center">
              {settings.gcash_account_name}{settings.gcash_number ? ` · ${settings.gcash_number}` : ''}
            </p>
          </div>
        )}

        {method === 'qrph' && (
          <div className="space-y-2">
            {settings.qrph_qr_image && <img src={settings.qrph_qr_image} alt="QRPH QR code" className="w-48 h-48 object-contain mx-auto rounded border border-border bg-card" />}
            <p className="font-body text-xs text-muted-foreground text-center">{settings.qrph_account_name}</p>
          </div>
        )}

        {method && (
          <div className="space-y-2">
            <Input value={reference} onChange={e => setReference(e.target.value)}
              placeholder="Reference / confirmation number" className="bg-secondary border-border text-foreground font-body" />
            <input ref={proofInput} type="file" accept="image/*" className="hidden" onChange={e => pickProof(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => proofInput.current?.click()} className="w-full font-body">
              <Upload className="w-4 h-4 mr-1" /> {proof ? 'Replace payment screenshot' : 'Upload payment screenshot'}
            </Button>
            {proof && <img src={proof} alt="Payment proof preview" className="max-h-40 mx-auto rounded border border-border" />}
            <Button onClick={submit} disabled={submitting} className="w-full font-display tracking-wider h-12">
              {submitting ? 'Submitting…' : 'Submit Payment for Verification'}
            </Button>
            <p className="font-body text-[11px] text-muted-foreground text-center">
              Your payment is marked pending until reception verifies it. Check-out completes after verification.
            </p>
          </div>
        )}
      </div>

      {mySubmissions.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Your Payments</p>
          {mySubmissions.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between">
              <div>
                <p className="font-body text-sm text-foreground">₱{Number(s.amount || 0).toLocaleString()} · {s.method === 'stripe' ? 'Card' : s.method.toUpperCase()}</p>
                <p className="font-body text-[11px] text-muted-foreground">{new Date(s.created_at).toLocaleString()}{s.reference ? ` · Ref ${s.reference}` : ''}</p>
              </div>
              <Badge variant="outline" className={`text-[10px] flex items-center gap-1 ${
                s.status === 'verified' ? 'border-emerald-500/40 text-emerald-400'
                : s.status === 'rejected' ? 'border-destructive/40 text-destructive'
                : 'border-amber-500/40 text-amber-400'}`}>
                {s.status === 'verified' ? <CheckCircle2 className="w-3 h-3" /> : s.status === 'rejected' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {s.status === 'verified' ? 'Verified' : s.status === 'rejected' ? 'Rejected' : 'Awaiting verification'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GuestPaymentSection;
