import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BillingConfig {
  id: string;
  enable_tax: boolean;
  tax_name: string;
  tax_rate: number;
  enable_service_charge: boolean;
  service_charge_name: string;
  service_charge_rate: number;
  enable_city_tax: boolean;
  city_tax_name: string;
  city_tax_rate: number;
  allow_room_charging: boolean;
  require_deposit: boolean;
  require_signature_above: number;
  notify_charges_above: number;
  default_payment_method: string;
  show_staff_on_receipt: boolean;
  show_itemized_taxes: boolean;
  show_payment_on_receipt: boolean;
  show_room_on_receipt: boolean;
  receipt_header: string;
  receipt_footer: string;
  created_at: string;
  updated_at: string;
}

export const useBillingConfig = () => {
  return useQuery({
    queryKey: ['billing-config'],
    queryFn: async () => {
      const { data } = await (supabase.from('billing_config' as any) as any)
        .select('*')
        .limit(1)
        .maybeSingle();
      return data as BillingConfig | null;
    },
  });
};
