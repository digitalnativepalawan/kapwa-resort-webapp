import { useEffect, useRef, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasAccess } from '@/lib/permissions';
import { getStaffSession, clearStaffSession } from '@/lib/session';
import { toast } from 'sonner';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

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
    const perms: string[] = session.permissions || [];
    const isAdmin = perms.includes('admin');

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

  // Inactivity timeout
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
    events.forEach(e => document.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      events.forEach(e => document.removeEventListener(e, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [session]);

  if (!session) return null;

  const perms: string[] = session.permissions || [];
  const isAdmin = perms.includes('admin');
  if (adminOnly && !isAdmin) return null;
  if (requiredPermission && !isAdmin) {
    const keys = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
    if (!keys.some(k => hasAccess(perms, k))) return null;
  }

  return <>{children}</>;
};

export default RequireAuth;
