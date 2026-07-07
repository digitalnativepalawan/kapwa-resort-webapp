export interface OrderGroup {
  key: string;
  label: string;
  guestName: string;
  orders: any[];
  items: Array<{ name: string; qty: number; price: number; department?: string }>;
  total: number;
  serviceCharge: number;
  worstStatus: string;
  oldestCreatedAt: string;
  hasRoomCharge: boolean;
  hasTab: boolean;
  roomId: string | null;
}

const STATUS_RANK: Record<string, number> = {
  New: 0,
  Preparing: 1,
  Ready: 2,
  Served: 3,
  Paid: 4,
};

export function groupOrdersByUnit(orders: any[]): OrderGroup[] {
  const groups: Record<string, OrderGroup> = {};

  orders.forEach(order => {
    const key = order.location_detail || `_solo_${order.id}`;

    if (!groups[key]) {
      groups[key] = {
        key,
        label: order.location_detail || order.order_type || 'Walk-in',
        guestName: order.guest_name || '',
        orders: [],
        items: [],
        total: 0,
        serviceCharge: 0,
        worstStatus: order.status,
        oldestCreatedAt: order.created_at,
        hasRoomCharge: false,
        hasTab: false,
        roomId: order.room_id || null,
      };
    }

    const g = groups[key];
    g.orders.push(order);
    g.total += Number(order.total) || 0;
    g.serviceCharge += Number(order.service_charge) || 0;

    if (!g.guestName && order.guest_name) g.guestName = order.guest_name;
    if (order.room_id && !g.roomId) g.roomId = order.room_id;
    if (order.payment_type === 'Charge to Room') g.hasRoomCharge = true;
    if (order.tab_id) g.hasTab = true;

    // Worst-case status (lowest rank)
    if ((STATUS_RANK[order.status] ?? 99) < (STATUS_RANK[g.worstStatus] ?? 99)) {
      g.worstStatus = order.status;
    }

    if (order.created_at < g.oldestCreatedAt) {
      g.oldestCreatedAt = order.created_at;
    }

    // Merge items
    const orderItems = (order.items as any[]) || [];
    orderItems.forEach((item: any) => {
      g.items.push({
        name: item.name,
        qty: item.qty || item.quantity || 1,
        price: item.price,
        department: item.department,
      });
    });
  });

  return Object.values(groups).sort(
    (a, b) => new Date(a.oldestCreatedAt).getTime() - new Date(b.oldestCreatedAt).getTime()
  );
}
