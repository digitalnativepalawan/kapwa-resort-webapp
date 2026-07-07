import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PaymentMethod {
  id: string;
  name: string;
  is_active: boolean;
  requires_approval: boolean;
  sort_order: number;
  created_at: string;
}

export const usePaymentMethods = () => {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const { data } = await (supabase.from('payment_methods' as any) as any)
        .select('*')
        .order('sort_order');
      return (data || []) as PaymentMethod[];
    },
  });
};
