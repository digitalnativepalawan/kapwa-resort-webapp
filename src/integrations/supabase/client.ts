import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getStaffToken } from '@/lib/session';
import { shouldAttachStaffJwt } from '@/lib/staffAuth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
    const isEdgeFunction = requestUrl(input).includes('/functions/v1/');
    const staffToken = getStaffToken();

    // Edge functions always get the staff JWT — they verify it themselves
    // (supabase/functions/_shared/auth.ts) and a bad token there costs one
    // endpoint, not the whole app.
    //
    // PostgREST is the risky one: if it cannot validate the signature it
    // answers 401 to *every* query. shouldAttachStaffJwt only returns true once
    // we have observed PostgREST accept this token. See lib/staffAuth.ts.
    const attach = isEdgeFunction ? Boolean(staffToken) : shouldAttachStaffJwt(staffToken);

    if (attach && staffToken) {
      headers.set('Authorization', `Bearer ${staffToken}`);
    } else if (
      isNewSupabaseApiKey(supabaseKey)
      && currentAuthorization === `Bearer ${supabaseKey}`
    ) {
      // Opaque publishable keys are not JWTs. Sending one as a Bearer token
      // makes PostgREST try to decode it and fail; the `apikey` header below is
      // the correct carrier.
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
