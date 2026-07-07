import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Clock, LogOut, ListTodo, Banknote, Settings, Star, LayoutDashboard, CalendarDays, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import EmployeeTaskList from '@/components/employee/EmployeeTaskList';
import EmployeeScheduleView from '@/components/employee/EmployeeScheduleView';
import { hasAccess, canEdit } from '@/lib/permissions';
import StaffNavBar from '@/components/StaffNavBar';
import { getStaffSession } from '@/lib/session';

type Tab = 'clock' | 'schedule' | 'tasks' | 'pay' | 'settings' | 'dashboard';

const EmployeePortal = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('clock');

  // Auth state — check localStorage first, then fall back to staff_home_session
  const [empId, setEmpId] = useState<string | null>(() => {
    const stored = localStorage.getItem('emp_id');
    if (stored) return stored;
    const staffSession = getStaffSession();
    if (staffSession) {
      localStorage.setItem('emp_id', staffSession.employeeId);
      localStorage.setItem('emp_name', staffSession.name);
      return staffSession.employeeId;
    }
    return null;
  });
  const [empName, setEmpName] = useState<string>(() => localStorage.getItem('emp_name') || '');

  // Login form
  const [loginName, setLoginName] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Settings
  const [displayName, setDisplayName] = useState('');

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-active-portal'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('active', true).order('name');
      return data || [];
    },
  });

  const emp = useMemo(() => employees.find(e => e.id === empId) as any, [employees, empId]);

  // Shifts for logged-in employee
  const { data: shifts = [] } = useQuery({
    queryKey: ['emp-shifts', empId],
    enabled: !!empId,
    queryFn: async () => {
      const { data } = await supabase.from('employee_shifts').select('*')
        .eq('employee_id', empId!).order('clock_in', { ascending: false }).limit(100);
      return data || [];
    },
  });

  const todayShifts = useMemo(() => {
    const start = new Date(); start.setHours(0,0,0,0);
    return shifts.filter(s => new Date(s.clock_in) >= start);
  }, [shifts]);

  const activeShift = todayShifts.find(s => !s.clock_out);

  // Payments
  const { data: payments = [] } = useQuery({
    queryKey: ['emp-payments', empId],
    enabled: !!empId,
    queryFn: async () => {
      const { data } = await (supabase.from('payroll_payments') as any).select('*')
        .eq('employee_id', empId!).order('paid_at', { ascending: false }).limit(50);
      return (data || []) as any[];
    },
  });

  // Permissions for dashboard access
  const { data: empPermissions = [] } = useQuery({
    queryKey: ['emp-permissions', empId],
    enabled: !!empId,
    queryFn: async () => {
      const { data } = await (supabase.from('employee_permissions' as any) as any)
        .select('permission').eq('employee_id', empId!);
      return ((data || []) as any[]).map((p: any) => p.permission as string);
    },
  });

  // Bonuses
  const { data: bonuses = [] } = useQuery({
    queryKey: ['emp-bonuses', empId],
    enabled: !!empId,
    queryFn: async () => {
      const { data } = await (supabase.from('employee_bonuses' as any) as any).select('*')
        .eq('employee_id', empId!).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Realtime shifts
  useEffect(() => {
    if (!empId) return;
    const channel = supabase
      .channel('emp-shifts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_shifts' }, () => {
        qc.invalidateQueries({ queryKey: ['emp-shifts', empId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [empId, qc]);

  const login = async () => {
    if (!loginName || !loginPin) return;
    setLoginLoading(true);
    try {
      const res = await supabase.functions.invoke('employee-auth', {
        body: { action: 'verify', name: loginName, pin: loginPin },
      });
      const data = res.data;
      // Success path first — if we got an employee back, login worked
      if (data?.employee) {
        const employee = data.employee;
        localStorage.setItem('emp_id', employee.id);
        localStorage.setItem('emp_name', employee.name);
        setEmpId(employee.id);
        setEmpName(employee.name);
        setDisplayName(employee.display_name || '');
        toast.success(`Welcome, ${employee.display_name || employee.name}!`);
        setLoginLoading(false);
        return;
      }
      // Error path
      const msg = data?.error || 'Login failed';
      toast.error(msg);
    } catch (e: any) {
      console.error('Login error:', e);
      toast.error(e.message || 'Login failed');
    }
    setLoginLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('emp_id');
    localStorage.removeItem('emp_name');
    setEmpId(null);
    setEmpName('');
    setLoginPin('');
  };

  const clockIn = async () => {
    if (!empId) return;
    await supabase.from('employee_shifts').insert({ employee_id: empId, clock_in: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ['emp-shifts', empId] });
    toast.success('Clocked in!');
  };

  const clockOut = async () => {
    if (!empId || !activeShift) return;
    const clockInTime = new Date(activeShift.clock_in);
    const now = new Date();
    const hoursWorked = Math.round(((now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60)) * 100) / 100;
    const rateType = emp?.rate_type || 'hourly';
    let totalPay: number;
    if (rateType === 'daily') totalPay = Number(emp?.daily_rate || 0);
    else if (rateType === 'monthly') totalPay = Math.round((Number(emp?.monthly_rate || 0) / 22) * 100) / 100;
    else totalPay = Math.round(hoursWorked * Number(emp?.hourly_rate || 0) * 100) / 100;

    await supabase.from('employee_shifts').update({
      clock_out: now.toISOString(), hours_worked: hoursWorked, total_pay: totalPay,
    }).eq('id', activeShift.id);
    qc.invalidateQueries({ queryKey: ['emp-shifts', empId] });
    toast.success(`Clocked out — ${hoursWorked}h, ₱${totalPay}`);
  };

  const saveDisplayName = async () => {
    if (!empId) return;
    await supabase.from('employees').update({ display_name: displayName.trim() } as any).eq('id', empId);
    qc.invalidateQueries({ queryKey: ['employees-active-portal'] });
    toast.success('Display name updated');
  };

  // LOGIN SCREEN
  if (!empId) {
    return (
      <div className="min-h-screen bg-navy-texture flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="font-display text-xl tracking-wider text-foreground">Employee Portal</h1>
            <p className="font-body text-sm text-muted-foreground mt-1">Login with your name & PIN</p>
          </div>
          <div className="space-y-3">
            <select value={loginName} onChange={e => setLoginName(e.target.value)}
              className="w-full bg-secondary border border-border text-foreground font-body text-sm rounded-md px-3 py-3">
              <option value="">Select your name</option>
              {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
            </select>
            <Input type="tel" inputMode="numeric" pattern="[0-9]*" value={loginPin} onChange={e => setLoginPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter PIN" className="bg-secondary border-border text-foreground font-body py-3 text-center text-2xl tracking-[0.5em]"
              maxLength={6} onKeyDown={e => { if (e.key === 'Enter') login(); }} />
            <Button onClick={login} disabled={loginLoading || !loginName || !loginPin}
              className="w-full font-display text-sm tracking-wider">
              {loginLoading ? 'Logging in…' : 'Login'}
            </Button>
          </div>
          <button onClick={() => navigate('/')} className="text-muted-foreground font-body text-xs mx-auto block hover:text-foreground">
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  // DASHBOARD
  const todayHours = todayShifts.filter(s => s.hours_worked).reduce((sum, s) => sum + Number(s.hours_worked), 0);
  const totalPaidOut = shifts.filter(s => s.is_paid).reduce((sum, s) => sum + Number(s.total_pay || 0), 0);

  return (
    <div className="min-h-screen bg-navy-texture overflow-x-hidden">
      {/* Global navigation bar */}
      <StaffNavBar />

      <div className="max-w-2xl mx-auto px-4 pb-6">
        {/* Header - simplified, name only */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display text-lg tracking-wider text-foreground">
              {(emp?.display_name || empName)}
            </h1>
            <p className="font-body text-xs text-muted-foreground">
              {emp?.rate_type === 'daily' ? `₱${Number(emp?.daily_rate || 0).toFixed(0)}/day`
                : emp?.rate_type === 'monthly' ? `₱${Number(emp?.monthly_rate || 0).toLocaleString()}/mo`
                : `₱${Number(emp?.hourly_rate || 0).toFixed(0)}/hr`}
            </p>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 mb-4 flex-wrap">
          {(() => {
            const isAdmin = empPermissions.includes('admin');
            const tabs: { key: Tab; label: string; icon: any }[] = [
              { key: 'clock', label: 'Clock', icon: Clock },
            ];
            if (isAdmin || hasAccess(empPermissions, 'schedules')) {
              tabs.push({ key: 'schedule', label: 'Schedule', icon: CalendarDays });
            }
            if (isAdmin || hasAccess(empPermissions, 'tasks')) {
              tabs.push({ key: 'tasks', label: 'Tasks', icon: ListTodo });
            }
            if (isAdmin || hasAccess(empPermissions, 'payroll')) {
              tabs.push({ key: 'pay', label: 'Pay', icon: Banknote });
            }
            tabs.push({ key: 'settings', label: 'Settings', icon: Settings });
            const MANAGER_SECTIONS = ['orders', 'menu', 'kitchen', 'bar', 'housekeeping', 'reception', 'experiences', 'reports', 'inventory', 'payroll', 'resort_ops', 'rooms', 'schedules', 'setup', 'timesheet'];
            const hasManagerAccess = isAdmin || MANAGER_SECTIONS.some(s => canEdit(empPermissions, s));
            if (hasManagerAccess) {
              tabs.push({ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard });
            }
            return tabs;
          })().map(({ key, label, icon: Icon }) => (
            <Button key={key} size="sm" variant={tab === key ? 'default' : 'outline'}
              onClick={() => {
                if (key === 'dashboard') {
                  navigate('/admin');
                  return;
                }
                setTab(key);
              }}
              className="font-display text-xs tracking-wider flex-1 gap-1">
              <Icon className="w-3.5 h-3.5" /> {label}
            </Button>
          ))}
        </div>

        {/* CLOCK TAB */}
        {tab === 'clock' && (
          <div className="space-y-4">
            <div className="border border-border rounded-lg p-4 text-center space-y-3">
              <Badge variant={activeShift ? 'default' : 'secondary'} className="font-body text-sm">
                {activeShift ? 'Clocked In' : 'Off'}
              </Badge>
              {activeShift ? (
                <Button size="lg" variant="destructive" onClick={clockOut} className="w-full font-display tracking-wider gap-2">
                  <LogOut className="w-4 h-4" /> Clock Out
                </Button>
              ) : (
                <Button size="lg" onClick={clockIn} className="w-full font-display tracking-wider gap-2">
                  <Clock className="w-4 h-4" /> Clock In
                </Button>
              )}
              <p className="font-body text-xs text-muted-foreground">Today: {todayHours.toFixed(1)}h</p>
            </div>

            {/* Today's shifts */}
            {todayShifts.length > 0 && (
              <div className="space-y-1">
                <p className="font-display text-xs tracking-wider text-foreground">Today's Shifts</p>
                {todayShifts.sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime()).map((s, i) => (
                  <p key={s.id} className="font-body text-xs text-muted-foreground">
                    Shift {i + 1}: {format(new Date(s.clock_in), 'h:mm a')}
                    {s.clock_out ? ` – ${format(new Date(s.clock_out), 'h:mm a')} (${Number(s.hours_worked || 0).toFixed(1)}h)` : ' – still working'}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCHEDULE TAB */}
        {tab === 'schedule' && (
          <EmployeeScheduleView employeeId={empId} />
        )}

        {/* TASKS TAB */}
        {tab === 'tasks' && (
          <EmployeeTaskList employeeId={empId} createdBy="employee" readOnly={!canEdit(empPermissions, 'tasks')} />
        )}

        {/* PAY TAB */}
        {tab === 'pay' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-border rounded-lg p-3 text-center">
                <p className="font-body text-xs text-muted-foreground">Total Paid</p>
                <p className="font-display text-lg text-foreground">₱{totalPaidOut.toFixed(0)}</p>
              </div>
              <div className="border border-border rounded-lg p-3 text-center">
                <p className="font-body text-xs text-muted-foreground">Bonuses</p>
                <p className="font-display text-lg text-primary">₱{bonuses.reduce((s: number, b: any) => s + Number(b.amount || 0), 0).toFixed(0)}</p>
              </div>
            </div>

            {/* Bonuses */}
            {bonuses.length > 0 && (
              <div className="space-y-1">
                <p className="font-display text-xs tracking-wider text-foreground">Bonuses</p>
                {bonuses.map((b: any) => (
                  <div key={b.id} className="flex justify-between py-1.5 border-b border-border/50">
                    <div>
                      <span className="font-body text-sm text-foreground">₱{Number(b.amount).toFixed(0)}</span>
                      {b.is_employee_of_month && <Star className="w-3 h-3 text-primary inline ml-1" />}
                      <p className="font-body text-xs text-muted-foreground">{b.reason}</p>
                    </div>
                    <span className="font-body text-xs text-muted-foreground">{b.bonus_month ? format(new Date(b.bonus_month + 'T00:00:00'), 'MMM yyyy') : ''}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recent payments */}
            <div className="space-y-1">
              <p className="font-display text-xs tracking-wider text-foreground">Payment History</p>
              {payments.length === 0 && <p className="font-body text-xs text-muted-foreground text-center py-4">No payments yet</p>}
              {payments.map((p: any) => (
                <div key={p.id} className="flex justify-between py-2 border-b border-border/50">
                  <div>
                    <span className="font-body text-sm text-foreground">₱{Number(p.amount).toFixed(0)}</span>
                    <Badge variant={p.payment_type === 'advance' ? 'destructive' : 'default'} className="font-body text-xs ml-2">
                      {p.payment_type}
                    </Badge>
                    {p.notes && <p className="font-body text-xs text-muted-foreground italic">{p.notes}</p>}
                  </div>
                  <span className="font-body text-xs text-muted-foreground">{format(new Date(p.paid_at), 'MMM d')}</span>
                </div>
              ))}
            </div>

            {/* Recent shifts */}
            <div className="space-y-1">
              <p className="font-display text-xs tracking-wider text-foreground">Shift History</p>
              {shifts.slice(0, 20).map(s => (
                <div key={s.id} className="flex justify-between py-1.5 border-b border-border/50">
                  <div>
                    <span className="font-body text-xs text-foreground">
                      {format(new Date(s.clock_in), 'MMM d · h:mm a')}
                      {s.clock_out ? ` → ${format(new Date(s.clock_out), 'h:mm a')}` : ''}
                    </span>
                    <span className="font-body text-xs text-muted-foreground ml-2">
                      {s.hours_worked ? `${Number(s.hours_worked).toFixed(1)}h` : ''}
                      {s.total_pay ? ` · ₱${Number(s.total_pay).toFixed(0)}` : ''}
                    </span>
                  </div>
                  <Badge variant={s.is_paid ? 'default' : 'secondary'} className="font-body text-xs">
                    {s.is_paid ? 'Paid' : 'Unpaid'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <SettingsTab empId={empId} empName={empName} emp={emp} displayName={displayName} setDisplayName={setDisplayName} saveDisplayName={saveDisplayName} />
        )}
      </div>
    </div>
  );
};

/* ---------- Settings Tab with Change PIN ---------- */
function SettingsTab({ empId, empName, emp, displayName, setDisplayName, saveDisplayName }: {
  empId: string; empName: string; emp: any; displayName: string; setDisplayName: (v: string) => void; saveDisplayName: () => void;
}) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  const changePin = async () => {
    if (!currentPin || !newPin || !confirmPin) return;
    if (newPin !== confirmPin) { toast.error('New PINs do not match'); return; }
    if (newPin.length < 4) { toast.error('PIN must be at least 4 digits'); return; }
    setPinLoading(true);
    try {
      // Verify current PIN first
      const verifyRes = await supabase.functions.invoke('employee-auth', {
        body: { action: 'change-pin', employee_id: empId, name: empName, old_pin: currentPin, new_pin: newPin },
      });
      if (verifyRes.data?.error) {
        toast.error(verifyRes.data.error);
        setPinLoading(false);
        return;
      }
      if (verifyRes.data?.success) {
        toast.success('PIN updated successfully');
        setCurrentPin(''); setNewPin(''); setConfirmPin('');
      }
    } catch {
      toast.error('Failed to change PIN');
    }
    setPinLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="border border-border rounded-lg p-4 space-y-3">
        <p className="font-display text-xs tracking-wider text-foreground">Display Name</p>
        <p className="font-body text-xs text-muted-foreground">This changes how your name appears. Login still uses your original name.</p>
        <Input value={displayName} onChange={e => setDisplayName(e.target.value)}
          placeholder={empName} className="bg-secondary border-border text-foreground font-body" />
        <Button size="sm" onClick={saveDisplayName} className="font-display text-xs tracking-wider w-full">Save</Button>
      </div>

      {/* Change PIN */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <p className="font-display text-xs tracking-wider text-foreground">Change PIN</p>
        </div>
        <Input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={6}
          value={currentPin} onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))}
          placeholder="Current PIN" className="bg-secondary border-border text-foreground font-body text-center text-xl tracking-[0.5em]" />
        <Input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={6}
          value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
          placeholder="New PIN" className="bg-secondary border-border text-foreground font-body text-center text-xl tracking-[0.5em]" />
        <Input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={6}
          value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
          placeholder="Confirm New PIN" className="bg-secondary border-border text-foreground font-body text-center text-xl tracking-[0.5em]"
          onKeyDown={e => { if (e.key === 'Enter') changePin(); }} />
        <Button size="sm" onClick={changePin} disabled={pinLoading || !currentPin || !newPin || !confirmPin}
          className="font-display text-xs tracking-wider w-full">
          {pinLoading ? 'Updating…' : 'Update PIN'}
        </Button>
      </div>

      <div className="border border-border rounded-lg p-4 space-y-2">
        <p className="font-display text-xs tracking-wider text-foreground">Account Info</p>
        <p className="font-body text-xs text-muted-foreground">Login name: <span className="text-foreground">{empName}</span></p>
        {emp?.phone && <p className="font-body text-xs text-muted-foreground">Phone: <span className="text-foreground">{emp.phone}</span></p>}
      </div>
    </div>
  );
}

export default EmployeePortal;
