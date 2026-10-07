import { extractStaffClaims, isInternalAuthorized } from '../services/auth.js';

/**
 * Helper matching `src/lib/permissions.ts::hasAccess` and `db/permissions.sql::has_permission`.
 */
export function hasPermission(claims, section) {
  if (!claims) return false;
  if (claims.is_admin) return true;
  const perms = Array.isArray(claims.permissions) ? claims.permissions : [];
  return (
    perms.includes('admin') ||
    perms.includes(section) ||
    perms.includes(`${section}:view`) ||
    perms.includes(`${section}:edit`) ||
    perms.includes(`${section}:manage`)
  );
}

/**
 * Attach `req.staffClaims` and `req.isInternal` to every incoming API request.
 */
export function attachIdentity(req, _res, next) {
  req.staffClaims = extractStaffClaims(req);
  req.isInternal = isInternalAuthorized(req);
  next();
}

/**
 * Check whether the caller is permitted to execute `action` on `table`.
 * Enforces Crown-Jewel access rules:
 *  - `employee_permissions` write requires admin (prevents privilege self-escalation).
 *  - `employees` write requires admin.
 *  - `payroll_payments` / `employee_bonuses` require `payroll` or `admin` when a staff JWT is present or strict mode is on.
 *  - `kapwa_tenants` is internal/admin only.
 */
export function checkTablePermission({ table, action, claims, isInternal }) {
  if (isInternal) return { allowed: true };

  const strict = String(process.env.KAPWA_STRICT_PERMISSIONS || 'false').toLowerCase() === 'true';
  const isWrite = action !== 'select';
  const isStaff = Boolean(claims?.employee_id);
  const isAdmin = Boolean(claims?.is_admin);

  if (table === 'kapwa_tenants') {
    if (!isAdmin) {
      return { allowed: false, status: 403, error: 'Admin permission required for tenant management.' };
    }
  }

  // Privilege escalation guard: if an authenticated non-admin staff member tries to
  // mutate employee_permissions or employees, always block it! And in strict mode,
  // block unauthenticated writes too.
  if (table === 'employee_permissions' && isWrite) {
    if ((isStaff && !isAdmin) || (strict && !isAdmin)) {
      return { allowed: false, status: 403, error: 'Admin permission required to modify employee permissions.' };
    }
  }

  if (table === 'employees' && isWrite) {
    if ((isStaff && !isAdmin) || (strict && !isAdmin)) {
      return { allowed: false, status: 403, error: 'Admin permission required to modify employee records.' };
    }
  }

  if (table === 'payroll_payments' || table === 'employee_bonuses') {
    const canPayroll = hasPermission(claims, 'payroll');
    if ((isStaff && !canPayroll) || (strict && !canPayroll)) {
      return { allowed: false, status: 403, error: 'Payroll permission required.' };
    }
  }

  if (table === 'audit_log') {
    if (action === 'delete' && !isAdmin) {
      return { allowed: false, status: 403, error: 'Audit log entries cannot be deleted without admin permission.' };
    }
    if (action === 'select' && ((isStaff && !isAdmin) || (strict && !isAdmin))) {
      return { allowed: false, status: 403, error: 'Admin permission required to read audit logs.' };
    }
  }

  return { allowed: true };
}

/**
 * Strip sensitive columns (`employees.password_hash`, unauthenticated `settings.openrouter_api_key`)
 * before returning rows to browser clients.
 */
export function sanitizeTableResult(table, data, { claims, isInternal } = {}) {
  if (!data) return data;
  const isStaff = Boolean(claims?.employee_id) || Boolean(isInternal);

  const sanitizeRow = (row) => {
    if (!row || typeof row !== 'object') return row;
    const copy = { ...row };
    if (table === 'employees' && 'password_hash' in copy) {
      delete copy.password_hash;
    }
    if (table === 'settings' && !isStaff && 'openrouter_api_key' in copy) {
      copy.openrouter_api_key = '';
    }
    return copy;
  };

  if (Array.isArray(data)) {
    return data.map(sanitizeRow);
  }
  return sanitizeRow(data);
}
