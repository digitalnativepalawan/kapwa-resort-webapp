import { canEdit, hasAccess } from './permissions';

/**
 * Determines the correct home route based on user permissions.
 * Ensures authenticated users never land on the login page.
 */
export function getHomeRoute(perms: string[]): string {
  // Admins go to the full dashboard
  if (perms.includes('admin')) return '/admin';

  // All staff go to /staff — the StaffShell auto-selects their first available
  // role tab, including Maintenance for maintenance/landscaping employees.
  return '/staff';
}

/**
 * Department keys StaffShell can render, in the order it offers them.
 * Exported so StaffShell, StaffNavBar and the route table cannot drift apart:
 * a role that exists in StaffAccessManager but not here has no home screen and
 * silently falls through to Reception, which is what happened to Maintenance.
 */
export const STAFF_DEPARTMENTS = [
  { key: 'reception', label: 'Reception', perm: 'reception' },
  { key: 'housekeeping', label: 'Housekeeping', perm: 'housekeeping' },
  { key: 'maintenance', label: 'Maintenance', perm: 'tasks' },
  { key: 'kitchen', label: 'Kitchen', perm: 'kitchen' },
  { key: 'bar', label: 'Bar', perm: 'bar' },
  { key: 'experiences', label: 'Experiences', perm: 'experiences' },
  { key: 'orders', label: 'Orders', perm: 'orders' },
] as const;

export type StaffDepartmentKey = typeof STAFF_DEPARTMENTS[number]['key'];

/** The departments this employee can actually open. */
export function availableDepartments(perms: string[], isAdmin: boolean) {
  if (isAdmin) return [...STAFF_DEPARTMENTS];
  return STAFF_DEPARTMENTS.filter(d =>
    // Placing an order is a write, so the Orders tab needs edit rather than
    // view. Every other department opens on view access.
    d.key === 'orders' ? canEdit(perms, d.perm) : hasAccess(perms, d.perm),
  );
}
