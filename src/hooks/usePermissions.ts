import { useMemo } from 'react';
import { getStaffSession, StaffSession } from '@/lib/session';
import {
  hasAccess as _hasAccess,
  canEdit as _canEdit,
  canManage as _canManage,
  getPermissionLevel,
  canViewDocuments as _canViewDocuments,
  PermissionLevel,
} from '@/lib/permissions';

export interface UsePermissionsReturn {
  session: StaffSession | null;
  perms: string[];
  isAdmin: boolean;
  /** User has at least view access to the module */
  canView: (module: string) => boolean;
  /** User can edit (create/update/delete) in the module */
  canEdit: (module: string) => boolean;
  /** User has manage-level access */
  canManage: (module: string) => boolean;
  /** User can view but NOT edit — true = read-only */
  readOnly: (module: string) => boolean;
  /** Check a specific permission level */
  hasAccess: (module: string) => boolean;
  /** Get the exact permission level */
  getLevel: (module: string) => PermissionLevel;
  /** Can view passport / document tab */
  canViewDocuments: () => boolean;
}

export const usePermissions = (): UsePermissionsReturn => {
  const session = getStaffSession();
  const perms: string[] = session?.permissions || [];
  const isAdmin = perms.includes('admin');

  return useMemo(() => ({
    session,
    perms,
    isAdmin,
    canView: (module: string) => isAdmin || _hasAccess(perms, module),
    canEdit: (module: string) => isAdmin || _canEdit(perms, module),
    canManage: (module: string) => isAdmin || _canManage(perms, module),
    readOnly: (module: string) => {
      if (isAdmin) return false;
      // Has access but cannot edit
      return _hasAccess(perms, module) && !_canEdit(perms, module);
    },
    hasAccess: (module: string) => isAdmin || _hasAccess(perms, module),
    getLevel: (module: string) => isAdmin ? 'manage' as PermissionLevel : getPermissionLevel(perms, module),
    canViewDocuments: () => isAdmin || _canViewDocuments(perms),
  }), [session, perms, isAdmin]);
};
