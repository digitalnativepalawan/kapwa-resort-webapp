import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InvoiceSettings {
  id: string;
  thank_you_message: string;
  business_hours: string;
  footer_text: string;
  tin_number: string;
  service_charge_pct: number;
  show_service_charge: boolean;
  show_payment_method: boolean;
  created_at: string;
  updated_at: string;
}

export const useInvoiceSettings = () => {
  return useQuery({
    queryKey: ['invoice-settings'],
    queryFn: async () => {
      const { data } = await (supabase.from('invoice_settings' as any) as any)
        .select('*')
        .limit(1)
        .maybeSingle();
      return data as InvoiceSettings | null;
    },
  });
};
