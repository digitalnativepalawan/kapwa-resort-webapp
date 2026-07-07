import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useInvoiceSettings } from '@/hooks/useInvoiceSettings';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const InvoiceSettingsForm = () => {
  const qc = useQueryClient();
  const { data: settings } = useInvoiceSettings();

  const [thankYou, setThankYou] = useState('Thank you for dining with us!');
  const [hours, setHours] = useState('Open daily: 7AM - 10PM');
  const [footer, setFooter] = useState('');
  const [tin, setTin] = useState('');
  const [scPct, setScPct] = useState('10');
  const [showSc, setShowSc] = useState(true);
  const [showPay, setShowPay] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setThankYou(settings.thank_you_message || '');
      setHours(settings.business_hours || '');
      setFooter(settings.footer_text || '');
      setTin(settings.tin_number || '');
      setScPct(String(settings.service_charge_pct ?? 10));
      setShowSc(settings.show_service_charge ?? true);
      setShowPay(settings.show_payment_method ?? true);
    }
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        thank_you_message: thankYou,
        business_hours: hours,
        footer_text: footer,
        tin_number: tin,
        service_charge_pct: parseFloat(scPct) || 10,
        show_service_charge: showSc,
        show_payment_method: showPay,
      };

      if (settings?.id) {
        await (supabase.from('invoice_settings' as any) as any).update(payload).eq('id', settings.id);
      } else {
        await (supabase.from('invoice_settings' as any) as any).insert(payload);
      }
      qc.invalidateQueries({ queryKey: ['invoice-settings'] });
      toast.success('Invoice settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Invoice Settings</h3>
      <div className="space-y-3">
        <div>
          <Label className="font-body text-xs text-cream-dim">Thank You Message</Label>
          <Textarea value={thankYou} onChange={e => setThankYou(e.target.value)}
            className="bg-secondary border-border text-foreground font-body mt-1" rows={2} />
        </div>
        <div>
          <Label className="font-body text-xs text-cream-dim">Business Hours</Label>
          <Input value={hours} onChange={e => setHours(e.target.value)}
            className="bg-secondary border-border text-foreground font-body mt-1" placeholder="Open daily: 7AM - 10PM" />
        </div>
        <div>
          <Label className="font-body text-xs text-cream-dim">Additional Footer Text</Label>
          <Textarea value={footer} onChange={e => setFooter(e.target.value)}
            className="bg-secondary border-border text-foreground font-body mt-1" rows={2} placeholder="Custom footer message" />
        </div>
        <div>
          <Label className="font-body text-xs text-cream-dim">TIN / VAT Number</Label>
          <Input value={tin} onChange={e => setTin(e.target.value)}
            className="bg-secondary border-border text-foreground font-body mt-1" placeholder="123-456-789-000" />
        </div>
        <div>
          <Label className="font-body text-xs text-cream-dim">Service Charge %</Label>
          <Input type="number" value={scPct} onChange={e => setScPct(e.target.value)}
            className="bg-secondary border-border text-foreground font-body mt-1 w-24" min="0" max="100" />
        </div>
        <div className="flex items-center justify-between py-1">
          <Label className="font-body text-xs text-cream-dim">Show Service Charge Breakdown</Label>
          <Switch checked={showSc} onCheckedChange={setShowSc} />
        </div>
        <div className="flex items-center justify-between py-1">
          <Label className="font-body text-xs text-cream-dim">Show Payment Method</Label>
          <Switch checked={showPay} onCheckedChange={setShowPay} />
        </div>
        <Button onClick={save} disabled={saving} className="font-display tracking-wider w-full">
          {saving ? 'Saving...' : 'Save Invoice Settings'}
        </Button>
      </div>
    </section>
  );
};

export default InvoiceSettingsForm;
