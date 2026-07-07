import { hasAccess } from './permissions';

/**
 * Determines the correct home route based on user permissions.
 * Ensures authenticated users never land on the login page.
 */
export function getHomeRoute(perms: string[]): string {
  // Admins go to the full dashboard
  if (perms.includes('admin')) return '/admin';
  
  // All staff go to /staff — the StaffShell auto-selects their first available role tab
  // This prevents routing to / which triggers the login screen
  return '/staff';
}
