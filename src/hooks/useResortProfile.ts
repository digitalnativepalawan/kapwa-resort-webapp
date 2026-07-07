import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ResortProfile {
  id: string;
  logo_url: string;
  resort_name: string;
  tagline: string;
  address: string;
  phone: string;
  contact_name: string;
  contact_number: string;
  email: string;
  google_map_embed: string;
  google_map_url: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  website_url: string;
  logo_size: number | null;
  created_at: string;
}

export const useResortProfile = () => {
  return useQuery({
    queryKey: ['resort-profile'],
    queryFn: async () => {
      const { data } = await supabase
        .from('resort_profile')
        .select('*')
        .limit(1)
        .single();
      return data as ResortProfile | null;
    },
  });
};
