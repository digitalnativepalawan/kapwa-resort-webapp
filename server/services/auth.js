import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);
const STAFF_JWT_TTL_SECONDS = 8 * 60 * 60; // 8 hours

// Default secret for local standalone development when STAFF_JWT_SECRET is not set in env
const DEFAULT_DEV_JWT_SECRET = 'kapwa-standalone-jwt-secret-change-in-production-2026';

export function getJwtSecret() {
  const envSecret = (process.env.STAFF_JWT_SECRET || '').trim();
  return envSecret || DEFAULT_DEV_JWT_SECRET;
}

export function getInternalSecret() {
  return (process.env.INTERNAL_FN_SECRET || 'kapwa-internal-fn-secret-dev').trim();
}

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(segment) {
  const padded = String(segment || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(segment.length + ((4 - (segment.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

export function signStaffJwt(payload, secret = getJwtSecret()) {
  const headerSegment = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${toBase64Url(sig)}`;
}

export function verifyStaffJwt(token, secret = getJwtSecret()) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    const header = JSON.parse(fromBase64Url(headerB64).toString('utf8'));
    if (header?.alg !== 'HS256') return null;

    const expectedSig = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest();
    const actualSig = fromBase64Url(signatureB64);
    if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
      return null;
    }

    const payload = JSON.parse(fromBase64Url(payloadB64).toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload?.exp !== 'number' || payload.exp <= nowSec) return null;
    if (!payload?.employee_id) return null;

    return {
      employee_id: String(payload.employee_id),
      name: String(payload.name ?? ''),
      permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String) : [],
      is_admin: payload.is_admin === true || (Array.isArray(payload.permissions) && payload.permissions.includes('admin')),
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function mintStaffToken(emp, permissions = [], isAdmin = false) {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  return signStaffJwt(
    {
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
    },
    secret,
  );
}

export async function hashPin(pin) {
  const salt = randomBytes(16);
  const derived = await pbkdf2Async(String(pin), salt, 100000, 32, 'sha256');
  return Buffer.concat([salt, derived]).toString('base64');
}

export async function verifyPin(pin, storedHashB64) {
  try {
    const combined = Buffer.from(String(storedHashB64), 'base64');
    if (combined.length <= 16) return false;
    const salt = combined.subarray(0, 16);
    const storedHash = combined.subarray(16);
    const derived = await pbkdf2Async(String(pin), salt, 100000, 32, 'sha256');
    if (derived.length !== storedHash.length) return false;
    return timingSafeEqual(derived, storedHash);
  } catch {
    return false;
  }
}

// ── PIN Brute-Force Rate Limiter ────────────────────────────────────────────
const failedAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

function checkRateLimit(key) {
  const entry = failedAttempts.get(key);
  if (!entry) return { blocked: false };
  if (Date.now() > entry.resetAt) {
    failedAttempts.delete(key);
    return { blocked: false };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { blocked: true, retryAfterSec: Math.ceil((entry.resetAt - Date.now()) / 1000) };
  }
  return { blocked: false };
}

function recordFailure(key) {
  const now = Date.now();
  const entry = failedAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    failedAttempts.set(key, { count: 1, resetAt: now + LOCKOUT_MS });
  } else {
    entry.count += 1;
  }
}

function clearFailures(key) {
  failedAttempts.delete(key);
}

// ── Request Identity Extraction ─────────────────────────────────────────────
export function extractBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token || token.startsWith('sb_publishable_') || token.startsWith('sb_secret_')) return null;
  return token;
}

export function extractStaffClaims(req) {
  const token = extractBearerToken(req);
  if (!token) return null;
  return verifyStaffJwt(token);
}

export function isInternalAuthorized(req) {
  const supplied = req.headers?.['x-internal-secret'];
  const expected = getInternalSecret();
  return Boolean(supplied && expected && supplied === expected);
}

/**
 * Employee Authentication Service Handler (replaces `employee-auth` Edge Function).
 */
export async function handleEmployeeAuth(db, body = {}, clientIp = 'local') {
  const { action, employee_id, name, pin, old_pin, new_pin, admin_name, admin_pin } = body || {};

  async function verifyAdminCredentials(adminName, adminPin) {
    const nameLower = String(adminName ?? '').trim().toLowerCase();
    const { data: allActive } = await db.from('employees').select('*').eq('active', true);
    const emp = (allActive || []).find(
      (e) => e.name?.toLowerCase() === nameLower || e.display_name?.toLowerCase() === nameLower,
    );
    if (!emp || !emp.password_hash) {
      return { ok: false, message: 'Invalid admin credentials', status: 403 };
    }
    const valid = await verifyPin(adminPin, emp.password_hash);
    if (!valid) {
      return { ok: false, message: 'Invalid admin credentials', status: 403 };
    }
    const { data: perms } = await db
      .from('employee_permissions')
      .select('permission')
      .eq('employee_id', emp.id)
      .eq('permission', 'admin');
    if (!perms || perms.length === 0) {
      return { ok: false, message: 'Admin permission required', status: 403 };
    }
    return { ok: true, employee: emp };
  }

  if (action === 'set-password') {
    if (!employee_id || !pin) {
      return { status: 400, payload: { error: 'employee_id and pin required' } };
    }
    if (String(pin).length < 4) {
      return { status: 400, payload: { error: 'PIN must be at least 4 digits' } };
    }

    const { data: adminRows } = await db
      .from('employee_permissions')
      .select('employee_id')
      .eq('permission', 'admin');
    const adminIds = (adminRows || []).map((r) => r.employee_id);
    let adminHasPin = false;
    if (adminIds.length > 0) {
      const { data: adminEmps } = await db
        .from('employees')
        .select('id, password_hash')
        .in('id', adminIds);
      adminHasPin = (adminEmps || []).some((e) => Boolean(e.password_hash));
    }

    if (adminHasPin) {
      if (!admin_name || !admin_pin) {
        return { status: 200, payload: { error: 'Admin authentication required to set a PIN' } };
      }
      const adminAuth = await verifyAdminCredentials(admin_name, admin_pin);
      if (!adminAuth.ok) {
        return { status: 200, payload: { error: adminAuth.message } };
      }
    }

    const hash = await hashPin(pin);
    const { error } = await db.from('employees').update({ password_hash: hash }).eq('id', employee_id);
    if (error) throw new Error(error.message);
    return { status: 200, payload: { success: true } };
  }

  if (action === 'verify') {
    if (!name || !pin) {
      return { status: 200, payload: { error: 'name and pin required' } };
    }

    const nameLower = String(name).trim().toLowerCase();
    const rateKey = `${clientIp}:${nameLower}`;
    const limit = checkRateLimit(rateKey);
    if (limit.blocked) {
      return {
        status: 429,
        payload: { error: `Too many failed PIN attempts. Try again in ${limit.retryAfterSec}s.` },
      };
    }

    const { data: allActive } = await db.from('employees').select('*').eq('active', true);
    const emp = (allActive || []).find(
      (e) => e.name?.toLowerCase() === nameLower || e.display_name?.toLowerCase() === nameLower,
    );

    if (!emp) {
      recordFailure(rateKey);
      return { status: 200, payload: { error: 'Employee not found' } };
    }
    if (!emp.password_hash) {
      return { status: 200, payload: { error: 'No PIN set. Ask admin to set your PIN.' } };
    }

    const valid = await verifyPin(pin, emp.password_hash);
    if (!valid) {
      recordFailure(rateKey);
      return { status: 200, payload: { error: 'Invalid PIN' } };
    }

    clearFailures(rateKey);
    const { data: perms } = await db
      .from('employee_permissions')
      .select('permission')
      .eq('employee_id', emp.id);
    const permList = (perms || []).map((p) => p.permission);
    const isAdmin = permList.includes('admin');
    const { password_hash: _removed, ...safeEmp } = emp;
    const token = mintStaffToken(emp, permList, isAdmin);
    return { status: 200, payload: { employee: safeEmp, isAdmin, permissions: permList, token } };
  }

  if (action === 'admin-verify') {
    if (!name || !pin) {
      return { status: 200, payload: { error: 'name and pin required' } };
    }

    const adminNameLower = String(name).trim().toLowerCase();
    const rateKey = `${clientIp}:admin:${adminNameLower}`;
    const limit = checkRateLimit(rateKey);
    if (limit.blocked) {
      return {
        status: 429,
        payload: { error: `Too many failed PIN attempts. Try again in ${limit.retryAfterSec}s.` },
      };
    }

    const { data: allActiveAdmin } = await db.from('employees').select('*').eq('active', true);
    const emp = (allActiveAdmin || []).find(
      (e) => e.name?.toLowerCase() === adminNameLower || e.display_name?.toLowerCase() === adminNameLower,
    );

    if (!emp) {
      recordFailure(rateKey);
      return { status: 200, payload: { error: 'Employee not found' } };
    }
    if (!emp.password_hash) {
      return { status: 200, payload: { error: 'No PIN set. Ask admin to set your PIN.' } };
    }

    const valid = await verifyPin(pin, emp.password_hash);
    if (!valid) {
      recordFailure(rateKey);
      return { status: 200, payload: { error: 'Invalid PIN' } };
    }

    const { data: adminPerm } = await db
      .from('employee_permissions')
      .select('permission')
      .eq('employee_id', emp.id)
      .eq('permission', 'admin');
    if (!adminPerm || adminPerm.length === 0) {
      return { status: 403, payload: { error: 'Access denied. Admin permission required.' } };
    }

    clearFailures(rateKey);
    const { data: allPerms } = await db
      .from('employee_permissions')
      .select('permission')
      .eq('employee_id', emp.id);
    const permList = (allPerms || []).map((p) => p.permission);
    const { password_hash: _removed, ...safeEmp } = emp;
    const token = mintStaffToken(emp, permList, true);
    return { status: 200, payload: { employee: safeEmp, isAdmin: true, permissions: permList, token } };
  }

  if (action === 'change-pin') {
    if (!employee_id || !old_pin || !new_pin) {
      return { status: 200, payload: { error: 'employee_id, old_pin, and new_pin required' } };
    }
    if (String(new_pin).length < 4) {
      return { status: 200, payload: { error: 'New PIN must be at least 4 digits' } };
    }

    const { data: emp, error } = await db
      .from('employees')
      .select('id, password_hash')
      .eq('id', employee_id)
      .single();
    if (error || !emp) {
      return { status: 404, payload: { error: 'Employee not found' } };
    }
    if (!emp.password_hash) {
      return { status: 200, payload: { error: 'No current PIN set. Ask admin to set your PIN first.' } };
    }

    const valid = await verifyPin(old_pin, emp.password_hash);
    if (!valid) {
      return { status: 200, payload: { error: 'Current PIN is incorrect' } };
    }

    const newHash = await hashPin(new_pin);
    const { error: updateErr } = await db
      .from('employees')
      .update({ password_hash: newHash })
      .eq('id', employee_id);
    if (updateErr) throw new Error(updateErr.message);
    return { status: 200, payload: { success: true } };
  }

  return { status: 400, payload: { error: 'Invalid action' } };
}
