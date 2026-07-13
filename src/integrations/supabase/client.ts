import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getStaffToken } from '@/lib/session';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const USE_STAFF_JWT = import.meta.env.VITE_USE_STAFF_JWT === 'true';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return '';
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
    // Only attach the staff JWT to edge-function calls. PostgREST cannot decode it
    // and rejects the request with 401 "No suitable key or wrong key type".
    const isEdgeFunction = requestUrl(input).includes('/functions/v1/');
    const staffToken = (USE_STAFF_JWT || isEdgeFunction) ? getStaffToken() : null;

    if (staffToken && isEdgeFunction) {
      headers.set('Authorization', `Bearer ${staffToken}`);
    } else if (staffToken && USE_STAFF_JWT) {
      headers.set('Authorization', `Bearer ${staffToken}`);
    } else if (
      isNewSupabaseApiKey(supabaseKey)
      && currentAuthorization === `Bearer ${supabaseKey}`
    ) {
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
