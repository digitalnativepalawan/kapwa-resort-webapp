import { useState, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { startOfWeek, startOfMonth, endOfDay, startOfDay, format } from 'date-fns';
import { CalendarIcon, Download, Upload, FileArchive, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import JSZip from 'jszip';

type DateRange = 'week' | 'month' | 'custom';

const toCsvRow = (vals: (string | number | boolean | null | undefined)[]) =>
  vals.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');

const arrayToCsv = (headers: string[], rows: (string | number | boolean | null | undefined)[][]) =>
  [headers.join(','), ...rows.map(toCsvRow)].join('\n');

const AccountingExport = () => {
  const [range, setRange] = useState<DateRange>('week');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    switch (range) {
      case 'week':
        return { dateFrom: startOfWeek(now, { weekStartsOn: 1 }), dateTo: endOfDay(now) };
      case 'month':
        return { dateFrom: startOfMonth(now), dateTo: endOfDay(now) };
      case 'custom':
        return {
          dateFrom: customFrom ? startOfDay(customFrom) : new Date('2000-01-01'),
          dateTo: customTo ? endOfDay(customTo) : endOfDay(now),
        };
    }
  }, [range, customFrom, customTo]);

  const generateExport = async () => {
    setLoading(true);
    try {
      const from = dateFrom.toISOString();
      const to = dateTo.toISOString();
      const zip = new JSZip();

      // Orders
      const { data: orders = [] } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      zip.file('orders.csv', arrayToCsv(
        ['id', 'created_at', 'closed_at', 'order_type', 'location_detail', 'guest_name', 'staff_name', 'status', 'total', 'service_charge', 'payment_type', 'items'],
        orders.map(o => [o.id, o.created_at, o.closed_at, o.order_type, o.location_detail, o.guest_name, o.staff_name, o.status, o.total, o.service_charge, o.payment_type, JSON.stringify(o.items)])
      ));

      // Tabs
      const { data: tabs = [] } = await (supabase.from('tabs') as any)
        .select('*')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      zip.file('tabs.csv', arrayToCsv(
        ['id', 'created_at', 'closed_at', 'status', 'location_type', 'location_detail', 'guest_name', 'payment_method'],
        tabs.map((t: any) => [t.id, t.created_at, t.closed_at, t.status, t.location_type, t.location_detail, t.guest_name, t.payment_method])
      ));

      // Guest Tours / Experiences
      const { data: tours = [] } = await supabase
        .from('guest_tours')
        .select('*')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      zip.file('experiences.csv', arrayToCsv(
        ['id', 'tour_name', 'tour_date', 'unit_name', 'provider', 'price', 'pax', 'pickup_time', 'status', 'confirmed_by', 'notes'],
        tours.map(t => [t.id, t.tour_name, t.tour_date, t.unit_name, t.provider, t.price, t.pax, t.pickup_time, t.status, t.confirmed_by, t.notes])
      ));

      // Guest Requests
      const { data: requests = [] } = await supabase
        .from('guest_requests')
        .select('*')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      zip.file('guest_requests.csv', arrayToCsv(
        ['id', 'created_at', 'guest_name', 'request_type', 'details', 'status', 'confirmed_by'],
        requests.map(r => [r.id, r.created_at, r.guest_name, r.request_type, r.details, r.status, r.confirmed_by])
      ));

      // Housekeeping
      const { data: hk = [] } = await supabase
        .from('housekeeping_orders')
        .select('*')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      zip.file('housekeeping.csv', arrayToCsv(
        ['id', 'created_at', 'unit_name', 'status', 'priority', 'cleaning_by_name', 'inspection_by_name', 'cleaning_completed_at', 'inspection_completed_at', 'time_to_complete_minutes', 'cleaning_notes', 'damage_notes'],
        hk.map(h => [h.id, h.created_at, h.unit_name, h.status, h.priority, h.cleaning_by_name, h.inspection_by_name, h.cleaning_completed_at, h.inspection_completed_at, h.time_to_complete_minutes, h.cleaning_notes, h.damage_notes])
      ));

      // Tasks (including archived)
      const { data: tasks = [] } = await (supabase.from('employee_tasks') as any)
        .select('*')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      zip.file('tasks.csv', arrayToCsv(
        ['id', 'created_at', 'title', 'description', 'status', 'employee_id', 'created_by', 'due_date', 'completed_at', 'archived_at', 'completion_meta'],
        tasks.map((t: any) => [t.id, t.created_at, t.title, t.description, t.status, t.employee_id, t.created_by, t.due_date, t.completed_at, t.archived_at, JSON.stringify(t.completion_meta)])
      ));

      // Bookings
      const { data: bookings = [] } = await supabase
        .from('resort_ops_bookings')
        .select('*')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      zip.file('bookings.csv', arrayToCsv(
        ['id', 'created_at', 'check_in', 'check_out', 'platform', 'room_rate', 'paid_amount', 'adults', 'children', 'special_requests', 'notes'],
        bookings.map(b => [b.id, b.created_at, b.check_in, b.check_out, b.platform, b.room_rate, b.paid_amount, b.adults, b.children, b.special_requests, b.notes])
      ));

      // Resort Ops Expenses
      const { data: expenses = [] } = await supabase
        .from('resort_ops_expenses')
        .select('*')
        .gte('expense_date', format(dateFrom, 'yyyy-MM-dd'))
        .lte('expense_date', format(dateTo, 'yyyy-MM-dd'))
        .order('expense_date', { ascending: false });

      zip.file('expenses.csv', arrayToCsv(
        ['id', 'expense_date', 'category', 'name', 'description', 'amount', 'vat_status', 'vatable_sale', 'vat_amount', 'vat_exempt_amount', 'zero_rated_amount', 'withholding_tax', 'payment_method', 'invoice_number', 'official_receipt_number', 'supplier_tin', 'is_paid', 'project_unit', 'notes'],
        expenses.map(e => [e.id, e.expense_date, e.category, e.name, e.description, e.amount, e.vat_status, e.vatable_sale, e.vat_amount, e.vat_exempt_amount, e.zero_rated_amount, e.withholding_tax, e.payment_method, e.invoice_number, e.official_receipt_number, e.supplier_tin, e.is_paid, e.project_unit, e.notes])
      ));

      // Revenue & Expense summary
      const totalRevenue = orders.filter(o => ['Paid', 'Closed'].includes(o.status)).reduce((s, o) => s + (o.total || 0), 0);
      const totalSC = orders.reduce((s, o) => s + (o.service_charge || 0), 0);
      const toursRevenue = tours.reduce((s, t) => s + (t.price || 0), 0);
      const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
      const totalInputVAT = expenses.reduce((s, e) => s + (e.vat_amount || 0), 0);
      zip.file('summary.csv', arrayToCsv(
        ['metric', 'value'],
        [
          ['Period From', format(dateFrom, 'yyyy-MM-dd')],
          ['Period To', format(dateTo, 'yyyy-MM-dd')],
          ['Total Orders', orders.length],
          ['Order Revenue', totalRevenue],
          ['Service Charges', totalSC],
          ['Tours Revenue', toursRevenue],
          ['Total Bookings', bookings.length],
          ['Total Expenses', totalExpenses],
          ['Total Input VAT', totalInputVAT],
          ['Net Income (Revenue - Expenses)', totalRevenue + toursRevenue - totalExpenses],
          ['Total Tasks', tasks.length],
          ['Housekeeping Jobs', hk.length],
        ]
      ));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accounting-export-${format(dateFrom, 'yyyyMMdd')}-${format(dateTo, 'yyyyMMdd')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (err) {
      console.error(err);
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('Empty CSV file'); return; }

      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

      // Detect if it's a tasks CSV with archived_at
      if (headers.includes('id') && headers.includes('archived_at') && headers.includes('title')) {
        const idIdx = headers.indexOf('id');
        const archivedIdx = headers.indexOf('archived_at');
        let restored = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || [];
          const id = cols[idIdx];
          const archivedAt = cols[archivedIdx];
          if (id && archivedAt) {
            await (supabase.from('employee_tasks') as any).update({ archived_at: null }).eq('id', id);
            restored++;
          }
        }
        if (restored > 0) toast.success(`Restored ${restored} archived task(s)`);
        else toast.info('No archived tasks found to restore');
      } else {
        toast.info('CSV imported — only task restoration is currently supported');
      }
    } catch (err) {
      console.error(err);
      toast.error('Import failed');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const ranges: { key: DateRange; label: string }[] = [
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <FileArchive className="w-4 h-4 text-primary" />
        <h3 className="font-display text-sm tracking-wider text-foreground">Accounting Export</h3>
      </div>

      <div className="flex flex-wrap gap-2">
        {ranges.map(r => (
          <Button key={r.key} size="sm" variant={range === r.key ? 'default' : 'outline'}
            onClick={() => setRange(r.key)} className="font-body text-xs flex-1 min-w-[80px]">
            {r.label}
          </Button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="flex gap-2 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("font-body text-xs justify-start min-w-[140px]", !customFrom && "text-muted-foreground")}>
                <CalendarIcon className="w-3 h-3 mr-1" />
                {customFrom ? format(customFrom, 'MMM dd, yyyy') : 'From date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("font-body text-xs justify-start min-w-[140px]", !customTo && "text-muted-foreground")}>
                <CalendarIcon className="w-3 h-3 mr-1" />
                {customTo ? format(customTo, 'MMM dd, yyyy') : 'To date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={generateExport} disabled={loading} className="font-body text-xs flex-1">
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
          Generate Accounting Export
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="font-body text-xs">
          <Upload className="w-4 h-4 mr-1" /> Import CSV
        </Button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
      </div>

      <p className="font-body text-[11px] text-muted-foreground">
        Exports a ZIP file with: bookings, orders, tabs, experiences, guest requests, housekeeping, tasks, expenses, and a revenue/expense summary.
      </p>
    </section>
  );
};

export default AccountingExport;
