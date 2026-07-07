import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PayrollSettings {
  id: string;
  payday_type: string;
  payday_day_of_week: number;
  payday_days_interval: number;
  eom_bonus_amount: number;
  created_at: string;
  updated_at: string;
}

export const usePayrollSettings = () => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['payroll-settings'],
    queryFn: async () => {
      const { data } = await (supabase.from('payroll_settings' as any) as any)
        .select('*')
        .limit(1)
        .maybeSingle();
      return data as PayrollSettings | null;
    },
  });

  const upsert = async (updates: Partial<PayrollSettings>) => {
    const existing = query.data;
    if (existing) {
      await (supabase.from('payroll_settings' as any) as any)
        .update(updates)
        .eq('id', existing.id);
    } else {
      await (supabase.from('payroll_settings' as any) as any)
        .insert(updates);
    }
    qc.invalidateQueries({ queryKey: ['payroll-settings'] });
    toast.success('Payroll settings saved');
  };

  return { settings: query.data, isLoading: query.isLoading, upsert };
};
