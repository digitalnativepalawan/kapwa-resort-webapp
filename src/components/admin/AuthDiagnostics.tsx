import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getStaffSession } from '@/lib/session';
import {
  STAFF_JWT_MODE,
  STAFF_JWT_STATUS_DETAIL,
  type StaffJwtStatus,
  getStaffJwtStatus,
  probeStaffJwt,
  resolveIdentity,
} from '@/lib/staffAuth';
import { CheckCircle2, HelpCircle, Loader2, RefreshCw, XCircle } from 'lucide-react';

/**
 * Answers the one question the RLS cutover depends on and that a code review
 * cannot: **does PostgREST accept this deployment's staff JWT?**
 *
 * If it does, claim-based RLS works and
 * docs/security/rls-cutover-drop-compat.sql is safe to run. If it does not,
 * running that script locks the back office out of the tables it protects.
 */

const STATUS_STYLE: Record<StaffJwtStatus, { icon: typeof CheckCircle2; tone: string; label: string }> = {
  active:     { icon: CheckCircle2, tone: 'text-emerald-500', label: 'Active' },
  rejected:   { icon: XCircle,      tone: 'text-destructive',  label: 'Rejected' },
  'no-token': { icon: XCircle,      tone: 'text-amber-500',    label: 'No token issued' },
  disabled:   { icon: XCircle,      tone: 'text-muted-foreground', label: 'Disabled' },
  unverified: { icon: HelpCircle,   tone: 'text-muted-foreground', label: 'Not checked yet' },
};

const AuthDiagnostics = () => {
  const session = getStaffSession();
  const identity = resolveIdentity(session);
  const [status, setStatus] = useState<StaffJwtStatus>(() => getStaffJwtStatus(session));
  const [checking, setChecking] = useState(false);

  const runProbe = async () => {
    if (!session?.token) {
      setStatus(getStaffJwtStatus(session));
      return;
    }
    setChecking(true);
    try {
      // Clear the cached verdict so this is a genuine re-check.
      sessionStorage.removeItem(`staff_jwt_probe:${session.token.slice(-16)}`);
      await probeStaffJwt(session.token);
      setStatus(getStaffJwtStatus(session));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (session?.token && getStaffJwtStatus(session) === 'unverified') {
      void runProbe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = STATUS_STYLE[status];
  const Icon = style.icon;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm tracking-wider text-foreground">STAFF AUTHENTICATION</h3>
          <p className="font-body text-xs text-muted-foreground mt-1">
            Whether the database accepts this session's staff token.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={runProbe} disabled={checking || !session?.token}>
          {checking
            ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
          Re-check
        </Button>
      </div>

      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.tone}`} />
        <div className="space-y-1">
          <p className={`font-body text-sm font-medium ${style.tone}`}>{style.label}</p>
          <p className="font-body text-xs text-muted-foreground">{STAFF_JWT_STATUS_DETAIL[status]}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-border">
        <dt className="font-body text-xs text-muted-foreground">Mode</dt>
        <dd className="font-body text-xs text-foreground">
          <code>VITE_USE_STAFF_JWT={STAFF_JWT_MODE}</code>
        </dd>

        <dt className="font-body text-xs text-muted-foreground">Token issued at login</dt>
        <dd className="font-body text-xs text-foreground">{session?.token ? 'Yes' : 'No'}</dd>

        <dt className="font-body text-xs text-muted-foreground">Permissions source</dt>
        <dd className="font-body text-xs text-foreground">
          {identity.serverVerified ? 'Signed token claims' : 'Local session (not verified)'}
        </dd>

        <dt className="font-body text-xs text-muted-foreground">Supabase project</dt>
        <dd className="font-body text-xs text-foreground break-all">
          {import.meta.env.VITE_SUPABASE_PROJECT_ID || 'not set'}
        </dd>
      </dl>

      {status === 'active' && (
        <p className="font-body text-xs text-muted-foreground border-t border-border pt-3">
          Claim-based RLS is being enforced. It is now safe to run{' '}
          <code>docs/security/rls-cutover-drop-compat.sql</code> to remove the
          anonymous-access bridge on <code>settings</code> and{' '}
          <code>guest_faq_memory</code>.
        </p>
      )}

      {(status === 'rejected' || status === 'no-token') && (
        <p className="font-body text-xs text-muted-foreground border-t border-border pt-3">
          Do not run the cutover script yet. Set <code>STAFF_JWT_SECRET</code> on the
          employee-auth function to the project's JWT secret (Settings → API → JWT
          Settings), redeploy the function, then sign out and back in.
        </p>
      )}
    </Card>
  );
};

export default AuthDiagnostics;
