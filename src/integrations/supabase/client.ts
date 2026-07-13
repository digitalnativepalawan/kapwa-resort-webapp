import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getStaffToken } from '@/lib/session';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const USE_STAFF_JWT = import.meta.env.VITE_USE_STAFF_JWT === 'true';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    const currentAuthorization = headers.get('Authorization');
    const staffToken = USE_STAFF_JWT ? getStaffToken() : null;

    if (staffToken) {
      headers.set('Authorization', `Bearer ${staffToken}`);
    } else if (
      isNewSupabaseApiKey(supabaseKey)
      && currentAuthorization === `Bearer ${supabaseKey}`
    ) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    let response = await fetch(input, { ...init, headers });

    // If we sent a staff token and got 401, retry without it (token may be expired)
    if (response.status === 401 && staffToken) {
      headers.delete('Authorization');
      response = await fetch(input, { ...init, headers });
      if (response.ok || response.status !== 401) {
        // Clear the invalid staff session
        localStorage.removeItem('staff_home_session');
        sessionStorage.removeItem('staff_home_session');
      }
    }

    return response;
  };
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
  },
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
