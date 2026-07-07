import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, X, MessageCircle, Copy, Check } from 'lucide-react';
import { useResortProfile } from '@/hooks/useResortProfile';
import { useInvoiceSettings } from '@/hooks/useInvoiceSettings';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface CashierReceiptProps {
  order: any;
  onDone: () => void;
}

function buildReceiptText(order: any, profile: any, invoiceSettings: any): string {
  const items = (order.items as any[]) || [];
  const subtotal = items.reduce((s: number, i: any) => s + i.price * (i.qty || i.quantity || 1), 0);
  const sc = Number(order.service_charge || 0);
  const total = subtotal + sc;

  const lines: string[] = [];
  const resortName = profile?.resort_name || 'RESORT';
  lines.push(`*${resortName}*`);
  if (profile?.tagline) lines.push(profile.tagline);
  lines.push('');
  lines.push(`*RECEIPT*`);
  lines.push(format(new Date(order.created_at), 'MMM d, yyyy h:mm a'));
  lines.push(`${order.order_type}${order.location_detail ? ' — ' + order.location_detail : ''}`);
  if (order.guest_name) lines.push(`Guest: ${order.guest_name}`);
  lines.push('');
  lines.push('─────────────');
  items.forEach((i: any) => {
    const qty = i.qty || i.quantity || 1;
    lines.push(`${qty}× ${i.name} — ₱${(i.price * qty).toLocaleString()}`);
  });
  lines.push('─────────────');
  lines.push(`Subtotal: ₱${subtotal.toLocaleString()}`);
  if (sc > 0) lines.push(`Service Charge: ₱${sc.toLocaleString()}`);
  lines.push(`*TOTAL: ₱${total.toLocaleString()}*`);
  lines.push('');
  if (order.payment_type) lines.push(`Paid with: ${order.payment_type}`);
  const thankYou = invoiceSettings?.thank_you_message || 'Thank you for dining with us!';
  lines.push('');
  lines.push(thankYou);

  return lines.join('\n');
}

const CashierReceipt = ({ order, onDone }: CashierReceiptProps) => {
  const { data: profile } = useResortProfile();
  const { data: invoiceSettings } = useInvoiceSettings();
  const { data: config } = useBillingConfig();
  const [copied, setCopied] = useState(false);

  const items = (order.items as any[]) || [];
  const subtotal = items.reduce((s: number, i: any) => s + i.price * (i.qty || i.quantity || 1), 0);
  const sc = Number(order.service_charge || 0);
  const total = subtotal + sc;

  const handlePrint = () => {
    const resortName = profile?.resort_name || 'RESORT';
    const tagline = profile?.tagline || '';
    const address = profile?.address || '';
    const contactParts: string[] = [];
    if (profile?.phone) contactParts.push(profile.phone);
    if (profile?.email) contactParts.push(profile.email);
    const contactLine = contactParts.join(' · ');
    const tinNumber = invoiceSettings?.tin_number || '';
    const thankYou = invoiceSettings?.thank_you_message || 'Thank you for dining with us!';
    const businessHours = invoiceSettings?.business_hours || '';
    const footerText = invoiceSettings?.footer_text || '';

    const html = `<!DOCTYPE html>
<html><head><title>Receipt</title><style>
@page { margin: 0; size: auto; }
body { font-family: 'Courier New', monospace; max-width: 300px; margin: 0 auto; padding: 10px; font-size: 12px; }
.center { text-align: center; }
.line { border-top: 1px dashed #000; margin: 8px 0; }
.row { display: flex; justify-content: space-between; }
.bold { font-weight: bold; }
h2, h3 { margin: 4px 0; }
.small { font-size: 10px; color: #555; }
</style></head><body>
<div class="center">
  ${profile?.logo_url ? `<img src="${profile.logo_url}" alt="" style="max-height:${profile?.logo_size || 64}px;margin:0 auto 4px;" />` : ''}
  <h2>${resortName}</h2>
  ${tagline ? `<p class="small">${tagline}</p>` : ''}
  ${address ? `<p class="small">${address}</p>` : ''}
  ${contactLine ? `<p class="small">${contactLine}</p>` : ''}
  ${tinNumber ? `<p class="small">TIN: ${tinNumber}</p>` : ''}
  <div class="line"></div>
  <p><strong>RECEIPT</strong></p>
  <p class="small">${format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}</p>
  <p class="small">${order.order_type}${order.location_detail ? ' — ' + order.location_detail : ''}</p>
  ${order.guest_name ? `<p class="small">Guest: ${order.guest_name}</p>` : ''}
</div>
<div class="line"></div>
${items.map((i: any) => `<div class="row"><span>${i.qty || i.quantity || 1}× ${i.name}</span><span>₱${(i.price * (i.qty || i.quantity || 1)).toLocaleString()}</span></div>`).join('')}
<div class="line"></div>
<div class="row"><span>Subtotal</span><span>₱${subtotal.toLocaleString()}</span></div>
${sc > 0 ? `<div class="row"><span>Service Charge</span><span>₱${sc.toLocaleString()}</span></div>` : ''}
<div class="row bold" style="font-size:14px"><span>TOTAL</span><span>₱${total.toLocaleString()}</span></div>
<div class="line"></div>
<div class="row"><span>Payment</span><span>${order.payment_type || '—'}</span></div>
<div class="line"></div>
${businessHours ? `<p class="center small">${businessHours}</p>` : ''}
<p class="center">${thankYou}</p>
${footerText ? `<p class="center small">${footerText}</p>` : ''}
</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  };

  const handleShareWhatsApp = () => {
    const text = buildReceiptText(order, profile, invoiceSettings);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCopy = async () => {
    const text = buildReceiptText(order, profile, invoiceSettings);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Receipt copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {/* On-screen receipt preview */}
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-5 space-y-3 font-body text-sm">
        <div className="text-center space-y-1">
          {profile?.logo_url && <img src={profile.logo_url} alt="" className="mx-auto mb-1" style={{ maxHeight: profile?.logo_size || 64 }} />}
          <p className="font-display text-lg tracking-wider text-foreground">{profile?.resort_name || 'RESORT'}</p>
          {profile?.tagline && <p className="text-xs text-muted-foreground">{profile.tagline}</p>}
          <p className="text-xs text-muted-foreground">{format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}</p>
        </div>

        <div className="border-t border-dashed border-border pt-3 space-y-1">
          {items.map((i: any, idx: number) => (
            <div key={idx} className="flex justify-between">
              <span className="text-foreground">{i.qty || i.quantity || 1}× {i.name}</span>
              <span className="text-muted-foreground tabular-nums">₱{(i.price * (i.qty || i.quantity || 1)).toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-border pt-3 space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">₱{subtotal.toLocaleString()}</span>
          </div>
          {sc > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service Charge</span>
              <span className="tabular-nums">₱{sc.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-display text-lg text-gold">
            <span>Total</span>
            <span className="tabular-nums">₱{total.toLocaleString()}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-border pt-3 text-center">
          <span className="text-xs text-muted-foreground">Paid with: <strong className="text-foreground">{order.payment_type || '—'}</strong></span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-sm space-y-2">
        <div className="flex gap-2">
          <Button onClick={handlePrint} className="flex-1 gap-2 font-display tracking-wider">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Button onClick={handleShareWhatsApp} variant="outline" className="flex-1 gap-2 font-display tracking-wider text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCopy} variant="outline" className="flex-1 gap-2 font-display tracking-wider">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button variant="outline" onClick={onDone} className="flex-1 gap-2 font-display tracking-wider">
            <X className="w-4 h-4" /> Done
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CashierReceipt;
