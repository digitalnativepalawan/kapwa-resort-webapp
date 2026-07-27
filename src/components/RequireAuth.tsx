import { useEffect, useRef, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasAccess } from '@/lib/permissions';
import { getStaffSession, clearStaffSession } from '@/lib/session';
import { STAFF_JWT_MODE, resolveIdentity } from '@/lib/staffAuth';
import { toast } from 'sonner';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000;
/** Only "true" hard-requires a token. "auto" tolerates the pre-cutover state. */
const REQUIRE_STAFF_TOKEN = STAFF_JWT_MODE === 'true';

interface RequireAuthProps {
  children: ReactNode;
  requiredPermission?: string | string[];
  adminOnly?: boolean;
}

const RequireAuth = ({ children, requiredPermission, adminOnly }: RequireAuthProps) => {
  const navigate = useNavigate();
  const [session, setSession] = useState(getStaffSession);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) {
      navigate('/', { replace: true });
      return;
    }

    if (REQUIRE_STAFF_TOKEN && !session.token) {
      clearStaffSession();
      setSession(null);
      toast.error('Please sign in again to create a secure session.');
      navigate('/', { replace: true });
      return;
    }

    // Permissions come from the signed token when there is one, so editing the
    // stored session in devtools no longer grants access. See lib/staffAuth.ts.
    const { permissions: perms, isAdmin } = resolveIdentity(session);

    if (adminOnly && !isAdmin) {
      toast.error('Admin access required');
      navigate('/', { replace: true });
      return;
    }

    if (requiredPermission && !isAdmin) {
      const keys = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
      if (!keys.some(k => hasAccess(perms, k))) {
        toast.error('You do not have access to this section');
        navigate('/', { replace: true });
      }
    }
  }, [session, navigate, requiredPermission, adminOnly]);

  useEffect(() => {
    if (!session) return;

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        clearStaffSession();
        setSession(null);
      }, INACTIVITY_TIMEOUT);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(eventName => document.addEventListener(eventName, resetTimer));
    resetTimer();

    return () => {
      events.forEach(eventName => document.removeEventListener(eventName, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [session]);

  if (!session) return null;
  if (REQUIRE_STAFF_TOKEN && !session.token) return null;

  const { permissions: perms, isAdmin } = resolveIdentity(session);
  if (adminOnly && !isAdmin) return null;

  if (requiredPermission && !isAdmin) {
    const keys = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
    if (!keys.some(k => hasAccess(perms, k))) return null;
  }

  return <>{children}</>;
};

export default RequireAuth;
