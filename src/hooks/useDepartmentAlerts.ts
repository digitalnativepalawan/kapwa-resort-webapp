import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay } from 'date-fns';

export interface DepartmentAlerts {
  reception: boolean;
  kitchen: boolean;
  bar: boolean;
  orders: boolean;
  housekeeping: boolean;
  experiences: boolean;
}

export function useDepartmentAlerts(): DepartmentAlerts {
  const today = startOfDay(new Date()).toISOString();

  // Active orders from today
  const { data: activeOrders } = useQuery({
    queryKey: ['dept-alerts-orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('status, kitchen_status, bar_status, items')
        .gte('created_at', today)
        .in('status', ['New', 'Preparing', 'Ready', 'Served']);
      return data || [];
    },
    refetchInterval: 10_000,
  });

  // Pending guest requests
  const { data: pendingRequests } = useQuery({
    queryKey: ['dept-alerts-requests'],
    queryFn: async () => {
      const { count } = await supabase
        .from('guest_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      return count || 0;
    },
    refetchInterval: 10_000,
  });

  // Pending housekeeping orders
  const { data: pendingHK } = useQuery({
    queryKey: ['dept-alerts-housekeeping'],
    queryFn: async () => {
      const { count } = await supabase
        .from('housekeeping_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending_inspection', 'pending_cleaning']);
      return count || 0;
    },
    refetchInterval: 10_000,
  });

  // Pending tours
  const { data: pendingTours } = useQuery({
    queryKey: ['dept-alerts-tours'],
    queryFn: async () => {
      const { count } = await supabase
        .from('guest_tours')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'booked');
      return count || 0;
    },
    refetchInterval: 10_000,
  });

  const orders = activeOrders || [];

  const hasNewOrders = orders.some(o => o.status === 'New');

  const hasPendingKitchen = orders.some(o => {
    if (o.kitchen_status !== 'pending') return false;
    const items = (o.items as any[]) || [];
    return items.some((i: any) => { const d = i.department || 'kitchen'; return d === 'kitchen' || d === 'both'; });
  });

  const hasPendingBar = orders.some(o => {
    if (o.bar_status !== 'pending') return false;
    const items = (o.items as any[]) || [];
    return items.some((i: any) => i.department === 'bar' || i.department === 'both');
  });

  return {
    reception: hasNewOrders || (pendingRequests || 0) > 0,
    kitchen: hasPendingKitchen,
    bar: hasPendingBar,
    orders: hasNewOrders,
    housekeeping: (pendingHK || 0) > 0,
    experiences: (pendingTours || 0) > 0,
  };
}
