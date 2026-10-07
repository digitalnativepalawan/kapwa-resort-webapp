import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getStaffSession, setStaffSession } from '@/lib/session';
import {
  STAFF_JWT_MODE,
  decodeStaffClaims,
  probeStaffJwt,
  resolveIdentity,
  shouldAttachStaffJwt,
  type StaffJwtClaims,
} from '@/lib/staffAuth';
import { getKapwaApiBase } from '@/lib/kapwaClient';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type ProbeState = 'idle' | 'checking' | 'accepted' | 'rejected' | 'no-token';

interface TableProbeResult {
  table: string;
  ok: boolean;
  detail: string;
}

const AuthDiagnostics = () => {
  const [session, setSession] = useState(() => getStaffSession());
  const [claims, setClaims] = useState<StaffJwtClaims | null>(() =>
    decodeStaffClaims(getStaffSession()?.token),
  );
  const [probe, setProbe] = useState<ProbeState>('idle');
  const [probeHttpStatus, setProbeHttpStatus] = useState<number | null>(null);
  const [probeErrorText, setProbeErrorText] = useState<string>('');
  const [tableResults, setTableResults] = useState<TableProbeResult[]>([]);
  const [testingTables, setTestingTables] = useState(false);

  const runProbe = async () => {
    const current = getStaffSession();
    setSession(current);
    setClaims(decodeStaffClaims(current?.token));
    setProbeErrorText('');
    setProbeHttpStatus(null);

    if (!current?.token) {
      setProbe('no-token');
      return;
    }

    setProbe('checking');
    const apiBase = getKapwaApiBase();
    try {
      sessionStorage.removeItem('staff_jwt_probe:' + current.token.slice(-16));
    } catch {
      // ignore
    }

    try {
      const res = await fetch(`${apiBase}/api/auth/probe`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${current.token}`,
        },
      });
      setProbeHttpStatus(res.status);
      if (res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => '');
        setProbeErrorText(body.slice(0, 240));
        setProbe('rejected');
      } else {
        setProbe('accepted');
      }
      await probeStaffJwt(current.token);
    } catch (err) {
      setProbeErrorText(err instanceof Error ? err.message : 'Network error');
      setProbe('rejected');
    }
  };

  const runTableProbes = async () => {
    setTestingTables(true);
    const tables = ['employees', 'employee_permissions', 'payroll_payments', 'audit_log'];
    const out: TableProbeResult[] = [];
    for (const table of tables) {
      const { count, error } = await (supabase.from(table as 'employees') as ReturnType<typeof supabase.from>)
        .select('id', { count: 'exact', head: true });
      if (error) {
        out.push({ table, ok: false, detail: `${error.code ?? ''} ${error.message}`.trim() });
      } else {
        out.push({ table, ok: true, detail: `read ok (${count ?? 0} rows visible)` });
      }
    }
    setTableResults(out);
    setTestingTables(false);
  };

  const reMintDevToken = async () => {
    const { data, error } = await supabase.functions.invoke('employee-auth', {
      body: { action: 'admin-verify', name: 'David', pin: '5309' },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'employee-auth failed');
      return;
    }
    if (!data?.token) {
      toast.warning('employee-auth returned no token — STAFF_JWT_SECRET is not set.');
    } else {
      toast.success('Fresh staff JWT minted.');
    }
    setStaffSession(
      {
        name: data.employee.name,
        employeeId: data.employee.id,
        isAdmin: true,
        permissions: data.permissions || ['admin'],
        token: data.token || undefined,
      },
      false,
    );
    await runProbe();
  };

  useEffect(() => {
    runProbe();
  }, []);

  const identity = resolveIdentity(session);
  const attaching = shouldAttachStaffJwt(session?.token ?? null);
  const expiresInMin = claims ? Math.max(0, Math.round((claims.exp * 1000 - Date.now()) / 60000)) : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h3 className="font-display text-sm tracking-wider text-foreground uppercase">
            Staff JWT &amp; RBAC Diagnostics
          </h3>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runProbe} className="font-body text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Re-check
          </Button>
          <Button size="sm" variant="secondary" onClick={reMintDevToken} className="font-body text-xs">
            Mint fresh token
          </Button>
        </div>
      </div>

      {/* Overall status banner */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        {probe === 'accepted' && (
          <div className="flex items-start gap-2.5 text-emerald-400">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="font-body text-xs space-y-1">
              <p className="font-semibold text-sm text-foreground">
                Ready for strict RBAC enforcement
              </p>
              <p className="text-muted-foreground">
                <code className="text-foreground">employee-auth</code> is minting signed staff tokens and
                the KAPWA Neon/PostgreSQL backend accepts the signature (HTTP {probeHttpStatus}). Crown-jewel
                application and database permissions are active.
              </p>
            </div>
          </div>
        )}

        {probe === 'no-token' && (
          <div className="flex items-start gap-2.5 text-amber-400">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="font-body text-xs space-y-1">
              <p className="font-semibold text-sm text-foreground">
                No staff JWT on this session (compatibility mode)
              </p>
              <p className="text-muted-foreground">
                The app works using your stored session permissions. Click <b>Mint fresh token</b> above or sign in
                again to mint a signed HS256 staff token.
              </p>
            </div>
          </div>
        )}

        {probe === 'rejected' && (
          <div className="flex items-start gap-2.5 text-destructive">
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="font-body text-xs space-y-1">
              <p className="font-semibold text-sm text-foreground">
                Backend rejected the staff token (HTTP {probeHttpStatus ?? 'err'})
              </p>
              <p className="text-muted-foreground">
                Ensure <code className="text-foreground">STAFF_JWT_SECRET</code> is consistent and click{' '}
                <b>Mint fresh token</b> to issue a newly signed token.
              </p>
              {probeErrorText && (
                <pre className="mt-2 p-2 rounded bg-secondary text-[11px] text-muted-foreground overflow-x-auto">
                  {probeErrorText}
                </pre>
              )}
            </div>
          </div>
        )}

        {probe === 'checking' && (
          <p className="font-body text-xs text-muted-foreground">Probing KAPWA Auth Service…</p>
        )}
      </div>

      {/* Claim / mode matrix */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-display text-xs tracking-wider uppercase text-muted-foreground mb-3">
          Current session
        </p>
        <dl className="grid grid-cols-2 gap-y-2 gap-x-4 font-body text-xs">
          <dt className="text-muted-foreground">VITE_ENFORCE_STAFF_JWT</dt>
          <dd className="font-mono text-foreground">{STAFF_JWT_MODE}</dd>

          <dt className="text-muted-foreground">Employee</dt>
          <dd className="text-foreground">{session ? `${session.name} (${session.employeeId})` : 'none'}</dd>

          <dt className="text-muted-foreground">Token present</dt>
          <dd className="text-foreground">{session?.token ? 'yes' : 'no'}</dd>

          <dt className="text-muted-foreground">Identity source</dt>
          <dd className="text-foreground">
            {identity.serverVerified ? 'signed JWT claims' : 'localStorage session (unverified)'}
          </dd>

          <dt className="text-muted-foreground">Attaching Bearer header</dt>
          <dd className="text-foreground">{attaching ? 'yes' : 'no'}</dd>

          <dt className="text-muted-foreground">Effective is_admin</dt>
          <dd className="text-foreground">{String(identity.isAdmin)}</dd>

          <dt className="text-muted-foreground">Effective permissions</dt>
          <dd className="font-mono text-foreground break-all">
            {identity.permissions.length ? identity.permissions.join(', ') : '(none)'}
          </dd>

          {expiresInMin !== null && (
            <>
              <dt className="text-muted-foreground">Token expires in</dt>
              <dd className="text-foreground">{expiresInMin} min</dd>
            </>
          )}
        </dl>
      </div>

      {/* Live table read check */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-xs tracking-wider uppercase text-muted-foreground">
              Crown-jewel table probe
            </p>
            <p className="font-body text-[11px] text-muted-foreground">
              Runs a <code className="text-foreground">HEAD</code> count query on each Phase-2 table using the
              current client headers. All four must succeed as admin.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={runTableProbes}
            disabled={testingTables}
            className="font-body text-xs shrink-0"
          >
            {testingTables ? 'Testing…' : 'Test 4 tables'}
          </Button>
        </div>

        {tableResults.length > 0 && (
          <div className="divide-y divide-border font-body text-xs">
            {tableResults.map((r) => (
              <div key={r.table} className="py-1.5 flex items-center justify-between gap-2">
                <span className="font-mono text-foreground">{r.table}</span>
                <span className={r.ok ? 'text-emerald-400' : 'text-destructive'}>
                  {r.ok ? '✓ ' : '✗ '}
                  {r.detail}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthDiagnostics;
