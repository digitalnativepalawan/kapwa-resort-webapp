import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Upload, Trash2, CreditCard, QrCode, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

// Compress an uploaded QR image into a small data URL so it can be stored inline
const fileToCompressedDataUrl = (file: File, maxSize = 900): Promise<string> =>
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
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Invalid image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

const emptyForm = {
  stripe_enabled: false,
  stripe_link: '',
  stripe_instructions: '',
  gcash_enabled: false,
  gcash_account_name: '',
  gcash_number: '',
  gcash_qr_image: '',
  qrph_enabled: false,
  qrph_account_name: '',
  qrph_qr_image: '',
  payment_instructions: '',
  require_admin_verification: true,
};

const GuestPaymentSettingsForm = () => {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const gcashInput = useRef<HTMLInputElement>(null);
  const qrphInput = useRef<HTMLInputElement>(null);

  const { data: settings } = useQuery({
    queryKey: ['guest-payment-settings'],
    queryFn: async () => {
      const { data } = await (supabase.from('guest_payment_settings') as any)
        .select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (settings) setForm({ ...emptyForm, ...settings });
  }, [settings]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const pickImage = async (file: File | undefined, key: 'gcash_qr_image' | 'qrph_qr_image') => {
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      set(key, dataUrl);
      toast.success('QR image ready — remember to save');
    } catch {
      toast.error('Could not read that image');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (settings?.id) {
        const { error } = await (supabase.from('guest_payment_settings') as any).update(payload).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('guest_payment_settings') as any).insert(payload);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ['guest-payment-settings'] });
      toast.success('Guest payment settings saved');
    } catch (e: any) {
      toast.error(e.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h3 className="font-display text-sm tracking-wider text-foreground mb-1">Guest Checkout Payments</h3>
      <p className="font-body text-xs text-muted-foreground mb-4">
        Methods offered to guests in the portal. Guests must agree to all charges before paying, and every payment is reviewed by staff before check-out.
      </p>

      <div className="space-y-5">
        <div>
          <label className="font-body text-xs text-muted-foreground">Instructions shown to guests</label>
          <Textarea value={form.payment_instructions} onChange={e => set('payment_instructions', e.target.value)}
            className="bg-secondary border-border text-foreground font-body mt-1" rows={3} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-body text-sm text-foreground">Require staff verification</p>
            <p className="font-body text-xs text-muted-foreground">Payments stay pending until a staff member approves them.</p>
          </div>
          <Switch checked={form.require_admin_verification} onCheckedChange={v => set('require_admin_verification', v)} />
        </div>

        <Separator className="bg-border" />

        {/* Stripe */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-body text-sm text-foreground flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> Stripe (card)</p>
            <Switch checked={form.stripe_enabled} onCheckedChange={v => set('stripe_enabled', v)} />
          </div>
          <Input value={form.stripe_link} onChange={e => set('stripe_link', e.target.value)}
            placeholder="https://buy.stripe.com/..." className="bg-secondary border-border text-foreground font-body" />
          <Textarea value={form.stripe_instructions} onChange={e => set('stripe_instructions', e.target.value)}
            placeholder="Notes shown next to the card payment option" rows={2}
            className="bg-secondary border-border text-foreground font-body" />
        </div>

        <Separator className="bg-border" />

        {/* GCash */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-body text-sm text-foreground flex items-center gap-2"><Smartphone className="w-4 h-4 text-blue-400" /> GCash</p>
            <Switch checked={form.gcash_enabled} onCheckedChange={v => set('gcash_enabled', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input value={form.gcash_account_name} onChange={e => set('gcash_account_name', e.target.value)}
              placeholder="Account name" className="bg-secondary border-border text-foreground font-body" />
            <Input value={form.gcash_number} onChange={e => set('gcash_number', e.target.value)}
              placeholder="09XX XXX XXXX" className="bg-secondary border-border text-foreground font-body" />
          </div>
          <div className="flex items-center gap-3">
            {form.gcash_qr_image
              ? <img src={form.gcash_qr_image} alt="GCash QR code" className="w-24 h-24 object-contain rounded border border-border bg-card" />
              : <div className="w-24 h-24 rounded border border-dashed border-border flex items-center justify-center"><QrCode className="w-6 h-6 text-muted-foreground" /></div>}
            <div className="space-x-2">
              <input ref={gcashInput} type="file" accept="image/*" className="hidden"
                onChange={e => pickImage(e.target.files?.[0], 'gcash_qr_image')} />
              <Button variant="outline" size="sm" onClick={() => gcashInput.current?.click()} className="font-body">
                <Upload className="w-3 h-3 mr-1" /> Upload QR
              </Button>
              {form.gcash_qr_image && (
                <Button variant="ghost" size="sm" onClick={() => set('gcash_qr_image', '')} className="font-body text-destructive">
                  <Trash2 className="w-3 h-3 mr-1" /> Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <Separator className="bg-border" />

        {/* QRPH */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-body text-sm text-foreground flex items-center gap-2"><QrCode className="w-4 h-4 text-emerald-400" /> QRPH</p>
            <Switch checked={form.qrph_enabled} onCheckedChange={v => set('qrph_enabled', v)} />
          </div>
          <Input value={form.qrph_account_name} onChange={e => set('qrph_account_name', e.target.value)}
            placeholder="Merchant / account name" className="bg-secondary border-border text-foreground font-body" />
          <div className="flex items-center gap-3">
            {form.qrph_qr_image
              ? <img src={form.qrph_qr_image} alt="QRPH QR code" className="w-24 h-24 object-contain rounded border border-border bg-card" />
              : <div className="w-24 h-24 rounded border border-dashed border-border flex items-center justify-center"><QrCode className="w-6 h-6 text-muted-foreground" /></div>}
            <div className="space-x-2">
              <input ref={qrphInput} type="file" accept="image/*" className="hidden"
                onChange={e => pickImage(e.target.files?.[0], 'qrph_qr_image')} />
              <Button variant="outline" size="sm" onClick={() => qrphInput.current?.click()} className="font-body">
                <Upload className="w-3 h-3 mr-1" /> Upload QR
              </Button>
              {form.qrph_qr_image && (
                <Button variant="ghost" size="sm" onClick={() => set('qrph_qr_image', '')} className="font-body text-destructive">
                  <Trash2 className="w-3 h-3 mr-1" /> Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="font-display tracking-wider w-full">
          {saving ? 'Saving…' : 'Save Payment Settings'}
        </Button>
      </div>
    </section>
  );
};

export default GuestPaymentSettingsForm;
