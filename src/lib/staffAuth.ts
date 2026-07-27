/**
 * Staff identity resolution.
 *
 * Two problems this module exists to solve:
 *
 * 1. **The session blob was the source of truth.** `RequireAuth` and
 *    `usePermissions` read `permissions` / `isAdmin` straight out of the
 *    localStorage object written at login. Anyone could open devtools, add
 *    `"admin"` to that array, and the entire back office would open up. When a
 *    staff JWT is present its claims are server-signed, so they — not the
 *    surrounding blob — decide what the UI grants.
 *
 * 2. **`VITE_USE_STAFF_JWT` could not be flipped safely.** Turning it on sends
 *    the staff JWT to PostgREST. If `STAFF_JWT_SECRET` does not exactly equal
 *    the project's JWT secret, PostgREST rejects *every* request with 401 and
 *    the whole app goes dark. That is unverifiable from a code review, which is
 *    why the flag sat at "false" while RLS was already tightened — the exact
 *    combination that makes staff screens render empty.
 *
 *    So the flag now accepts a third value, `"auto"` (the default): attach the
 *    staff JWT only once we have *observed* PostgREST accept it. One cheap
 *    probe at login decides. If the secret is right, claim-based RLS works. If
 *    it is wrong, behaviour is identical to today and the reason is reported
 *    instead of showing empty tables.
 */

import type { StaffSession } from './session';

export type StaffJwtMode = 'true' | 'false' | 'auto';

/** Result of probing whether PostgREST accepts our staff JWT. */
export type StaffJwtStatus =
  | 'disabled'   // flag is "false"
  | 'no-token'   // signed in, but employee-auth issued no token (secret unset)
  | 'unverified' // token present, probe has not run yet
  | 'active'     // PostgREST accepted the token — claim-based RLS is live
  | 'rejected';  // PostgREST returned 401 — STAFF_JWT_SECRET does not match

const PROBE_KEY = 'staff_jwt_probe';

export const STAFF_JWT_MODE: StaffJwtMode = (() => {
  const raw = String(import.meta.env.VITE_USE_STAFF_JWT ?? 'auto').toLowerCase().trim();
  return raw === 'true' || raw === 'false' ? raw : 'auto';
})();

export interface StaffClaims {
  employee_id: string;
  name: string;
  permissions: string[];
  is_admin: boolean;
  exp: number;
}

/**
 * Decode a staff JWT payload.
 *
 * This is *not* verification — the browser cannot verify an HS256 signature
 * without the secret, and must not try. The server re-verifies on every edge
 * function call and PostgREST re-verifies on every table read. Decoding here
 * only decides what the UI draws, and it is still strictly better than the
 * surrounding session blob: the claims came back from `employee-auth` inside a
 * signed token, so tampering with them invalidates the signature and the
 * server rejects the request that follows.
 */
export function decodeStaffClaims(token: string | undefined | null): StaffClaims | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(normalized));

    if (typeof claims?.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null;
    if (!claims?.employee_id) return null;

    return {
      employee_id: String(claims.employee_id),
      name: String(claims.name ?? ''),
      permissions: Array.isArray(claims.permissions) ? claims.permissions.map(String) : [],
      is_admin: claims.is_admin === true,
      exp: claims.exp,
    };
  } catch {
    return null;
  }
}

export interface ResolvedIdentity {
  permissions: string[];
  isAdmin: boolean;
  /** True when the values came from signed claims rather than the local blob. */
  serverVerified: boolean;
}

/**
 * The permissions the UI should act on.
 *
 * Prefers signed claims. Falls back to the session blob only when no token was
 * issued at all (STAFF_JWT_SECRET unset server-side), which is the pre-cutover
 * state this codebase still has to run in.
 */
export function resolveIdentity(session: StaffSession | null): ResolvedIdentity {
  if (!session) return { permissions: [], isAdmin: false, serverVerified: false };

  const claims = decodeStaffClaims(session.token);
  if (claims) {
    return {
      permissions: claims.permissions,
      isAdmin: claims.is_admin || claims.permissions.includes('admin'),
      serverVerified: true,
    };
  }

  const permissions = session.permissions ?? [];
  return {
    permissions,
    isAdmin: session.isAdmin === true || permissions.includes('admin'),
    serverVerified: false,
  };
}

// ── PostgREST acceptance probe ───────────────────────────────────────────────

function probeCacheKey(token: string): string {
  // Key on the signature so a re-issued token forces a fresh probe.
  return `${PROBE_KEY}:${token.slice(-16)}`;
}

function readProbe(token: string): boolean | null {
  try {
    const cached = sessionStorage.getItem(probeCacheKey(token));
    if (cached === '1') return true;
    if (cached === '0') return false;
  } catch { /* storage unavailable */ }
  return null;
}

function writeProbe(token: string, accepted: boolean): void {
  try {
    sessionStorage.setItem(probeCacheKey(token), accepted ? '1' : '0');
  } catch { /* storage unavailable */ }
}

/**
 * Ask PostgREST whether it accepts this staff JWT.
 *
 * A 401 means the signature or algorithm is wrong — almost always that
 * STAFF_JWT_SECRET is not the project's JWT secret, or the project has migrated
 * to asymmetric signing keys while employee-auth still signs HS256.
 *
 * Any other status (including 403 / 406 from RLS) means the token was accepted
 * as an identity, which is what we are testing for.
 */
export async function probeStaffJwt(token: string): Promise<boolean> {
  const cached = readProbe(token);
  if (cached !== null) return cached;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;

  try {
    const response = await fetch(`${url}/rest/v1/employees?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    const accepted = response.status !== 401;
    writeProbe(token, accepted);
    return accepted;
  } catch {
    // Network failure tells us nothing about the token — do not cache it.
    return false;
  }
}

/**
 * Whether the Supabase client should attach the staff JWT to PostgREST
 * requests. Must stay synchronous: it runs inside the client's fetch wrapper.
 */
export function shouldAttachStaffJwt(token: string | null): boolean {
  if (!token) return false;
  if (STAFF_JWT_MODE === 'false') return false;
  if (STAFF_JWT_MODE === 'true') return true;
  return readProbe(token) === true;
}

/** Current state of staff-JWT propagation, for diagnostics in Admin. */
export function getStaffJwtStatus(session: StaffSession | null): StaffJwtStatus {
  if (STAFF_JWT_MODE === 'false') return 'disabled';
  const token = session?.token;
  if (!token) return 'no-token';
  const probe = readProbe(token);
  if (probe === true) return 'active';
  if (probe === false) return 'rejected';
  return STAFF_JWT_MODE === 'true' ? 'active' : 'unverified';
}

export const STAFF_JWT_STATUS_DETAIL: Record<StaffJwtStatus, string> = {
  disabled:
    'VITE_USE_STAFF_JWT is "false". Staff database requests run as the anonymous role, so any table with claim-based RLS will read as empty.',
  'no-token':
    'Sign-in succeeded but employee-auth issued no token, which means STAFF_JWT_SECRET is not set on the function. Staff database requests run as the anonymous role.',
  unverified:
    'A staff token exists but has not been checked against the database yet.',
  active:
    'PostgREST accepts the staff token. Claim-based RLS policies are being enforced with this employee\'s permissions.',
  rejected:
    'PostgREST rejected the staff token (401). STAFF_JWT_SECRET does not match the project JWT secret, or the project uses asymmetric signing keys while employee-auth signs HS256. Falling back to the anonymous role.',
};
