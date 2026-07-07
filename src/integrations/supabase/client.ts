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
  return (input, init) => {
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
      // New publishable keys are opaque API keys, not bearer JWTs.
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
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
