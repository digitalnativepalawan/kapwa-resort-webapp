import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAppOptions() {
  return useQuery({
    queryKey: ['app-options'],
    queryFn: async () => {
      const { data } = await (supabase.from('app_options' as any) as any)
        .select('*')
        .order('sort_order');
      return (data || []) as { id: string; category: string; label: string; sort_order: number }[];
    },
    staleTime: 60_000,
  });
}

export function getOptionsByCategory(options: { category: string; label: string }[], category: string): string[] {
  return options.filter(o => o.category === category).map(o => o.label);
}
