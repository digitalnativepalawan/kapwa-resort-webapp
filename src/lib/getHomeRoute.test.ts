import { describe, expect, it } from 'vitest';
import { STAFF_DEPARTMENTS, availableDepartments, getHomeRoute } from './getHomeRoute';

const keys = (perms: string[], isAdmin = false) =>
  availableDepartments(perms, isAdmin).map(d => d.key);

describe('availableDepartments', () => {
  it('gives a maintenance employee the Maintenance department', () => {
    // The bug this covers: Maintenance existed as a role in StaffAccessManager
    // (tasks:edit, rooms:view, …) but not in StaffShell's department list, so
    // this employee matched nothing and the shell rendered Reception instead.
    const maintenance = ['tasks:edit', 'rooms:view', 'inventory:view', 'reception:view',
                         'schedules:view', 'timesheet:edit'];
    expect(keys(maintenance)).toContain('maintenance');
  });

  it('opens Maintenance first for a maintenance-only employee', () => {
    // availableDepartments[0] is what StaffShell selects as the landing tab.
    expect(keys(['tasks:edit'])[0]).toBe('maintenance');
  });

  it('gives a landscaping employee the Maintenance department too', () => {
    expect(keys(['tasks:edit', 'inventory:view', 'schedules:view'])).toContain('maintenance');
  });

  it('does not give Maintenance to someone without task access', () => {
    expect(keys(['kitchen'])).not.toContain('maintenance');
  });

  it('gives admins every department', () => {
    expect(keys([], true)).toEqual(STAFF_DEPARTMENTS.map(d => d.key));
  });

  it('requires edit rather than view for the Orders tab', () => {
    // Placing an order is a write.
    expect(keys(['orders:view'])).not.toContain('orders');
    expect(keys(['orders:edit'])).toContain('orders');
  });

  it('opens on view access for every other department', () => {
    expect(keys(['housekeeping:view'])).toContain('housekeeping');
    expect(keys(['reception:view'])).toContain('reception');
  });

  it('returns nothing for an employee with no department permissions', () => {
    expect(keys(['documents:view'])).toEqual([]);
  });
});

describe('getHomeRoute', () => {
  it('sends admins to the dashboard', () => {
    expect(getHomeRoute(['admin'])).toBe('/admin');
  });

  it('sends other staff to the shell', () => {
    expect(getHomeRoute(['tasks:edit'])).toBe('/staff');
    expect(getHomeRoute(['housekeeping'])).toBe('/staff');
  });

  it('never returns the login route', () => {
    // Returning '/' would bounce an authenticated user back to sign-in.
    expect(getHomeRoute([])).not.toBe('/');
  });
});
