import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RoomTransaction {
  id: string;
  unit_id: string | null;
  unit_name: string;
  guest_name: string | null;
  booking_id: string | null;
  transaction_type: string;
  order_id: string | null;
  amount: number;
  tax_amount: number;
  service_charge_amount: number;
  total_amount: number;
  payment_method: string;
  staff_name: string;
  notes: string | null;
  created_at: string;
}

export const useRoomTransactions = (unitId: string | null, bookingId?: string | null) => {
  return useQuery({
    queryKey: ['room-transactions', unitId, bookingId],
    enabled: !!unitId,
    queryFn: async () => {
      let query = (supabase.from('room_transactions' as any) as any)
        .select('*')
        .eq('unit_id', unitId);
      if (bookingId) {
        query = query.eq('booking_id', bookingId);
      }
      const { data } = await query.order('created_at', { ascending: false });
      return (data || []) as RoomTransaction[];
    },
  });
};
