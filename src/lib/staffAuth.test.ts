import { beforeEach, describe, expect, it } from 'vitest';
import { decodeStaffClaims, resolveIdentity, shouldAttachStaffJwt } from './staffAuth';
import type { StaffSession } from './session';

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A structurally valid token. The signature is never checked in the browser. */
function token(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.fakesignature`;
}

const future = () => Math.floor(Date.now() / 1000) + 3600;
const past = () => Math.floor(Date.now() / 1000) - 3600;

function session(overrides: Partial<StaffSession> = {}): StaffSession {
  return {
    name: 'Maria',
    employeeId: 'emp-1',
    permissions: [],
    expiresAt: Date.now() + 3600_000,
    ...overrides,
  };
}

describe('decodeStaffClaims', () => {
  it('reads claims from a well-formed token', () => {
    const claims = decodeStaffClaims(token({
      employee_id: 'emp-1', name: 'Maria',
      permissions: ['housekeeping:edit'], is_admin: false, exp: future(),
    }));
    expect(claims).toMatchObject({
      employee_id: 'emp-1', name: 'Maria',
      permissions: ['housekeeping:edit'], is_admin: false,
    });
  });

  it('rejects an expired token', () => {
    expect(decodeStaffClaims(token({ employee_id: 'emp-1', exp: past() }))).toBeNull();
  });

  it('rejects a token with no employee_id', () => {
    expect(decodeStaffClaims(token({ exp: future() }))).toBeNull();
  });

  it('returns null for absent or malformed input', () => {
    expect(decodeStaffClaims(undefined)).toBeNull();
    expect(decodeStaffClaims('')).toBeNull();
    expect(decodeStaffClaims('not-a-jwt')).toBeNull();
    expect(decodeStaffClaims('a.b.c')).toBeNull();
  });
});

describe('resolveIdentity', () => {
  it('prefers signed claims over the stored session blob', () => {
    // The attack this prevents: edit localStorage to add "admin" and walk into
    // the back office. With a token present, the blob is ignored.
    const identity = resolveIdentity(session({
      permissions: ['admin', 'payroll'],
      isAdmin: true,
      token: token({ employee_id: 'emp-1', permissions: ['kitchen'], is_admin: false, exp: future() }),
    }));

    expect(identity.permissions).toEqual(['kitchen']);
    expect(identity.isAdmin).toBe(false);
    expect(identity.serverVerified).toBe(true);
  });

  it('grants admin when the claims say so', () => {
    const identity = resolveIdentity(session({
      permissions: [],
      token: token({ employee_id: 'emp-1', permissions: ['admin'], is_admin: true, exp: future() }),
    }));
    expect(identity.isAdmin).toBe(true);
    expect(identity.serverVerified).toBe(true);
  });

  it('falls back to the session blob when no token was issued', () => {
    // Pre-cutover state: STAFF_JWT_SECRET unset, so employee-auth returns no
    // token. The app still has to work, but it is not server-verified.
    const identity = resolveIdentity(session({ permissions: ['reception'], isAdmin: false }));
    expect(identity.permissions).toEqual(['reception']);
    expect(identity.serverVerified).toBe(false);
  });

  it('falls back to the blob when the token has expired', () => {
    const identity = resolveIdentity(session({
      permissions: ['reception'],
      token: token({ employee_id: 'emp-1', permissions: ['admin'], is_admin: true, exp: past() }),
    }));
    expect(identity.isAdmin).toBe(false);
    expect(identity.serverVerified).toBe(false);
  });

  it('handles a null session', () => {
    expect(resolveIdentity(null)).toEqual({
      permissions: [], isAdmin: false, serverVerified: false,
    });
  });
});

describe('shouldAttachStaffJwt', () => {
  beforeEach(() => sessionStorage.clear());

  it('never attaches without a token', () => {
    expect(shouldAttachStaffJwt(null)).toBe(false);
  });

  it('does not attach in auto mode until PostgREST has accepted the token', () => {
    // This is the guard that stops a mismatched STAFF_JWT_SECRET from turning
    // every database request into a 401.
    const value = token({ employee_id: 'emp-1', exp: future() });
    expect(shouldAttachStaffJwt(value)).toBe(false);
  });

  it('attaches once a successful probe is cached', () => {
    const value = token({ employee_id: 'emp-1', exp: future() });
    sessionStorage.setItem(`staff_jwt_probe:${value.slice(-16)}`, '1');
    expect(shouldAttachStaffJwt(value)).toBe(true);
  });

  it('does not attach when the cached probe recorded a rejection', () => {
    const value = token({ employee_id: 'emp-1', exp: future() });
    sessionStorage.setItem(`staff_jwt_probe:${value.slice(-16)}`, '0');
    expect(shouldAttachStaffJwt(value)).toBe(false);
  });
});
