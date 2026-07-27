// ─────────────────────────────────────────────────────────────────────────────
// Shared edge-function authorization.
//
// Every function in this project runs with `verify_jwt = false` (see
// supabase/config.toml for why: the browser holds an opaque `sb_publishable_`
// key, which the gateway cannot validate as a JWT). Authorization therefore has
// to happen here, in the handler.
//
// Three guards are exported:
//   requireStaff()    — verifies the HS256 staff JWT minted by employee-auth
//   requireAdmin()    — requireStaff() plus the `admin` permission
//   requireInternal() — verifies the INTERNAL_FN_SECRET header
//
// Staged rollout: requireStaff/requireAdmin only *enforce* once
// STAFF_JWT_SECRET is configured. Without that secret employee-auth cannot mint
// tokens at all, so enforcing would lock every staff member out of every
// endpoint at once. Until it is set the guards resolve with `enforced: false`
// and the caller proceeds as before. Set STAFF_JWT_SECRET to turn the whole
// surface on; there is no per-function flag to forget.
// ─────────────────────────────────────────────────────────────────────────────

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export const jsonHeaders = { "Content-Type": "application/json" };

export interface StaffClaims {
  employee_id: string;
  name: string;
  permissions: string[];
  is_admin: boolean;
  exp: number;
}

export type Guard =
  | { ok: true; enforced: boolean; claims: StaffClaims | null }
  | { ok: false; response: Response };

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, ...jsonHeaders },
  });
}

/** Standard OPTIONS preflight response. Return this before any guard runs. */
export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response(null, { headers: corsHeaders }) : null;
}

function base64urlToBytes(segment: string): Uint8Array {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(segment.length + ((4 - (segment.length % 4)) % 4), "=");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Constant-time byte comparison — avoids leaking signature bytes via timing. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verify an HS256 staff JWT against STAFF_JWT_SECRET.
 * Returns the claims, or null when the token is absent/malformed/expired or the
 * signature does not match. Never throws.
 */
export async function verifyStaffJwt(token: string, secret: string): Promise<StaffClaims | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    const header = JSON.parse(new TextDecoder().decode(base64urlToBytes(headerB64)));
    if (header?.alg !== "HS256") return null;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const expected = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, enc.encode(`${headerB64}.${payloadB64}`)),
    );
    if (!timingSafeEqual(expected, base64urlToBytes(signatureB64))) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64)));
    if (typeof payload?.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!payload?.employee_id) return null;

    return {
      employee_id: String(payload.employee_id),
      name: String(payload.name ?? ""),
      permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String) : [],
      is_admin: payload.is_admin === true,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  // The Supabase JS client falls back to the publishable key when no staff
  // session exists. That is not a staff token — treat it as absent.
  if (!token || token.startsWith("sb_publishable_") || token.startsWith("sb_secret_")) return null;
  return token;
}

/**
 * Require a valid staff JWT.
 *
 * Inert (ok: true, enforced: false, claims: null) until STAFF_JWT_SECRET is set,
 * so this can be deployed ahead of the auth cutover without breaking anything.
 */
export async function requireStaff(req: Request): Promise<Guard> {
  const secret = Deno.env.get("STAFF_JWT_SECRET");
  if (!secret) return { ok: true, enforced: false, claims: null };

  const token = bearer(req);
  if (!token) {
    return {
      ok: false,
      response: json({ error: "Staff sign-in required.", code: "staff_token_missing" }, 401),
    };
  }

  const claims = await verifyStaffJwt(token, secret);
  if (!claims) {
    return {
      ok: false,
      response: json(
        { error: "Your session has expired. Please sign in again.", code: "staff_token_invalid" },
        401,
      ),
    };
  }

  return { ok: true, enforced: true, claims };
}

/** Require a valid staff JWT that carries the `admin` permission. */
export async function requireAdmin(req: Request): Promise<Guard> {
  const guard = await requireStaff(req);
  if (!guard.ok || !guard.enforced) return guard;

  const claims = guard.claims!;
  if (!claims.is_admin && !claims.permissions.includes("admin")) {
    return {
      ok: false,
      response: json({ error: "Admin permission required.", code: "admin_required" }, 403),
    };
  }
  return guard;
}

/**
 * Require the shared internal secret. Used by cron / server-to-server callers.
 * Inert until INTERNAL_FN_SECRET is set, matching the existing guards.
 */
export function requireInternal(req: Request): Guard {
  const secret = Deno.env.get("INTERNAL_FN_SECRET");
  if (!secret) return { ok: true, enforced: false, claims: null };

  const supplied = req.headers.get("x-internal-secret");
  if (supplied !== secret) {
    return { ok: false, response: json({ error: "Forbidden", code: "internal_secret_invalid" }, 403) };
  }
  return { ok: true, enforced: true, claims: null };
}

/**
 * Accept either a staff JWT or the internal secret. For endpoints that serve
 * both the back office and an automated caller (cron, Telegram bot).
 */
export async function requireStaffOrInternal(req: Request): Promise<Guard> {
  const internal = requireInternal(req);
  if (internal.ok && internal.enforced) return internal;

  const staff = await requireStaff(req);
  if (staff.ok) return staff;

  // Neither credential validated. Surface the staff error — it is the one a
  // human is most likely looking at.
  return staff;
}
