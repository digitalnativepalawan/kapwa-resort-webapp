import { CartItem } from './cart';

export interface OrderInfo {
  orderType: string;
  locationDetail: string;
  isStaff: boolean;
  paymentType?: string;
}

export function formatWhatsAppMessage(order: OrderInfo, items: CartItem[], total: number, scheduledFor?: string | null): string {
  const typeLabels: Record<string, string> = {
    Room: 'Room',
    RoomDelivery: 'Room Delivery',
    WalkIn: 'Walk-In Guest',
    'Friends&Familywalkin': 'Friends & Family Walk-In',
  };

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const serviceCharge = Math.round(subtotal * 0.10);

  // For scheduled orders, make the header chef-friendly
  let scheduledLabel = '';
  if (scheduledFor) {
    const d = new Date(scheduledFor);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
    scheduledLabel = isToday ? timeStr : `Tomorrow ${timeStr}`;
  }

  const lines = scheduledFor
    ? [
        `📋 *SCHEDULED ORDER — ${order.locationDetail}*`,
        `🕐 *${scheduledLabel}*`,
        '',
        `*Type:* ${typeLabels[order.orderType] || order.orderType}`,
      ]
    : [
        '🌴 *NEW ORDER – KAPWA OS PALAWAN*',
        '',
        `*Type:* ${typeLabels[order.orderType] || order.orderType}`,
        `*Location:* ${order.locationDetail}`,
      ];

  if (order.isStaff && order.paymentType) {
    lines.push(`*Payment:* ${order.paymentType}`);
  }

  lines.push('', '*Items:*');
  items.forEach(item => {
    lines.push(`${item.quantity}x ${item.name} – ₱${(item.price * item.quantity).toLocaleString()}`);
  });

  lines.push('', `*Subtotal: ₱${subtotal.toLocaleString()}*`);
  lines.push(`*Service Charge (10%): ₱${serviceCharge.toLocaleString()}*`);
  lines.push(`*Total: ₱${total.toLocaleString()}*`);
  lines.push('', `*Time:* ${new Date().toLocaleString('en-PH')}`);

  return lines.join('\n');
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleaned = phone.replace(/\D/g, '');
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}
