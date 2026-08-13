import { supabase } from '@/integrations/supabase/client';
import { getStaffToken } from '@/lib/session';

/**
 * Fire-and-forget Telegram notification.
 *
 * The `send-telegram` edge function requires a staff JWT (or the internal
 * secret). Guest-facing surfaces (guest portal, guest ordering) have no staff
 * token, so calling it there returns 401 `staff_token_missing`. Those flows are
 * already notified server-side (concierge-ai / guest request routing), so we
 * skip the call instead of surfacing an error.
 *
 * @param group  Comma-separated group keys: kitchen, bar, tours, housekeeping, reception, managers
 * @param message  HTML-formatted message text
 */
export function notifyTelegram(group: string, message: string) {
  if (!getStaffToken()) return Promise.resolve();

  return supabase.functions
    .invoke('send-telegram', { body: { group, message } })
    .then(({ error }) => {
      if (error) console.warn('[telegram] notification skipped:', error.message);
    })
    .catch((err) => {
      // Silent — notifications should never block operations
      console.warn('[telegram] notification failed:', err);
    });
}
