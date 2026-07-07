import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Download, Upload, Pencil, Trash2, Clock, Check, X } from 'lucide-react';

type Employee = { id: string; name: string; hourly_rate: number };
type TimeEntry = {
  id: string; employee_id: string; entry_date: string; clock_in: string;
  clock_out: string | null; is_paid: boolean; paid_amount: number | null;
  paid_at: string | null; created_at: string; updated_at: string;
};

const fmt12 = (iso: string) => {
  try { return format(new Date(iso), 'h:mm a'); } catch { return '-'; }
};

const diffHours = (clockIn: string, clockOut: string | null): number => {
  if (!clockOut) return 0;
  return Math.max(0, (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000);
};

const TimesheetDashboard = ({ readOnly = false }: { readOnly?: boolean }) => {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [calcStart, setCalcStart] = useState('');
  const [calcEnd, setCalcEnd] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '', is_paid: false, paid_amount: '' });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-timesheet'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id, name, hourly_rate').eq('active', true).order('name');
      return (data || []) as Employee[];
    },
  });

  const { data: entries = [] } = useQuery<TimeEntry[]>({
    queryKey: ['time-entries'],
    queryFn: async () => {
      const { data } = await supabase.from('time_entries').select('*').order('entry_date', { ascending: false }).order('clock_in', { ascending: false }).limit(20);
      return (data || []) as TimeEntry[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel('time-entries-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, () => {
        qc.invalidateQueries({ queryKey: ['time-entries'] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const empMap = useMemo(() => {
    const m: Record<string, Employee> = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  const calcResults = useMemo(() => {
    if (!calcStart) return null;
    const endStr = calcEnd || '9999-12-31';
    const filtered = entries.filter(e => e.entry_date >= calcStart && e.entry_date <= endStr);
    const byEmp: Record<string, number> = {};
    filtered.forEach(e => {
      const h = diffHours(e.clock_in, e.clock_out);
      byEmp[e.employee_id] = (byEmp[e.employee_id] || 0) + h;
    });
    const breakdown = Object.entries(byEmp).map(([empId, hours]) => {
      const emp = empMap[empId];
      const rate = emp?.hourly_rate || 0;
      return { name: emp?.name || 'Unknown', rate, hours: Math.round(hours * 100) / 100, pay: Math.round(hours * rate * 100) / 100 };
    });
    const totalHours = breakdown.reduce((s, b) => s + b.hours, 0);
    const totalPay = breakdown.reduce((s, b) => s + b.pay, 0);
    return { totalHours: Math.round(totalHours * 100) / 100, totalPay: Math.round(totalPay * 100) / 100, breakdown };
  }, [calcStart, calcEnd, entries, empMap]);

  const clockOut = async (id: string) => {
    await supabase.from('time_entries').update({ clock_out: new Date().toISOString() }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['time-entries'] });
    toast.success('Clocked out');
  };

  const startEdit = (e: TimeEntry) => {
    setEditingId(e.id);
    setEditForm({
      clock_in: e.clock_in ? format(new Date(e.clock_in), "yyyy-MM-dd'T'HH:mm") : '',
      clock_out: e.clock_out ? format(new Date(e.clock_out), "yyyy-MM-dd'T'HH:mm") : '',
      is_paid: e.is_paid,
      paid_amount: e.paid_amount?.toString() || '',
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await supabase.from('time_entries').update({
      clock_in: new Date(editForm.clock_in).toISOString(),
      clock_out: editForm.clock_out ? new Date(editForm.clock_out).toISOString() : null,
      is_paid: editForm.is_paid,
      paid_amount: editForm.paid_amount ? parseFloat(editForm.paid_amount) : null,
      paid_at: editForm.is_paid ? new Date().toISOString() : null,
    }).eq('id', editingId);
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ['time-entries'] });
    toast.success('Entry updated');
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await supabase.from('time_entries').delete().eq('id', deleteId);
    setDeleteId(null);
    qc.invalidateQueries({ queryKey: ['time-entries'] });
    toast.success('Entry deleted');
  };

  const downloadCSV = () => {
    let filtered = entries;
    if (filterStart) filtered = filtered.filter(e => e.entry_date >= filterStart);
    if (filterEnd) filtered = filtered.filter(e => e.entry_date <= filterEnd);
    const rows = filtered.map(e => {
      const emp = empMap[e.employee_id];
      const hours = diffHours(e.clock_in, e.clock_out);
      return [
        emp?.name || '', e.entry_date, fmt12(e.clock_in), e.clock_out ? fmt12(e.clock_out) : '',
        hours.toFixed(2), emp?.hourly_rate || 0, (hours * (emp?.hourly_rate || 0)).toFixed(2),
        e.is_paid ? 'Paid' : 'Unpaid', e.paid_amount || ''
      ].join(',');
    });
    const csv = 'Employee,Date,Clock In,Clock Out,Hours,Rate,Pay,Paid Status,Paid Amount\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'timesheet.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').slice(1).filter(l => l.trim());
    const parseRow = (line: string) => {
      const result: string[] = []; let cur = ''; let inQuote = false;
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      result.push(cur.trim());
      return result;
    };

    const empNameMap: Record<string, string> = {};
    employees.forEach(emp => { empNameMap[emp.name.toLowerCase()] = emp.id; });

    let inserted = 0; let errors = 0;
    for (const line of lines) {
      const cols = parseRow(line);
      if (cols.length < 3) { errors++; continue; }
      const [nameStr, dateStr, clockInStr, clockOutStr] = cols;
      const empId = empNameMap[nameStr.toLowerCase()];
      if (!empId) { errors++; continue; }
      const entryDate = dateStr;
      const clockIn = new Date(`${dateStr}T${clockInStr || '08:00'}:00`).toISOString();
      const clockOut = clockOutStr ? new Date(`${dateStr}T${clockOutStr}:00`).toISOString() : null;
      const { error } = await supabase.from('time_entries').insert({ employee_id: empId, entry_date: entryDate, clock_in: clockIn, clock_out: clockOut });
      if (error) errors++; else inserted++;
    }
    qc.invalidateQueries({ queryKey: ['time-entries'] });
    toast.success(`Imported ${inserted} entries${errors > 0 ? `, ${errors} errors` : ''}`);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg tracking-wider text-foreground flex-grow">Timesheet Management</h2>
        <Input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)}
          className="bg-secondary border-border text-foreground font-body text-xs h-9 w-32" />
        <Input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)}
          className="bg-secondary border-border text-foreground font-body text-xs h-9 w-32" />
        <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={downloadCSV}>
          <Download className="h-3 w-3 mr-1" /> CSV
        </Button>
        {!readOnly && (
          <>
            <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3 w-3 mr-1" /> Bulk
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleBulkUpload} />
          </>
        )}
      </div>

      {/* Calculate Hours & Pay */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm tracking-wider">Calculate Hours & Pay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Label className="font-body text-xs text-muted-foreground">Start Date</Label>
              <Input type="date" value={calcStart} onChange={e => setCalcStart(e.target.value)}
                className="bg-secondary border-border text-foreground font-body text-xs h-9 w-36" />
            </div>
            <div>
              <Label className="font-body text-xs text-muted-foreground">End Date</Label>
              <Input type="date" value={calcEnd} onChange={e => setCalcEnd(e.target.value)}
                className="bg-secondary border-border text-foreground font-body text-xs h-9 w-36" />
            </div>
          </div>
          {calcResults && (
            <div className="space-y-2">
              <div className="flex gap-4">
                <div className="text-sm font-body"><span className="text-muted-foreground">Total Hours:</span> <span className="text-foreground font-semibold">{calcResults.totalHours}</span></div>
                <div className="text-sm font-body"><span className="text-muted-foreground">Total Pay:</span> <span className="text-foreground font-semibold">₱{calcResults.totalPay.toLocaleString()}</span></div>
              </div>
              {calcResults.breakdown.length > 0 && (
                <div className="space-y-1">
                  {calcResults.breakdown.map(b => (
                    <div key={b.name} className="flex justify-between text-xs font-body bg-secondary rounded px-2 py-1">
                      <span className="text-foreground">{b.name}</span>
                      <span className="text-muted-foreground">₱{b.rate}/hr · {b.hours}h · ₱{b.pay.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Time Entries - always stacked cards */}
      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="font-body text-sm text-muted-foreground text-center py-8">No time entries yet</p>
        )}
        {entries.map(entry => {
          const emp = empMap[entry.employee_id];
          const hours = diffHours(entry.clock_in, entry.clock_out);
          const isEditing = editingId === entry.id;

          if (isEditing) {
            return (
              <Card key={entry.id} className="bg-card border-border">
                <CardContent className="p-3 space-y-2">
                  <div className="font-body text-sm font-semibold text-foreground">{emp?.name || 'Unknown'}</div>
                  <div>
                    <Label className="font-body text-xs text-muted-foreground">Clock In</Label>
                    <Input type="datetime-local" value={editForm.clock_in} onChange={e => setEditForm(p => ({ ...p, clock_in: e.target.value }))} className="bg-secondary border-border text-foreground font-body text-xs h-9" />
                  </div>
                  <div>
                    <Label className="font-body text-xs text-muted-foreground">Clock Out</Label>
                    <Input type="datetime-local" value={editForm.clock_out} onChange={e => setEditForm(p => ({ ...p, clock_out: e.target.value }))} className="bg-secondary border-border text-foreground font-body text-xs h-9" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                      <input type="checkbox" checked={editForm.is_paid} onChange={e => setEditForm(p => ({ ...p, is_paid: e.target.checked }))} />
                      Paid
                    </label>
                    <Input placeholder="₱ Amount" value={editForm.paid_amount} onChange={e => setEditForm(p => ({ ...p, paid_amount: e.target.value }))} className="bg-secondary border-border text-foreground font-body text-xs h-9 w-28" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} className="font-display text-xs h-9 flex-1"><Check className="h-3 w-3 mr-1" />Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="font-display text-xs h-9 flex-1"><X className="h-3 w-3 mr-1" />Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={entry.id} className="bg-card border-border">
              <CardContent className="p-3">
                <div className="flex justify-between items-start mb-1">
                  <div className="font-body text-sm font-semibold text-foreground">{emp?.name || 'Unknown'}</div>
                  <Badge variant={entry.is_paid ? 'default' : 'secondary'} className="text-[10px]">{entry.is_paid ? 'Paid' : 'Unpaid'}</Badge>
                </div>
                <div className="font-body text-xs text-muted-foreground mb-0.5">{entry.entry_date}</div>
                <div className="flex items-center gap-1 font-body text-xs text-foreground mb-0.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {fmt12(entry.clock_in)} → {entry.clock_out ? fmt12(entry.clock_out) : <span className="text-accent">Active</span>}
                </div>
                <div className="font-body text-xs text-muted-foreground">
                  {hours > 0 ? `${hours.toFixed(1)}h` : '-'} {entry.paid_amount ? `· ₱${entry.paid_amount}` : ''}
                </div>
                {!readOnly && (
                  <div className="flex gap-1 pt-2">
                    {!entry.clock_out && (
                      <Button size="sm" variant="outline" className="h-10 w-10 p-0" onClick={() => clockOut(entry.id)}>
                        <Clock className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-10 w-10 p-0" onClick={() => startEdit(entry)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-10 w-10 p-0 text-destructive" onClick={() => setDeleteId(entry.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-foreground">Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-muted-foreground">This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-display">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground font-display">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TimesheetDashboard;
