// NOTE: Lovable normally regenerates this file, but it is intentionally edited to
// support claim-based auth. Keep changes minimal if it is ever re-generated.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getStaffToken } from '@/lib/session';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Feature flag for claim-based auth. When 'true', every request carries the staff
// JWT (falling back to the anon key when no one is logged in). Default OFF so the
// app behaves exactly as before until the JWT secret is configured and RLS is
// migrated on a staging project. See docs/security/rls-migration.md.
const USE_STAFF_JWT = import.meta.env.VITE_USE_STAFF_JWT === 'true';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = USE_STAFF_JWT
  ? createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      // Supply the staff JWT (or the anon key when logged out) on every request.
      // PostgREST validates the signature against the project JWT secret.
      accessToken: async () => getStaffToken() ?? SUPABASE_PUBLISHABLE_KEY,
    })
  : createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
