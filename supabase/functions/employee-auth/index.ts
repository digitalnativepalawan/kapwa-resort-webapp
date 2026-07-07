import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = {
  'Content-Type': 'application/json',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const respond = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, ...jsonHeaders },
  });

const businessError = (message: string, status = 200) =>
  respond({ error: message }, status);

// ── Staff JWT minting ─────────────────────────────────────────────────────────
// Mints a Supabase-compatible HS256 JWT so that authenticated staff requests
// carry a verifiable identity + permission claims that RLS policies can enforce.
// INERT unless STAFF_JWT_SECRET is configured — when it is absent the functions
// behave exactly as before (no token issued), so this is safe to deploy ahead of
// the RLS cutover. STAFF_JWT_SECRET MUST equal the project's JWT secret
// (Settings → API → JWT Settings) so PostgREST accepts the signature.

const STAFF_JWT_TTL_SECONDS = 8 * 60 * 60; // 8 hours, matches the client session

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signStaffJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const segments = [
    base64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))),
    base64url(enc.encode(JSON.stringify(payload))),
  ];
  const signingInput = segments.join('.');
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(signingInput)));
  return `${signingInput}.${base64url(sig)}`;
}

/** Returns a signed staff JWT, or null when STAFF_JWT_SECRET is not configured. */
async function mintStaffToken(emp: any, permissions: string[], isAdmin: boolean): Promise<string | null> {
  const secret = Deno.env.get('STAFF_JWT_SECRET');
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  return await signStaffJwt({
    iss: 'kapwa-staff-auth',
    sub: emp.id,
    aud: 'authenticated',
    role: 'authenticated',
    employee_id: emp.id,
    name: emp.name ?? emp.display_name ?? '',
    permissions,
    is_admin: isAdmin,
    iat: now,
    exp: now + STAFF_JWT_TTL_SECONDS,
  }, secret);
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const hashArray = new Uint8Array(derived);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify that the supplied name + PIN belong to an active employee who holds
 * the 'admin' permission. Used to authorize privileged actions (e.g. resetting
 * another employee's PIN). These functions run with the service-role key and
 * cannot otherwise trust the caller, so the caller must re-prove admin identity.
 */
async function verifyAdminCredentials(
  supabase: any,
  name: string,
  pin: string,
): Promise<{ ok: true; employee: any } | { ok: false; message: string; status: number }> {
  const nameLower = (name ?? '').trim().toLowerCase();
  const { data: allActive } = await supabase.from('employees').select('*').eq('active', true);
  const emp = (allActive || []).find((e: any) =>
    e.name?.toLowerCase() === nameLower || e.display_name?.toLowerCase() === nameLower,
  );
  if (!emp || !emp.password_hash) {
    return { ok: false, message: 'Invalid admin credentials', status: 403 };
  }
  const valid = await verifyPin(pin, emp.password_hash);
  if (!valid) {
    return { ok: false, message: 'Invalid admin credentials', status: 403 };
  }
  const { data: perms } = await supabase
    .from('employee_permissions')
    .select('permission')
    .eq('employee_id', emp.id)
    .eq('permission', 'admin');
  if (!perms || perms.length === 0) {
    return { ok: false, message: 'Admin permission required', status: 403 };
  }
  return { ok: true, employee: emp };
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const salt = combined.slice(0, 16);
  const storedHash = combined.slice(16);
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const derivedArray = new Uint8Array(derived);
  if (derivedArray.length !== storedHash.length) return false;

  let match = true;
  for (let i = 0; i < derivedArray.length; i++) {
    if (derivedArray[i] !== storedHash[i]) match = false;
  }
  return match;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { action, employee_id, name, pin, old_pin, new_pin, admin_name, admin_pin } = body;

    if (action === 'set-password') {
      if (!employee_id || !pin) {
        return businessError('employee_id and pin required', 400);
      }
      if (String(pin).length < 4) {
        return businessError('PIN must be at least 4 digits', 400);
      }

      // Bootstrap exception: if no admin has a PIN yet, allow the first PIN to be
      // set without prior admin auth (initial provisioning). Once any admin holds
      // a PIN, every further PIN reset requires admin re-authentication so that a
      // publicly reachable endpoint can no longer take over arbitrary accounts.
      const { data: adminRows } = await supabase
        .from('employee_permissions')
        .select('employee_id')
        .eq('permission', 'admin');
      const adminIds = (adminRows || []).map((r: any) => r.employee_id);
      let adminHasPin = false;
      if (adminIds.length > 0) {
        const { data: adminEmps } = await supabase
          .from('employees')
          .select('id, password_hash')
          .in('id', adminIds);
        adminHasPin = (adminEmps || []).some((e: any) => !!e.password_hash);
      }

      if (adminHasPin) {
        if (!admin_name || !admin_pin) {
          return businessError('Admin authentication required to set a PIN');
        }
        const adminAuth = await verifyAdminCredentials(supabase, admin_name, admin_pin);
        if (!adminAuth.ok) {
          return businessError(adminAuth.message);
        }
      }

      const hash = await hashPin(pin);
      const { error } = await supabase.from('employees').update({ password_hash: hash }).eq('id', employee_id);
      if (error) throw error;
      return respond({ success: true });
    }

    if (action === 'verify') {
      if (!name || !pin) {
        return businessError('name and pin required');
      }

      const nameLower = name.trim().toLowerCase();
      const { data: allActive } = await supabase.from('employees').select('*').eq('active', true);
      const emp = (allActive || []).find((e: any) =>
        e.name?.toLowerCase() === nameLower || e.display_name?.toLowerCase() === nameLower,
      );

      if (!emp) {
        return businessError('Employee not found');
      }
      if (!emp.password_hash) {
        return businessError('No PIN set. Ask admin to set your PIN.');
      }

      const valid = await verifyPin(pin, emp.password_hash);
      if (!valid) {
        return businessError('Invalid PIN');
      }

      const { data: perms } = await supabase.from('employee_permissions').select('permission').eq('employee_id', emp.id);
      const permList = (perms || []).map((p: any) => p.permission);
      const isAdmin = permList.includes('admin');
      const { password_hash, ...safeEmp } = emp;
      const token = await mintStaffToken(emp, permList, isAdmin);
      return respond({ employee: safeEmp, isAdmin, permissions: permList, token });
    }

    if (action === 'admin-verify') {
      if (!name || !pin) {
        return businessError('name and pin required');
      }

      const adminNameLower = name.trim().toLowerCase();
      const { data: allActiveAdmin } = await supabase.from('employees').select('*').eq('active', true);
      const emp = (allActiveAdmin || []).find((e: any) =>
        e.name?.toLowerCase() === adminNameLower || e.display_name?.toLowerCase() === adminNameLower,
      );

      if (!emp) {
        return businessError('Employee not found');
      }
      if (!emp.password_hash) {
        return businessError('No PIN set. Ask admin to set your PIN.');
      }

      const valid = await verifyPin(pin, emp.password_hash);
      if (!valid) {
        return businessError('Invalid PIN');
      }

      const { data: adminPerm } = await supabase.from('employee_permissions').select('permission').eq('employee_id', emp.id).eq('permission', 'admin');
      if (!adminPerm || adminPerm.length === 0) {
        return businessError('Access denied. Admin permission required.', 403);
      }

      const { data: allPerms } = await supabase.from('employee_permissions').select('permission').eq('employee_id', emp.id);
      const permList = (allPerms || []).map((p: any) => p.permission);
      const { password_hash, ...safeEmp } = emp;
      const token = await mintStaffToken(emp, permList, true);
      return respond({ employee: safeEmp, isAdmin: true, permissions: permList, token });
    }

    if (action === 'change-pin') {
      if (!employee_id || !old_pin || !new_pin) {
        return businessError('employee_id, old_pin, and new_pin required');
      }
      if (new_pin.length < 4) {
        return businessError('New PIN must be at least 4 digits');
      }

      const { data: emp, error } = await supabase.from('employees').select('id, password_hash').eq('id', employee_id).single();
      if (error || !emp) {
        return businessError('Employee not found', 404);
      }
      if (!emp.password_hash) {
        return businessError('No current PIN set. Ask admin to set your PIN first.');
      }

      const valid = await verifyPin(old_pin, emp.password_hash);
      if (!valid) {
        return businessError('Current PIN is incorrect');
      }

      const newHash = await hashPin(new_pin);
      const { error: updateErr } = await supabase.from('employees').update({ password_hash: newHash }).eq('id', employee_id);
      if (updateErr) throw updateErr;
      return respond({ success: true });
    }

    return businessError('Invalid action', 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return respond({ error: message }, 500);
  }
});
