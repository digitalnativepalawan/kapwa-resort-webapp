import { supabase } from '@/integrations/supabase/client';

/**
 * Fire-and-forget Telegram notification.
 * @param group  Comma-separated group keys: kitchen, bar, tours, housekeeping, reception, managers
 * @param message  HTML-formatted message text
 */
export function notifyTelegram(group: string, message: string) {
  supabase.functions.invoke('send-telegram', {
    body: { group, message },
  }).catch(() => {
    // Silent — notifications should never block operations
  });
}
