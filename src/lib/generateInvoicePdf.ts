import jsPDF from 'jspdf';
import { ResortProfile } from '@/hooks/useResortProfile';
import { InvoiceSettings } from '@/hooks/useInvoiceSettings';

interface InvoiceOrder {
  id: string;
  order_type: string;
  location_detail: string | null;
  items: any[];
  total: number;
  service_charge: number;
  payment_type: string | null;
  created_at: string;
}

function formatCurrency(amount: number): string {
  return `P${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function generateInvoicePdf(
  order: InvoiceOrder,
  profile: ResortProfile | null,
  invoiceSettings?: InvoiceSettings | null,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const pw = doc.internal.pageSize.getWidth();
  const ml = 14;
  const mr = pw - 14;
  let y = 16;

  const scPct = invoiceSettings?.service_charge_pct ?? 10;
  const showSc = invoiceSettings?.show_service_charge ?? true;
  const showPay = invoiceSettings?.show_payment_method ?? true;

  // ── Header: Logo + Resort name ──
  if (profile?.logo_url) {
    try {
      const img = await loadImageAsBase64(profile.logo_url);
      const logoH = Math.min((profile.logo_size || 64) * 0.26, 18); // ~px to mm
      const logoW = logoH; // square bounding box
      doc.addImage(img, 'PNG', ml, y - 4, logoW, logoH);
      y += logoH + 2;
    } catch { /* skip logo if load fails */ }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(50, 50, 50);
  const resortName = (profile?.resort_name || 'Resort').toUpperCase();
  doc.text(resortName, ml, y);

  if (profile?.tagline) {
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(profile.tagline, ml, y);
  }
  y += 7;

  // ── Two-column: Business details (left) | Date & type (right) ──
  const colSplit = pw / 2 + 2; // max width for left column text
  const leftStartY = y;

  // Left: address + contact (wrap long address)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  if (profile?.address) {
    const addressLines = doc.splitTextToSize(profile.address, colSplit - ml - 4);
    doc.text(addressLines, ml, y);
    y += addressLines.length * 3.5;
  }
  const contactParts: string[] = [];
  if (profile?.phone) contactParts.push(profile.phone);
  if (profile?.email) contactParts.push(profile.email);
  if (contactParts.length) { doc.text(contactParts.join('  ·  '), ml, y); y += 3.5; }
  if (profile?.website_url) { doc.text(profile.website_url, ml, y); y += 3.5; }

  // Right: date + type (positioned from the same starting Y)
  const orderDate = new Date(order.created_at);
  const dateFmt = orderDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeFmt = orderDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const typeLabels: Record<string, string> = {
    Room: 'Room Delivery', DineIn: 'Dine In', Beach: 'Beach Delivery', WalkIn: 'Walk-In',
  };
  const typeLabel = typeLabels[order.order_type] || order.order_type;

  let ry = leftStartY;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(160, 160, 160);
  doc.text('DATE', mr, ry, { align: 'right' });
  ry += 3.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text(`${dateFmt}  ${timeFmt}`, mr, ry, { align: 'right' });
  ry += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(160, 160, 160);
  doc.text('TYPE', mr, ry, { align: 'right' });
  ry += 3.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text(`${typeLabel}${order.location_detail ? ` — ${order.location_detail}` : ''}`, mr, ry, { align: 'right' });

  // Ensure y is past both columns
  y = Math.max(y, ry + 4);
  y += 3;

  // Divider
  doc.setDrawColor(215, 215, 210);
  doc.setLineWidth(0.25);
  doc.line(ml, y, mr, y);
  y += 7;

  // ── Table header ──
  doc.setFillColor(247, 246, 243);
  doc.rect(ml, y - 3.5, mr - ml, 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 110);
  doc.text('ITEM', ml + 2, y);
  doc.text('QTY', pw / 2 + 10, y, { align: 'center' });
  doc.text('PRICE', mr - 22, y, { align: 'right' });
  doc.text('TOTAL', mr - 2, y, { align: 'right' });
  y += 5.5;

  // ── Line items ──
  const items = order.items || [];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  items.forEach((item: any, idx: number) => {
    const qty = item.qty || item.quantity;
    const lineTotal = item.price * qty;

    if (idx % 2 === 0) {
      doc.setFillColor(252, 251, 249);
      doc.rect(ml, y - 3, mr - ml, 5, 'F');
    }

    doc.setTextColor(50, 50, 50);
    doc.text(item.name, ml + 2, y);
    doc.setTextColor(100, 100, 100);
    doc.text(String(qty), pw / 2 + 10, y, { align: 'center' });
    doc.text(formatCurrency(item.price), mr - 22, y, { align: 'right' });
    doc.setTextColor(50, 50, 50);
    doc.text(formatCurrency(lineTotal), mr - 2, y, { align: 'right' });
    y += 5;
  });

  // Divider
  y += 2;
  doc.setDrawColor(220, 220, 215);
  doc.setLineWidth(0.2);
  doc.line(ml, y, mr, y);
  y += 5;

  // ── Totals ──
  const subtotal = items.reduce((sum: number, i: any) => sum + (i.price * (i.qty || i.quantity)), 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  doc.text('Subtotal', ml + 2, y);
  doc.setTextColor(60, 60, 60);
  doc.text(formatCurrency(subtotal), mr - 2, y, { align: 'right' });
  y += 4.5;

  if (showSc) {
    doc.setTextColor(110, 110, 110);
    doc.text(`Service Charge (${scPct}%)`, ml + 2, y);
    doc.setTextColor(60, 60, 60);
    doc.text(formatCurrency(order.service_charge), mr - 2, y, { align: 'right' });
    y += 5;
  }

  // Grand total
  const grandTotal = subtotal + order.service_charge;
  doc.setFillColor(245, 243, 238);
  doc.rect(ml, y - 3.5, mr - ml, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text('TOTAL', ml + 2, y + 0.5);
  doc.text(formatCurrency(grandTotal), mr - 2, y + 0.5, { align: 'right' });
  y += 9;

  // Payment
  if (showPay && order.payment_type) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`Payment: ${order.payment_type}`, ml + 2, y);
    y += 6;
  }

  // ── Footer ──
  y += 4;
  doc.setDrawColor(220, 220, 215);
  doc.setLineWidth(0.2);
  doc.line(pw / 2 - 20, y, pw / 2 + 20, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(130, 130, 130);

  const thankYou = invoiceSettings?.thank_you_message || 'Thank you for dining with us!';
  doc.text(thankYou, pw / 2, y, { align: 'center' });
  y += 4;

  if (invoiceSettings?.business_hours) {
    doc.setFontSize(6.5);
    doc.text(invoiceSettings.business_hours, pw / 2, y, { align: 'center' });
    y += 3.5;
  }

  // Social handles
  const socialParts: string[] = [];
  if (profile?.instagram_url) socialParts.push(`IG: ${profile.instagram_url.replace(/https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}`);
  if (profile?.website_url) socialParts.push(profile.website_url);
  if (socialParts.length) {
    doc.setFontSize(6.5);
    doc.text(socialParts.join('  |  '), pw / 2, y, { align: 'center' });
    y += 3.5;
  }

  if (invoiceSettings?.tin_number) {
    doc.setFontSize(6.5);
    doc.text(`TIN: ${invoiceSettings.tin_number}`, pw / 2, y, { align: 'center' });
    y += 3.5;
  }

  if (invoiceSettings?.footer_text) {
    doc.setFontSize(6.5);
    doc.text(invoiceSettings.footer_text, pw / 2, y, { align: 'center' });
  }

  doc.save(`invoice-${order.id.slice(0, 8)}.pdf`);
}

export function buildInvoiceWhatsAppText(
  order: InvoiceOrder,
  profile: ResortProfile | null,
  invoiceSettings?: InvoiceSettings | null,
): string {
  const typeLabels: Record<string, string> = {
    Room: 'Room Delivery', DineIn: 'Dine In', Beach: 'Beach Delivery', WalkIn: 'Walk-In',
  };
  const items = order.items || [];
  const subtotal = items.reduce((sum: number, i: any) => sum + (i.price * (i.qty || i.quantity)), 0);
  const scPct = invoiceSettings?.service_charge_pct ?? 10;

  const lines = [
    `*INVOICE - ${profile?.resort_name || 'Resort'}*`,
    '',
    `Date: ${new Date(order.created_at).toLocaleString('en-PH')}`,
    `Type: ${typeLabels[order.order_type] || order.order_type}${order.location_detail ? ` - ${order.location_detail}` : ''}`,
    '',
    '*Items:*',
    ...items.map((i: any) => `${i.qty || i.quantity}x ${i.name} - P${((i.price) * (i.qty || i.quantity)).toLocaleString()}`),
    '',
    `Subtotal: P${subtotal.toLocaleString()}`,
    `Service Charge (${scPct}%): P${order.service_charge.toLocaleString()}`,
    `*Total: P${(subtotal + order.service_charge).toLocaleString()}*`,
  ];

  if (order.payment_type) lines.push(`Payment: ${order.payment_type}`);
  lines.push('', invoiceSettings?.thank_you_message || 'Thank you for dining with us!');
  if (invoiceSettings?.business_hours) lines.push(invoiceSettings.business_hours);
  if (profile?.website_url) lines.push(profile.website_url);

  return lines.join('\n');
}
