import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const BillingConfigForm = () => {
  const qc = useQueryClient();
  const { data: config } = useBillingConfig();
  const { data: methods = [] } = usePaymentMethods();

  const [form, setForm] = useState({
    enable_tax: true,
    tax_name: 'VAT',
    tax_rate: '12',
    enable_service_charge: true,
    service_charge_name: 'Service Charge',
    service_charge_rate: '10',
    enable_city_tax: false,
    city_tax_name: '',
    city_tax_rate: '0',
    allow_room_charging: true,
    require_deposit: false,
    require_signature_above: '5000',
    notify_charges_above: '10000',
    default_payment_method: 'Charge to Room',
    show_staff_on_receipt: true,
    show_itemized_taxes: true,
    show_payment_on_receipt: true,
    show_room_on_receipt: false,
    receipt_header: '',
    receipt_footer: 'Thank you! Please come again',
  });

  const [newMethod, setNewMethod] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        enable_tax: config.enable_tax,
        tax_name: config.tax_name,
        tax_rate: String(config.tax_rate),
        enable_service_charge: config.enable_service_charge,
        service_charge_name: config.service_charge_name,
        service_charge_rate: String(config.service_charge_rate),
        enable_city_tax: config.enable_city_tax,
        city_tax_name: config.city_tax_name,
        city_tax_rate: String(config.city_tax_rate),
        allow_room_charging: config.allow_room_charging,
        require_deposit: config.require_deposit,
        require_signature_above: String(config.require_signature_above),
        notify_charges_above: String(config.notify_charges_above),
        default_payment_method: config.default_payment_method,
        show_staff_on_receipt: config.show_staff_on_receipt,
        show_itemized_taxes: config.show_itemized_taxes,
        show_payment_on_receipt: config.show_payment_on_receipt,
        show_room_on_receipt: config.show_room_on_receipt,
        receipt_header: config.receipt_header,
        receipt_footer: config.receipt_footer,
      });
    }
  }, [config]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        enable_tax: form.enable_tax,
        tax_name: form.tax_name,
        tax_rate: parseFloat(form.tax_rate) || 0,
        enable_service_charge: form.enable_service_charge,
        service_charge_name: form.service_charge_name,
        service_charge_rate: parseFloat(form.service_charge_rate) || 0,
        enable_city_tax: form.enable_city_tax,
        city_tax_name: form.city_tax_name,
        city_tax_rate: parseFloat(form.city_tax_rate) || 0,
        allow_room_charging: form.allow_room_charging,
        require_deposit: form.require_deposit,
        require_signature_above: parseFloat(form.require_signature_above) || 0,
        notify_charges_above: parseFloat(form.notify_charges_above) || 0,
        default_payment_method: form.default_payment_method,
        show_staff_on_receipt: form.show_staff_on_receipt,
        show_itemized_taxes: form.show_itemized_taxes,
        show_payment_on_receipt: form.show_payment_on_receipt,
        show_room_on_receipt: form.show_room_on_receipt,
        receipt_header: form.receipt_header,
        receipt_footer: form.receipt_footer,
      };

      if (config?.id) {
        await (supabase.from('billing_config' as any) as any).update(payload).eq('id', config.id);
      } else {
        await (supabase.from('billing_config' as any) as any).insert(payload);
      }
      qc.invalidateQueries({ queryKey: ['billing-config'] });
      toast.success('Billing configuration saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addMethod = async () => {
    if (!newMethod.trim()) return;
    const maxSort = methods.reduce((m, p) => Math.max(m, p.sort_order), 0);
    await (supabase.from('payment_methods' as any) as any).insert({
      name: newMethod.trim(),
      sort_order: maxSort + 1,
    });
    setNewMethod('');
    qc.invalidateQueries({ queryKey: ['payment-methods'] });
    toast.success('Payment method added');
  };

  const toggleMethod = async (id: string, active: boolean) => {
    await (supabase.from('payment_methods' as any) as any).update({ is_active: active }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['payment-methods'] });
  };

  const deleteMethod = async (id: string) => {
    await (supabase.from('payment_methods' as any) as any).delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['payment-methods'] });
    toast.success('Payment method removed');
  };

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <section className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-display text-sm tracking-wider text-foreground">Billing Configuration</h3>
        <Button onClick={save} disabled={saving} className="font-display tracking-wider text-xs">
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Tax & Service Charges */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <p className="font-display text-xs tracking-wider text-cream-dim uppercase">Tax & Service Charges</p>

        <div className="flex items-center justify-between">
          <label className="font-body text-sm text-foreground">Enable Tax</label>
          <Switch checked={form.enable_tax} onCheckedChange={v => set('enable_tax', v)} />
        </div>
        {form.enable_tax && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-xs text-cream-dim">Tax Name</label>
              <Input value={form.tax_name} onChange={e => set('tax_name', e.target.value)} className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-cream-dim">Tax Rate (%)</label>
              <Input type="number" value={form.tax_rate} onChange={e => set('tax_rate', e.target.value)} className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <label className="font-body text-sm text-foreground">Enable Service Charge</label>
          <Switch checked={form.enable_service_charge} onCheckedChange={v => set('enable_service_charge', v)} />
        </div>
        {form.enable_service_charge && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-xs text-cream-dim">Name</label>
              <Input value={form.service_charge_name} onChange={e => set('service_charge_name', e.target.value)} className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-cream-dim">Rate (%)</label>
              <Input type="number" value={form.service_charge_rate} onChange={e => set('service_charge_rate', e.target.value)} className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <label className="font-body text-sm text-foreground">Enable City Tax</label>
          <Switch checked={form.enable_city_tax} onCheckedChange={v => set('enable_city_tax', v)} />
        </div>
        {form.enable_city_tax && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-xs text-cream-dim">City Tax Name</label>
              <Input value={form.city_tax_name} onChange={e => set('city_tax_name', e.target.value)} className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-cream-dim">Rate (%)</label>
              <Input type="number" value={form.city_tax_rate} onChange={e => set('city_tax_rate', e.target.value)} className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
          </div>
        )}
      </div>

      {/* Room Charging Rules */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <p className="font-display text-xs tracking-wider text-cream-dim uppercase">Room Charging Rules</p>

        <div className="flex items-center justify-between">
          <label className="font-body text-sm text-foreground">Allow room charging</label>
          <Switch checked={form.allow_room_charging} onCheckedChange={v => set('allow_room_charging', v)} />
        </div>
        <div className="flex items-center justify-between">
          <label className="font-body text-sm text-foreground">Require deposit for room charges</label>
          <Switch checked={form.require_deposit} onCheckedChange={v => set('require_deposit', v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-body text-xs text-cream-dim">Require signature above (₱)</label>
            <Input type="number" value={form.require_signature_above} onChange={e => set('require_signature_above', e.target.value)} className="bg-secondary border-border text-foreground font-body mt-1" />
          </div>
          <div>
            <label className="font-body text-xs text-cream-dim">Notify charges above (₱)</label>
            <Input type="number" value={form.notify_charges_above} onChange={e => set('notify_charges_above', e.target.value)} className="bg-secondary border-border text-foreground font-body mt-1" />
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <p className="font-display text-xs tracking-wider text-cream-dim uppercase">Payment Methods</p>
        {methods.map(m => (
          <div key={m.id} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <Switch checked={m.is_active} onCheckedChange={v => toggleMethod(m.id, v)} />
              <span className="font-body text-sm text-foreground">{m.name}</span>
            </div>
            <button onClick={() => deleteMethod(m.id)} className="text-cream-dim hover:text-destructive min-w-[36px] min-h-[36px] flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <Input value={newMethod} onChange={e => setNewMethod(e.target.value)} placeholder="Custom payment method" className="bg-secondary border-border text-foreground font-body" />
          <Button onClick={addMethod} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Receipt & Print Settings */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <p className="font-display text-xs tracking-wider text-cream-dim uppercase">Receipt & Print Settings</p>

        <div className="flex items-center justify-between">
          <label className="font-body text-sm text-foreground">Show staff name on receipts</label>
          <Switch checked={form.show_staff_on_receipt} onCheckedChange={v => set('show_staff_on_receipt', v)} />
        </div>
        <div className="flex items-center justify-between">
          <label className="font-body text-sm text-foreground">Show itemized taxes</label>
          <Switch checked={form.show_itemized_taxes} onCheckedChange={v => set('show_itemized_taxes', v)} />
        </div>
        <div className="flex items-center justify-between">
          <label className="font-body text-sm text-foreground">Show payment method on receipt</label>
          <Switch checked={form.show_payment_on_receipt} onCheckedChange={v => set('show_payment_on_receipt', v)} />
        </div>
        <div className="flex items-center justify-between">
          <label className="font-body text-sm text-foreground">Show room number on all receipts</label>
          <Switch checked={form.show_room_on_receipt} onCheckedChange={v => set('show_room_on_receipt', v)} />
        </div>

        <Separator />

        <div>
          <label className="font-body text-xs text-cream-dim">Receipt Header Text</label>
          <Input value={form.receipt_header} onChange={e => set('receipt_header', e.target.value)} className="bg-secondary border-border text-foreground font-body mt-1" placeholder="e.g. KAPWA RESORT - San Vicente" />
        </div>
        <div>
          <label className="font-body text-xs text-cream-dim">Receipt Footer Text</label>
          <Input value={form.receipt_footer} onChange={e => set('receipt_footer', e.target.value)} className="bg-secondary border-border text-foreground font-body mt-1" />
        </div>
      </div>
    </section>
  );
};

export default BillingConfigForm;
