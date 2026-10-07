import type { StaffSession } from '@/lib/session';

/**
 * Staff authentication mode.
 *
 * - "false": compatibility mode. Token is requested and stored, but never sent
 *   on database requests.
 * - "auto" (default): probe `/api/auth/probe` once with the minted token;
 *   attach it only if the server accepts the signature.
 * - "true": hard cutover. Always attach the token; refuse sessions without one.
 */
export const STAFF_JWT_MODE: 'false' | 'auto' | 'true' = (() => {
  const raw = String(import.meta.env.VITE_ENFORCE_STAFF_JWT ?? 'auto').toLowerCase();
  if (raw === 'true' || raw === 'false') return raw;
  return 'auto';
})();

export interface StaffJwtClaims {
  employee_id: string;
  name: string;
  permissions: string[];
  is_admin: boolean;
  exp: number;
}

/**
 * Decode the payload of a staff JWT for client-side routing/UI decisions.
 * Cryptographic verification always happens on the KAPWA server.
 */
export function decodeStaffClaims(token?: string | null): StaffJwtClaims | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded));
    if (typeof payload?.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      return null;
    }
    if (!payload?.employee_id) return null;
    return {
      employee_id: String(payload.employee_id),
      name: String(payload.name ?? ''),
      permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String) : [],
      is_admin: payload.is_admin === true || (Array.isArray(payload.permissions) && payload.permissions.includes('admin')),
      exp: Number(payload.exp ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the effective permissions and admin flag for a session.
 * When a non-expired token is present, its claims win over the mutable
 * localStorage fields (`session.permissions` / `session.isAdmin`).
 */
export function resolveIdentity(session: StaffSession | null): {
  permissions: string[];
  isAdmin: boolean;
  serverVerified: boolean;
} {
  if (!session) return { permissions: [], isAdmin: false, serverVerified: false };
  const claims = decodeStaffClaims(session.token);
  if (claims) {
    return {
      permissions: claims.permissions,
      isAdmin: claims.is_admin,
      serverVerified: true,
    };
  }
  const permissions = session.permissions ?? [];
  return {
    permissions,
    isAdmin: Boolean(session.isAdmin || permissions.includes('admin')),
    serverVerified: false,
  };
}

const PROBE_CACHE_PREFIX = 'staff_jwt_probe:';

function probeKey(token: string): string {
  return PROBE_CACHE_PREFIX + token.slice(-16);
}

/** Synchronous check used inside the request interceptor. */
export function shouldAttachStaffJwt(token: string | null): boolean {
  if (!token || STAFF_JWT_MODE === 'false') return false;
  if (STAFF_JWT_MODE === 'true') return true;
  try {
    return sessionStorage.getItem(probeKey(token)) === '1';
  } catch {
    return false;
  }
}

/**
 * Ask the KAPWA backend once whether it accepts this token's signature.
 * Caches the answer in sessionStorage so `shouldAttachStaffJwt` stays synchronous.
 */
export async function probeStaffJwt(token: string): Promise<boolean> {
  if (!token || STAFF_JWT_MODE === 'false') return false;
  try {
    const cached = sessionStorage.getItem(probeKey(token));
    if (cached === '1') return true;
    if (cached === '0') return false;
  } catch {
    // sessionStorage unavailable
  }

  const apiBase = (import.meta.env.VITE_KAPWA_API_URL || '').replace(/\/$/, '');
  try {
    const res = await fetch(`${apiBase}/api/auth/probe`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const accepted = res.status < 400;
    try {
      sessionStorage.setItem(probeKey(token), accepted ? '1' : '0');
    } catch {
      // ignore storage errors
    }
    return accepted;
  } catch {
    return false;
  }
}
