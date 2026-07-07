/**
 * Permission resolution helpers for the granular staff access system.
 *
 * Stored permission values:
 *   - 'admin'           → full access to everything
 *   - 'rooms:view'      → view-only access to rooms
 *   - 'rooms:edit'      → full access to rooms
 *   - 'rooms:manage'    → can override rates, modify bookings
 *   - 'rooms'           → legacy, treated as 'rooms:edit' for backward compat
 *   - 'documents:view'  → can see passport/docs tab
 *   - 'documents:edit'  → can see and modify passport/docs tab
 */

export type PermissionLevel = 'off' | 'view' | 'edit' | 'manage';

/** Check if employee has any access (view or edit or manage) to a section */
export const hasAccess = (permissions: string[], section: string): boolean => {
  if (permissions.includes('admin')) return true;
  // Legacy bare permission (e.g. 'rooms') treated as edit
  if (permissions.includes(section)) return true;
  if (permissions.includes(`${section}:view`)) return true;
  if (permissions.includes(`${section}:edit`)) return true;
  if (permissions.includes(`${section}:manage`)) return true;
  return false;
};

/** Check if employee can edit (not just view) a section */
export const canEdit = (permissions: string[], section: string): boolean => {
  if (permissions.includes('admin')) return true;
  // Legacy bare permission treated as edit
  if (permissions.includes(section)) return true;
  if (permissions.includes(`${section}:edit`)) return true;
  if (permissions.includes(`${section}:manage`)) return true;
  return false;
};

/** Check if employee can manage (highest level) a section */
export const canManage = (permissions: string[], section: string): boolean => {
  if (permissions.includes('admin')) return true;
  if (permissions.includes(`${section}:manage`)) return true;
  return false;
};

/** Get current permission level for a section */
export const getPermissionLevel = (permissions: string[], section: string): PermissionLevel => {
  if (permissions.includes(`${section}:manage`)) return 'manage';
  if (permissions.includes(`${section}:edit`) || permissions.includes(section)) return 'edit';
  if (permissions.includes(`${section}:view`)) return 'view';
  return 'off';
};

/** Check if employee can view sensitive documents */
export const canViewDocuments = (permissions: string[]): boolean => {
  if (permissions.includes('admin')) return true;
  if (permissions.includes('documents')) return true;
  if (permissions.includes('documents:view')) return true;
  if (permissions.includes('documents:edit')) return true;
  return false;
};
