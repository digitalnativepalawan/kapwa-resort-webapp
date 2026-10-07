/**
 * KAPWA Hospitality OS — Database & Services Client Entry Point
 *
 * Exports `supabase` as an alias to `kapwaClient` so existing UI modules
 * continue to work unchanged against the standalone KAPWA backend.
 */
import { kapwaClient } from '@/lib/kapwaClient';

export const supabase = kapwaClient;
export { kapwaClient };
