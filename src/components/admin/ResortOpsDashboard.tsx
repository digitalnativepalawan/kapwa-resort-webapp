import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, AlertTriangle, Upload, Pencil, Check, X, Banknote, CalendarPlus, Printer, Settings, BarChart3, FileUp, ExternalLink, Camera, Image, ScanLine, Loader2, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import ImportReservationsModal from './ImportReservationsModal';
import ExpenseReportsModal from './ExpenseReportsModal';
import ResortOpsPnLReport from './ResortOpsPnLReport';
import ExpenseBulkImportModal from './ExpenseBulkImportModal';
import WebhookSettings from './WebhookSettings';
import { format, startOfMonth, endOfMonth, getDaysInMonth, eachDayOfInterval, isWithinInterval, parseISO, isBefore, subMonths } from 'date-fns';

export const EXPENSE_CATEGORIES = [
  'Food & Beverage', 'Utilities (Electric/Water/Gas/Fuel)', 'Labor/Staff', 'Housekeeping',
  'Maintenance/Repairs', 'Operations/Supplies', 'Marketing/Admin', 'Professional Services',
  'Permits/Licenses', 'Transportation', 'Guest Services', 'Taxes/Government',
  'Capital Expenditures', 'Miscellaneous',
];

export const VAT_STATUSES = ['VAT', 'Non-VAT', 'VAT-Exempt', 'Zero-Rated'] as const;
export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'GCash', 'Credit Card'] as const;

/** Auto-compute VAT fields from vat_status + total_amount */
export const computeVatFields = (vatStatus: string, totalAmount: number) => {
  const ta = totalAmount || 0;
  switch (vatStatus) {
    case 'VAT': {
      const vatAmt = ta / 1.12 * 0.12;
      return { vatable_sale: ta - vatAmt, vat_amount: vatAmt, vat_exempt_amount: 0, zero_rated_amount: 0 };
    }
    case 'Non-VAT':
      return { vatable_sale: 0, vat_amount: 0, vat_exempt_amount: 0, zero_rated_amount: 0 };
    case 'VAT-Exempt':
      return { vatable_sale: 0, vat_amount: 0, vat_exempt_amount: ta, zero_rated_amount: 0 };
    case 'Zero-Rated':
      return { vatable_sale: 0, vat_amount: 0, vat_exempt_amount: 0, zero_rated_amount: ta };
    default:
      return { vatable_sale: ta, vat_amount: 0, vat_exempt_amount: 0, zero_rated_amount: 0 };
  }
};

const from = (table: string) => supabase.from(table as any);

const EMPTY_EXPENSE = {
  name: '',
  supplier_tin: '',
  vat_status: 'Non-VAT',
  invoice_number: '',
  official_receipt_number: '',
  category: '',
  description: '',
  amount: '',
  withholding_tax: '0',
  payment_method: 'Cash',
  is_paid: true,
  project_unit: '',
  notes: '',
  image_url: '',
  expense_date: '',
};

const fmtDecStatic = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ExpenseData = typeof EMPTY_EXPENSE;

const ExpenseFormFields = ({ data, onChange, scannedFields, scanningReceipt, onScanReceipt }: {
  data: ExpenseData;
  onChange: (d: ExpenseData) => void;
  scannedFields: Set<string>;
  scanningReceipt: boolean;
  onScanReceipt: (file: File) => void;
}) => {
  const inputCls = "bg-secondary border-border text-foreground font-body text-sm";
  const highlightCls = (field: string) => scannedFields.has(field) ? 'ring-2 ring-primary/50' : '';
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label className="flex-1 cursor-pointer">
          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={scanningReceipt}
            onChange={(e) => { const file = e.target.files?.[0]; if (file) onScanReceipt(file); e.target.value = ''; }} />
          <div className={`flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-dashed border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 transition-colors font-body text-sm ${scanningReceipt ? 'opacity-50 pointer-events-none' : ''}`}>
            {scanningReceipt ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {scanningReceipt ? 'Scanning receipt...' : '📷 Scan Receipt (AI)'}
          </div>
        </label>
      </div>
      {scannedFields.size > 0 && (
        <div className="px-2 py-1.5 rounded bg-primary/10 border border-primary/20 font-body text-xs text-primary">
          ✨ AI extracted {scannedFields.size} fields (highlighted). Review and confirm before saving.
        </div>
      )}
      <Input placeholder="Supplier Name *" value={data.name} onChange={e => onChange({...data, name: e.target.value})} className={`${inputCls} ${highlightCls('name')}`} />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Supplier TIN" value={data.supplier_tin} onChange={e => onChange({...data, supplier_tin: e.target.value})} className={`${inputCls} ${highlightCls('supplier_tin')}`} />
        <Select value={data.vat_status} onValueChange={v => onChange({...data, vat_status: v})}>
          <SelectTrigger className={inputCls}><SelectValue placeholder="VAT Status *" /></SelectTrigger>
          <SelectContent>{VAT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {data.vat_status === 'VAT' && !data.supplier_tin && (
        <p className="font-body text-xs text-destructive">⚠ Supplier TIN required for VAT status</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Invoice #" value={data.invoice_number} onChange={e => onChange({...data, invoice_number: e.target.value})} className={`${inputCls} ${highlightCls('invoice_number')}`} />
        <Input placeholder="OR #" value={data.official_receipt_number} onChange={e => onChange({...data, official_receipt_number: e.target.value})} className={`${inputCls} ${highlightCls('official_receipt_number')}`} />
      </div>
      <Select value={data.category} onValueChange={v => onChange({...data, category: v})}>
        <SelectTrigger className={inputCls}><SelectValue placeholder="Category *" /></SelectTrigger>
        <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
      </Select>
      <Input placeholder="Description" value={data.description} onChange={e => onChange({...data, description: e.target.value})} className={`${inputCls} ${highlightCls('description')}`} />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Total Amount *" type="number" inputMode="decimal" value={data.amount} onChange={e => onChange({...data, amount: e.target.value})} className={`${inputCls} ${highlightCls('amount')}`} />
        <Input type="date" value={data.expense_date} onChange={e => onChange({...data, expense_date: e.target.value})} className={`${inputCls} ${highlightCls('expense_date')}`} />
      </div>
      {data.amount && parseFloat(data.amount) > 0 && (
        <div className="px-2 py-1.5 rounded bg-muted/50 border border-border font-body text-xs text-muted-foreground space-y-0.5">
          {(() => {
            const vf = computeVatFields(data.vat_status, parseFloat(data.amount));
            return <>
              {vf.vatable_sale > 0 && <p>VATable Sale: <span className="text-foreground">₱{fmtDecStatic(vf.vatable_sale)}</span></p>}
              {vf.vat_amount > 0 && <p>VAT (12%): <span className="text-foreground">₱{fmtDecStatic(vf.vat_amount)}</span></p>}
              {vf.vat_exempt_amount > 0 && <p>VAT-Exempt: <span className="text-foreground">₱{fmtDecStatic(vf.vat_exempt_amount)}</span></p>}
              {vf.zero_rated_amount > 0 && <p>Zero-Rated: <span className="text-foreground">₱{fmtDecStatic(vf.zero_rated_amount)}</span></p>}
            </>;
          })()}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Withholding Tax" type="number" inputMode="decimal" value={data.withholding_tax} onChange={e => onChange({...data, withholding_tax: e.target.value})} className={inputCls} />
        <Select value={data.payment_method} onValueChange={v => onChange({...data, payment_method: v})}>
          <SelectTrigger className={inputCls}><SelectValue placeholder="Payment Method" /></SelectTrigger>
          <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Project / Unit" value={data.project_unit} onChange={e => onChange({...data, project_unit: e.target.value})} className={inputCls} />
        <div className="flex items-center gap-2 px-2">
          <Checkbox checked={data.is_paid} onCheckedChange={v => onChange({...data, is_paid: !!v})} />
          <label className="font-body text-xs text-foreground">Paid</label>
        </div>
      </div>
      <Textarea placeholder="Notes (optional)" value={data.notes} onChange={e => onChange({...data, notes: e.target.value})} className="bg-secondary border-border text-foreground font-body text-sm min-h-[60px]" />
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <Input placeholder="Image/Receipt URL (optional)" value={data.image_url} onChange={e => onChange({...data, image_url: e.target.value})} className={`${inputCls} flex-1`} />
          <label className="cursor-pointer">
            <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
                const ext = file.name.split('.').pop() || 'jpg';
                const path = `expenses/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                toast.loading('Uploading receipt...', { id: 'receipt-upload' });
                const { error } = await supabase.storage.from('receipts').upload(path, file);
                if (error) { toast.error(`Upload failed: ${error.message}`, { id: 'receipt-upload' }); return; }
                const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
                onChange({...data, image_url: urlData.publicUrl});
                toast.success('Receipt uploaded', { id: 'receipt-upload' });
              }}
            />
            <div className="flex items-center justify-center h-10 px-3 rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <Camera className="w-4 h-4" />
            </div>
          </label>
        </div>
        {data.image_url && (
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50 border border-border">
            <Image className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <a href={data.image_url} target="_blank" rel="noopener noreferrer" className="font-body text-xs text-primary hover:underline truncate flex-1">
              {data.image_url.includes('receipts/') ? 'View uploaded receipt' : data.image_url}
            </a>
            <Button size="icon" variant="ghost" className="h-5 w-5 flex-shrink-0" onClick={() => onChange({...data, image_url: ''})}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

const ResortOpsDashboard = ({ readOnly = false }: { readOnly?: boolean }) => {
  const qc = useQueryClient();
  
  // Date range state
  const [dateFrom, setDateFrom] = useState(() => {
    return '2025-01-01';
  });
  const [dateTo, setDateTo] = useState(() => {
    return format(new Date(), 'yyyy-MM-dd');
  });
  const [datePreset, setDatePreset] = useState<'ytd' | 'custom'>('ytd');

  const setYTD = () => {
    const now = new Date();
    const startOfYear = `${now.getFullYear()}-01-01`;
    setDateFrom(startOfYear);
    setDateTo(format(now, 'yyyy-MM-dd'));
    setDatePreset('ytd');
  };

  const setCurrentMonth = () => {
    const now = new Date();
    const startOfMonthDate = startOfMonth(now);
    const endOfMonthDate = endOfMonth(now);
    setDateFrom(format(startOfMonthDate, 'yyyy-MM-dd'));
    setDateTo(format(endOfMonthDate, 'yyyy-MM-dd'));
    setDatePreset('custom');
  };

  const setLastMonth = () => {
    const lastMonthDate = subMonths(new Date(), 1);
    const start = startOfMonth(lastMonthDate);
    const end = endOfMonth(lastMonthDate);
    setDateFrom(format(start, 'yyyy-MM-dd'));
    setDateTo(format(end, 'yyyy-MM-dd'));
    setDatePreset('custom');
  };

  const monthStartStr = dateFrom;
  const monthEndStr = dateTo;

  const startDateObj = parseISO(dateFrom);
  const endDateObj = parseISO(dateTo);
  const daysArray = eachDayOfInterval({ start: startDateObj, end: endDateObj });
  const daysInMonth = daysArray.length;

  // ── Data queries ──
  const { data: units = [] } = useQuery({
    queryKey: ['resort-ops-units'],
    queryFn: async () => { const { data } = await from('resort_ops_units').select('*').order('name'); return data || []; },
  });
  const { data: guests = [] } = useQuery({
    queryKey: ['resort-ops-guests'],
    queryFn: async () => { const { data } = await from('resort_ops_guests').select('*').order('full_name'); return data || []; },
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ['resort-ops-bookings'],
    queryFn: async () => { const { data } = await from('resort_ops_bookings').select('*').order('check_in'); return data || []; },
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ['resort-ops-expenses'],
    queryFn: async () => { const { data } = await from('resort_ops_expenses').select('*').order('expense_date', { ascending: false }); return data || []; },
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ['resort-ops-tasks'],
    queryFn: async () => { const { data } = await from('resort_ops_tasks').select('*').order('due_date'); return data || []; },
  });
  const { data: assets = [] } = useQuery({
    queryKey: ['resort-ops-assets'],
    queryFn: async () => { const { data } = await from('resort_ops_assets').select('*').order('name'); return data || []; },
  });
  const { data: payments = [] } = useQuery({
    queryKey: ['resort-ops-payments'],
    queryFn: async () => { const { data } = await from('resort_ops_incoming_payments').select('*').order('expected_date'); return data || []; },
  });
  const { data: orders = [] } = useQuery({
    queryKey: ['resort-ops-orders', dateFrom, dateTo],
    queryFn: async () => {
      if (!dateFrom || !dateTo) return [];
      const { data } = await supabase.from('orders').select('*')
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59');
      return data || [];
    },
    enabled: !!dateFrom && !!dateTo,
  });
  const { data: menuItems = [] } = useQuery({
    queryKey: ['resort-ops-menu'],
    queryFn: async () => { const { data } = await supabase.from('menu_items').select('*'); return data || []; },
  });

  // ── Filtered data ──
  const monthBookings = useMemo(() => bookings.filter((b: any) => b.check_in >= dateFrom && b.check_in <= dateTo), [bookings, dateFrom, dateTo]);
  const monthExpenses = useMemo(() => expenses.filter((e: any) => e.expense_date >= dateFrom && e.expense_date <= dateTo), [expenses, dateFrom, dateTo]);
  const monthTasks = useMemo(() => tasks.filter((t: any) => t.due_date >= dateFrom && t.due_date <= dateTo), [tasks, dateFrom, dateTo]);
  const monthPayments = useMemo(() => payments.filter((p: any) => p.expected_date >= dateFrom && p.expected_date <= dateTo), [payments, dateFrom, dateTo]);

  // ── KPI calculations ──
  const revenue = useMemo(() => monthBookings.reduce((s: number, b: any) => s + Number(b.paid_amount || 0), 0), [monthBookings]);
  const totalExpenses = useMemo(() => monthExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0), [monthExpenses]);
  const foodCost = useMemo(() => {
    const menuMap = new Map(menuItems.map((m: any) => [m.name, m.food_cost || 0]));
    return orders.reduce((sum: number, o: any) => {
      const items = (o.items as any[]) || [];
      return sum + items.reduce((s: number, i: any) => s + (Number(menuMap.get(i.name) || 0) * (i.qty || 1)), 0);
    }, 0);
  }, [orders, menuItems]);
  
  const foodRevenue = useMemo(
    () => orders.reduce((s, o) => s + Number(o.total || 0), 0),
    [orders]
  );
  
  const totalRevenue = revenue + foodRevenue;
  const foodProfit = foodRevenue - foodCost;
  const netProfit = totalRevenue - foodCost - totalExpenses;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // ── Lookup helpers ──
  const guestMap = useMemo(() => new Map(guests.map((g: any) => [g.id, g.full_name])), [guests]);
  const unitMap = useMemo(() => new Map(units.map((u: any) => [u.id, u])), [units]);

  // ── Occupancy ──
  const occupancyData = useMemo(() => {
    return units.map((unit: any) => {
      const unitBookings = bookings.filter((b: any) => b.unit_id === unit.id);
      let bookedDays = 0;
      daysArray.forEach(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const isBooked = unitBookings.some((b: any) => dayStr >= b.check_in && dayStr < b.check_out);
        if (isBooked) bookedDays++;
      });
      const pct = daysInMonth > 0 ? (bookedDays / daysInMonth) * 100 : 0;
      return { unit, bookedDays, pct, unitBookings };
    });
  }, [units, bookings, daysArray, daysInMonth]);

  // ── Unit performance ──
  const unitPerformance = useMemo(() => {
    return units.map((unit: any) => {
      const projected = Number(unit.base_price) * daysInMonth;
      const realized = monthBookings.filter((b: any) => b.unit_id === unit.id).reduce((s: number, b: any) => s + Number(b.paid_amount || 0), 0);
      const variance = realized - projected;
      const occPct = occupancyData.find((o: any) => o.unit.id === unit.id)?.pct || 0;
      const status = occPct > 90 ? 'HIGH' : occPct >= 50 ? 'ON_TRACK' : 'LOW';
      return { unit, projected, realized, variance, status };
    });
  }, [units, monthBookings, daysInMonth, occupancyData]);

  // ── Inline add forms state ──
  const [newExpense, setNewExpense] = useState({ ...EMPTY_EXPENSE });
  const [newTask, setNewTask] = useState({ title: '', category: '', due_date: '', priority: 'medium', description: '' });
  const [newAsset, setNewAsset] = useState({ name: '', type: '', balance: '' });
  const [newPayment, setNewPayment] = useState({ source: '', amount: '', expected_date: '' });
  const [newUnit, setNewUnit] = useState({ name: '', type: '', base_price: '', capacity: '' });
  
  const [newBooking, setNewBooking] = useState({ guest_id: '', guest_name: '', unit_id: '', platform: '', check_in: '', check_out: '', adults: '1', room_rate: '', addons_total: '0', paid_amount: '0', commission_applied: '0' });
  const [guestSearch, setGuestSearch] = useState('');
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);
  const [editGuestSearch, setEditGuestSearch] = useState('');
  const [showEditGuestDropdown, setShowEditGuestDropdown] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [expenseReportsOpen, setExpenseReportsOpen] = useState(false);
  const [expenseBulkImportOpen, setExpenseBulkImportOpen] = useState(false);
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all');
  const [expenseVatFilter, setExpenseVatFilter] = useState<'all' | 'VAT' | 'Non-VAT' | 'VAT-Exempt' | 'missing-tin'>('all');
  const [showAddExpenseForm, setShowAddExpenseForm] = useState(false);
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set());
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'staying' | 'arriving' | 'departing' | 'unpaid'>('all');
  const [showWebhook, setShowWebhook] = useState(false);

  // ── Editing states ──
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [editingBooking, setEditingBooking] = useState<any>(null);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [editingAsset, setEditingAsset] = useState<any>(null);
  const [editingPayment, setEditingPayment] = useState<any>(null);

  // ── CRUD helpers ──
  const invalidateAll = () => {
    ['resort-ops-units','resort-ops-guests','resort-ops-bookings','resort-ops-expenses','resort-ops-tasks','resort-ops-assets','resort-ops-payments'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  };

  const buildExpensePayload = (e: typeof EMPTY_EXPENSE) => {
    const totalAmount = parseFloat(e.amount) || 0;
    const vatFields = computeVatFields(e.vat_status, totalAmount);
    return {
      name: e.name,
      supplier_tin: e.supplier_tin || null,
      vat_status: e.vat_status,
      invoice_number: e.invoice_number || null,
      official_receipt_number: e.official_receipt_number || null,
      category: e.category,
      description: e.description || null,
      amount: totalAmount,
      vatable_sale: vatFields.vatable_sale,
      vat_amount: vatFields.vat_amount,
      vat_exempt_amount: vatFields.vat_exempt_amount,
      zero_rated_amount: vatFields.zero_rated_amount,
      withholding_tax: parseFloat(e.withholding_tax) || 0,
      payment_method: e.payment_method || null,
      is_paid: e.is_paid,
      project_unit: e.project_unit || null,
      notes: e.notes || null,
      image_url: e.image_url || null,
      expense_date: e.expense_date,
    };
  };

  const validateExpense = (e: typeof EMPTY_EXPENSE): string | null => {
    if (!e.name) return 'Supplier name is required';
    if (!e.amount || parseFloat(e.amount) <= 0) return 'Total amount is required';
    if (!e.expense_date) return 'Date is required';
    if (!e.category) return 'Category is required';
    if (!e.vat_status) return 'VAT status is required';
    if (e.vat_status === 'VAT' && !e.supplier_tin) return 'Supplier TIN is required for VAT';
    return null;
  };

  const addExpense = async () => {
    const err = validateExpense(newExpense);
    if (err) { toast.error(err); return; }
    await from('resort_ops_expenses').insert(buildExpensePayload(newExpense) as any);
    setNewExpense({ ...EMPTY_EXPENSE });
    setShowAddExpenseForm(false);
    setScannedFields(new Set());
    invalidateAll();
    toast.success('Expense added');
  };

  const deleteRow = async (table: string, id: string) => {
    if (table === 'resort_ops_bookings') {
      const booking = (bookings as any[]).find((b) => b.id === id);
      if (booking?.unit_id) {
        const resortUnit = (units as any[]).find((u) => u.id === booking.unit_id);
        if (resortUnit) {
          const displayUnit = await supabase.from('units' as any).select('id, status').ilike('unit_name', resortUnit.name.trim()).limit(1);
          const dUnit = (displayUnit.data as any)?.[0];
          if (dUnit && (dUnit.status === 'occupied' || dUnit.status === 'to_clean')) {
            const otherActive = (bookings as any[]).find((b: any) => b.id !== id && b.unit_id === booking.unit_id && b.check_in <= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) && b.check_out > new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }));
            if (!otherActive) {
              await supabase.from('units' as any).update({ status: 'ready' } as any).eq('id', dUnit.id);
            }
          }
        }
      }
    }
    await from(table).delete().eq('id', id);
    invalidateAll();
    qc.invalidateQueries({ queryKey: ['rooms-units'] });
    toast.success('Deleted');
  };

  const addTask = async () => {
    if (!newTask.title || !newTask.due_date) return;
    await from('resort_ops_tasks').insert({ title: newTask.title, category: newTask.category, due_date: newTask.due_date, priority: newTask.priority, description: newTask.description });
    setNewTask({ title: '', category: '', due_date: '', priority: 'medium', description: '' });
    invalidateAll();
    toast.success('Task added');
  };

  const toggleTaskStatus = async (id: string, current: string) => {
    const next = current === 'pending' ? 'in_progress' : current === 'in_progress' ? 'done' : 'pending';
    await from('resort_ops_tasks').update({ status: next }).eq('id', id);
    invalidateAll();
  };

  const addAsset = async () => {
    if (!newAsset.name) return;
    await from('resort_ops_assets').insert({ name: newAsset.name, type: newAsset.type, balance: parseFloat(newAsset.balance) || 0 });
    setNewAsset({ name: '', type: '', balance: '' });
    invalidateAll();
    toast.success('Asset added');
  };

  const addPayment = async () => {
    if (!newPayment.source || !newPayment.amount || !newPayment.expected_date) return;
    await from('resort_ops_incoming_payments').insert({ source: newPayment.source, amount: parseFloat(newPayment.amount), expected_date: newPayment.expected_date });
    setNewPayment({ source: '', amount: '', expected_date: '' });
    invalidateAll();
    toast.success('Payment added');
  };

  const addUnit = async () => {
    if (!newUnit.name) return;
    await from('resort_ops_units').insert({ name: newUnit.name, type: newUnit.type, base_price: parseFloat(newUnit.base_price) || 0, capacity: parseInt(newUnit.capacity) || 2 });
    setNewUnit({ name: '', type: '', base_price: '', capacity: '' });
    invalidateAll();
    toast.success('Unit added');
  };

  const addBooking = async () => {
    let guestId = newBooking.guest_id;
    if (!guestId && newBooking.guest_name.trim()) {
      const { data: newGuest, error } = await from('resort_ops_guests').insert({ full_name: newBooking.guest_name.trim() }).select('id').single();
      if (error || !newGuest) { toast.error('Failed to create guest'); return; }
      guestId = (newGuest as any).id;
      qc.invalidateQueries({ queryKey: ['resort-ops-guests'] });
    }
    if (!guestId || !newBooking.unit_id || !newBooking.check_in || !newBooking.check_out) { toast.error('Fill in all required fields'); return; }
    const conflicting = (bookings as any[]).find((b: any) =>
      b.unit_id === newBooking.unit_id &&
      b.check_in < newBooking.check_out &&
      b.check_out > newBooking.check_in
    );
    if (conflicting) {
      const cName = (guests as any[]).find((g) => g.id === conflicting.guest_id)?.full_name || conflicting.platform || 'another guest';
      toast.error(`Double booking! This room is booked by ${cName} (${conflicting.check_in} to ${conflicting.check_out}).`);
      return;
    }
    await from('resort_ops_bookings').insert({
      guest_id: guestId, unit_id: newBooking.unit_id, platform: newBooking.platform,
      check_in: newBooking.check_in, check_out: newBooking.check_out, adults: parseInt(newBooking.adults) || 1,
      room_rate: parseFloat(newBooking.room_rate) || 0, addons_total: parseFloat(newBooking.addons_total) || 0,
      paid_amount: parseFloat(newBooking.paid_amount) || 0, commission_applied: parseFloat(newBooking.commission_applied) || 0,
    });
    setNewBooking({ guest_id: '', guest_name: '', unit_id: '', platform: '', check_in: '', check_out: '', adults: '1', room_rate: '', addons_total: '0', paid_amount: '0', commission_applied: '0' });
    setGuestSearch('');
    invalidateAll();
    toast.success('Booking added');
  };

  const saveUnit = async () => {
    if (!editingUnit) return;
    await from('resort_ops_units').update({ name: editingUnit.name, type: editingUnit.type, base_price: parseFloat(editingUnit.base_price) || 0, capacity: parseInt(editingUnit.capacity) || 2 }).eq('id', editingUnit.id);
    setEditingUnit(null);
    invalidateAll();
    toast.success('Unit updated');
  };

  const saveBooking = async () => {
    if (!editingBooking) return;
    const conflicting = (bookings as any[]).find((b: any) =>
      b.unit_id === editingBooking.unit_id &&
      b.id !== editingBooking.id &&
      b.check_in < editingBooking.check_out &&
      b.check_out > editingBooking.check_in
    );
    if (conflicting) {
      const cName = (guests as any[]).find((g) => g.id === conflicting.guest_id)?.full_name || conflicting.platform || 'another guest';
      toast.error(`Double booking! This room is booked by ${cName} (${conflicting.check_in} to ${conflicting.check_out}).`);
      return;
    }
    await from('resort_ops_bookings').update({
      guest_id: editingBooking.guest_id, unit_id: editingBooking.unit_id, platform: editingBooking.platform,
      check_in: editingBooking.check_in, check_out: editingBooking.check_out, adults: parseInt(editingBooking.adults) || 1,
      room_rate: parseFloat(editingBooking.room_rate) || 0, addons_total: parseFloat(editingBooking.addons_total) || 0,
      paid_amount: parseFloat(editingBooking.paid_amount) || 0, commission_applied: parseFloat(editingBooking.commission_applied) || 0,
    }).eq('id', editingBooking.id);
    setEditingBooking(null);
    invalidateAll();
    toast.success('Booking updated');
  };

  const saveExpense = async () => {
    if (!editingExpense) return;
    const err = validateExpense(editingExpense);
    if (err) { toast.error(err); return; }
    const payload = buildExpensePayload(editingExpense);
    await from('resort_ops_expenses').update(payload as any).eq('id', editingExpense.id);
    setEditingExpense(null);
    invalidateAll();
    toast.success('Expense updated');
  };

  const saveTask = async () => {
    if (!editingTask) return;
    await from('resort_ops_tasks').update({ title: editingTask.title, category: editingTask.category, due_date: editingTask.due_date, priority: editingTask.priority, description: editingTask.description || '' }).eq('id', editingTask.id);
    setEditingTask(null);
    invalidateAll();
    toast.success('Task updated');
  };

  const saveAsset = async () => {
    if (!editingAsset) return;
    await from('resort_ops_assets').update({ name: editingAsset.name, type: editingAsset.type, balance: parseFloat(editingAsset.balance) || 0 }).eq('id', editingAsset.id);
    setEditingAsset(null);
    invalidateAll();
    toast.success('Asset updated');
  };

  const savePayment = async () => {
    if (!editingPayment) return;
    await from('resort_ops_incoming_payments').update({ source: editingPayment.source, amount: parseFloat(editingPayment.amount) || 0, expected_date: editingPayment.expected_date }).eq('id', editingPayment.id);
    setEditingPayment(null);
    invalidateAll();
    toast.success('Payment updated');
  };

  const fmt = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtDec = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const today = format(new Date(), 'yyyy-MM-dd');

  const formatDateRange = () => {
    if (!dateFrom || !dateTo) return '';
    try {
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return '';
      return `${format(fromDate, 'MMM d, yyyy')} - ${format(toDate, 'MMM d, yyyy')}`;
    } catch {
      return '';
    }
  };

  const EditBtn = ({ onClick }: { onClick: () => void }) => (
    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary flex-shrink-0" onClick={onClick}><Pencil className="w-3.5 h-3.5" /></Button>
  );
  const DelBtn = ({ onClick }: { onClick: () => void }) => (
    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={onClick}><Trash2 className="w-3.5 h-3.5" /></Button>
  );
  const SaveCancelBtns = ({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) => (
    <div className="flex gap-1">
      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-400 hover:text-green-300 flex-shrink-0" onClick={onSave}><Check className="w-3.5 h-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={onCancel}><X className="w-3.5 h-3.5" /></Button>
    </div>
  );

  const handleScanReceipt = async (file: File, data: typeof EMPTY_EXPENSE, onChange: (d: typeof EMPTY_EXPENSE) => void) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    setScanningReceipt(true);
    setScannedFields(new Set());

    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const storagePath = `receipts/${year}/${month}/${safeName}`;
      
      toast.loading('Uploading & scanning receipt...', { id: 'receipt-scan' });
      
      const { error: uploadError } = await supabase.storage.from('receipts').upload(storagePath, file);
      if (uploadError) { toast.error(`Upload failed: ${uploadError.message}`, { id: 'receipt-scan' }); return; }
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(storagePath);

      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data: scanResult, error: fnError } = await supabase.functions.invoke('scan-receipt', {
        body: { image_base64: base64 },
      });

      if (fnError) { toast.error(`Scan failed: ${fnError.message}`, { id: 'receipt-scan' }); return; }
      if (!scanResult?.success) { toast.error(scanResult?.error || 'Could not read receipt', { id: 'receipt-scan' }); return; }

      const d = scanResult.data;
      const filledFields = new Set<string>();
      const updated = { ...data, image_url: urlData.publicUrl };

      if (d.supplier_name) { updated.name = d.supplier_name; filledFields.add('name'); }
      if (d.supplier_tin) { updated.supplier_tin = d.supplier_tin; filledFields.add('supplier_tin'); }
      if (d.vat_status && ['VAT', 'Non-VAT', 'VAT-Exempt', 'Zero-Rated'].includes(d.vat_status)) {
        updated.vat_status = d.vat_status; filledFields.add('vat_status');
      }
      if (d.supplier_tin && !d.vat_status) { updated.vat_status = 'VAT'; filledFields.add('vat_status'); }
      if (d.invoice_number) { updated.invoice_number = d.invoice_number; filledFields.add('invoice_number'); }
      if (d.official_receipt_number) { updated.official_receipt_number = d.official_receipt_number; filledFields.add('official_receipt_number'); }
      if (d.date) { updated.expense_date = d.date; filledFields.add('expense_date'); }
      if (d.total_amount != null) { updated.amount = String(d.total_amount); filledFields.add('amount'); }
      if (d.description) { updated.description = d.description; filledFields.add('description'); }

      if (updated.vat_status === 'VAT' && d.total_amount && !d.vat_amount) {
        const vatAmt = d.total_amount / 1.12 * 0.12;
        updated.notes = (updated.notes ? updated.notes + '\n' : '') + `Auto-computed VAT: ₱${vatAmt.toFixed(2)} from total ₱${d.total_amount}`;
      }

      if (d.vatable_sale != null && d.vat_amount != null && d.total_amount != null) {
        const sum = (d.vatable_sale || 0) + (d.vat_amount || 0);
        if (Math.abs(sum - d.total_amount) > 1) {
          toast.warning(`VAT breakdown (₱${sum.toFixed(2)}) doesn't match total (₱${d.total_amount}). Please verify.`, { duration: 6000 });
        }
      }

      onChange(updated);
      setScannedFields(filledFields);
      toast.success(`Receipt scanned! ${filledFields.size} fields extracted (${d.confidence || 'unknown'} confidence). Please review before saving.`, { id: 'receipt-scan', duration: 5000 });
    } catch (err: any) {
      console.error('Scan error:', err);
      toast.error('Failed to scan receipt. Try a clearer image.', { id: 'receipt-scan' });
    } finally {
      setScanningReceipt(false);
    }
  };

  const renderExpenseFormFields = (data: typeof EMPTY_EXPENSE, onChange: (d: typeof EMPTY_EXPENSE) => void) => (
    <ExpenseFormFields data={data} onChange={onChange} scannedFields={scannedFields} scanningReceipt={scanningReceipt} onScanReceipt={(file) => handleScanReceipt(file, data, onChange)} />
  );

  const inputCls = "bg-secondary border-border text-foreground font-body text-sm";

  const platformColor = (p: string) => {
    const lp = p?.toLowerCase() || '';
    if (lp.includes('airbnb')) return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
    if (lp.includes('booking')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    if (lp.includes('direct')) return 'bg-green-500/20 text-green-300 border-green-500/30';
    if (lp.includes('website')) return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    if (lp.includes('agoda')) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    return 'bg-secondary text-foreground';
  };

  const getBookingStatus = (b: any) => {
    if (today >= b.check_in && today < b.check_out) return 'STAYING';
    if (today === b.check_in) return 'ARRIVING';
    if (today === b.check_out) return 'DEPARTING';
    if (today > b.check_out) return 'PAST';
    return 'UPCOMING';
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Date Range Selector */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display text-lg tracking-wider text-foreground">Resort Ops</h2>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant={datePreset === 'ytd' ? 'default' : 'outline'}
              onClick={setYTD}
              className="text-xs h-8"
            >
              YTD
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={setCurrentMonth}
              className="text-xs h-8"
            >
              This Month
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={setLastMonth}
              className="text-xs h-8"
            >
              Last Month
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="font-body text-xs text-muted-foreground">From:</label>
          <Input 
            type="date" 
            value={dateFrom} 
            onChange={(e) => {
              setDateFrom(e.target.value);
              setDatePreset('custom');
            }}
            className="w-36 h-8 text-sm"
          />
          <label className="font-body text-xs text-muted-foreground">To:</label>
          <Input 
            type="date" 
            value={dateTo} 
            onChange={(e) => {
              setDateTo(e.target.value);
              setDatePreset('custom');
            }}
            className="w-36 h-8 text-sm"
          />
          <span className="font-body text-xs text-muted-foreground ml-2">
            {formatDateRange()}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Room Revenue', value: revenue, color: 'text-green-400' },
          { label: 'Food Revenue', value: foodRevenue, color: 'text-blue-400' },
          { label: 'Expenses', value: totalExpenses, color: 'text-red-400' },
          { label: 'Net Profit', value: netProfit, color: netProfit >= 0 ? 'text-green-400' : 'text-red-400' },
        ].map(k => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="p-3">
              <p className="font-body text-xs text-muted-foreground">{k.label}</p>
              <p className={`font-display text-lg ${k.color}`}>₱{fmt(k.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Food Cost', value: foodCost },
          { label: 'Food Profit', value: foodProfit },
          { label: 'Total Revenue', value: totalRevenue },
          { label: 'Margin', value: margin, isMgn: true },
        ].map(k => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="p-3">
              <p className="font-body text-xs text-muted-foreground">{k.label}</p>
              <p className="font-display text-lg text-foreground">{k.isMgn ? `${margin.toFixed(1)}%` : `₱${fmt(k.value)}`}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Monthly P&L Report ── */}
      <ResortOpsPnLReport
        monthBookings={monthBookings}
        orders={orders}
        monthExpenses={monthExpenses}
        menuItems={menuItems}
      />

      {/* ── Units ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Units / Rooms</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            {units.map((u: any) =>
              editingUnit?.id === u.id ? (
                <div key={u.id} className="flex items-center gap-2 p-2 rounded border border-primary/50">
                  <Input value={editingUnit.name} onChange={e => setEditingUnit((p: any) => ({...p, name: e.target.value}))} className={`${inputCls} flex-1`} />
                  <Input value={editingUnit.type} onChange={e => setEditingUnit((p: any) => ({...p, type: e.target.value}))} placeholder="Type" className={`${inputCls} w-24`} />
                  <Input value={editingUnit.base_price} onChange={e => setEditingUnit((p: any) => ({...p, base_price: e.target.value}))} type="number" placeholder="Price/night" className={`${inputCls} w-24`} />
                  <Input value={editingUnit.capacity} onChange={e => setEditingUnit((p: any) => ({...p, capacity: e.target.value}))} type="number" placeholder="Cap" className={`${inputCls} w-16`} />
                  <SaveCancelBtns onSave={saveUnit} onCancel={() => setEditingUnit(null)} />
                </div>
              ) : (
                <div key={u.id} className="flex items-center justify-between py-2 px-2 border-b border-border">
                  <div className="flex-1">
                    <p className="font-body text-sm text-foreground">{u.name} <span className="text-muted-foreground text-xs">({u.type})</span></p>
                    <p className="font-body text-xs text-muted-foreground">₱{fmt(Number(u.base_price))}/night · {u.capacity} pax</p>
                  </div>
                  <div className="flex gap-1">
                    <EditBtn onClick={() => setEditingUnit({ ...u, base_price: String(u.base_price), capacity: String(u.capacity) })} />
                    <DelBtn onClick={() => deleteRow('resort_ops_units', u.id)} />
                  </div>
                </div>
              )
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Unit name" value={newUnit.name} onChange={e => setNewUnit(p => ({...p, name: e.target.value}))} className={inputCls} />
            <Input placeholder="Type" value={newUnit.type} onChange={e => setNewUnit(p => ({...p, type: e.target.value}))} className={inputCls} />
            <Input placeholder="Price/night" type="number" value={newUnit.base_price} onChange={e => setNewUnit(p => ({...p, base_price: e.target.value}))} className={inputCls} />
            <Input placeholder="Capacity" type="number" value={newUnit.capacity} onChange={e => setNewUnit(p => ({...p, capacity: e.target.value}))} className={inputCls} />
          </div>
          <Button size="sm" onClick={addUnit} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Unit</Button>
        </CardContent>
      </Card>

      {/* ── Reservations Ledger ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="font-display text-sm tracking-wider">Reservations</CardTitle>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowWebhook(true)}><Settings className="w-3.5 h-3.5 mr-1" /> Webhook</Button>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setImportOpen(true)}><Upload className="w-3.5 h-3.5 mr-1" /> Import</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(['all','staying','arriving','departing','unpaid'] as const).map(f => (
              <Button key={f} size="sm" variant={ledgerFilter === f ? 'default' : 'outline'} className="text-xs h-7 capitalize" onClick={() => setLedgerFilter(f)}>{f}</Button>
            ))}
          </div>
          <div className="space-y-2">
            {monthBookings
              .filter((b: any) => {
                if (ledgerFilter === 'all') return true;
                const status = getBookingStatus(b);
                if (ledgerFilter === 'staying') return status === 'STAYING';
                if (ledgerFilter === 'arriving') return status === 'ARRIVING';
                if (ledgerFilter === 'departing') return status === 'DEPARTING';
                if (ledgerFilter === 'unpaid') return Number(b.paid_amount) <= 0;
                return true;
              })
              .map((b: any) => {
                const status = getBookingStatus(b);
                const isPaid = Number(b.paid_amount) > 0;
                if (editingBooking?.id === b.id) {
                  return (
                    <div key={b.id} className="p-3 rounded border border-primary/50 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <Input
                            value={editGuestSearch || (editingBooking.guest_id ? (guestMap.get(editingBooking.guest_id) || '') : '')}
                            onChange={e => {
                              const val = e.target.value;
                              setEditGuestSearch(val);
                              setEditingBooking((p: any) => ({ ...p, guest_id: '' }));
                              setShowEditGuestDropdown(val.length >= 1);
                            }}
                            onFocus={() => { if ((editGuestSearch || guestMap.get(editingBooking.guest_id) || '').length >= 1) setShowEditGuestDropdown(true); }}
                            onBlur={() => setTimeout(() => setShowEditGuestDropdown(false), 200)}
                            placeholder="Guest name *"
                            className={inputCls}
                          />
                          {showEditGuestDropdown && (
                            <div className="absolute z-50 w-full mt-1 border border-border rounded-lg bg-card shadow-lg max-h-40 overflow-y-auto">
                              {guests
                                .filter((g: any) => g.full_name.toLowerCase().includes((editGuestSearch || '').toLowerCase()))
                                .slice(0, 6)
                                .map((g: any) => (
                                  <button key={g.id} type="button" onMouseDown={e => e.preventDefault()}
                                    onClick={() => {
                                      setEditingBooking((p: any) => ({ ...p, guest_id: g.id }));
                                      setEditGuestSearch(g.full_name);
                                      setShowEditGuestDropdown(false);
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-secondary transition-colors">
                                    <p className="font-body text-sm text-foreground">{g.full_name}</p>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                        <Select value={editingBooking.unit_id} onValueChange={v => setEditingBooking((p: any) => ({...p, unit_id: v}))}>
                          <SelectTrigger className={inputCls}><SelectValue placeholder="Unit" /></SelectTrigger>
                          <SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <Input value={editingBooking.platform} onChange={e => setEditingBooking((p: any) => ({...p, platform: e.target.value}))} placeholder="Platform" className={inputCls} />
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="font-body text-xs text-muted-foreground">Check-in</label><Input type="date" value={editingBooking.check_in} onChange={e => setEditingBooking((p: any) => ({...p, check_in: e.target.value}))} className={inputCls} /></div>
                        <div><label className="font-body text-xs text-muted-foreground">Check-out</label><Input type="date" value={editingBooking.check_out} onChange={e => setEditingBooking((p: any) => ({...p, check_out: e.target.value}))} className={inputCls} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={editingBooking.room_rate} onChange={e => setEditingBooking((p: any) => ({...p, room_rate: e.target.value}))} type="number" placeholder="Room rate" className={inputCls} />
                        <Input value={editingBooking.paid_amount} onChange={e => setEditingBooking((p: any) => ({...p, paid_amount: e.target.value}))} type="number" placeholder="Paid" className={inputCls} />
                      </div>
                      <div className="flex justify-end"><SaveCancelBtns onSave={saveBooking} onCancel={() => setEditingBooking(null)} /></div>
                    </div>
                  );
                }
                return (
                  <div key={b.id} className="p-3 rounded border border-border space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="font-body text-sm text-foreground font-medium">{guestMap.get(b.guest_id) || 'Unknown'}</p>
                        <Badge className={`text-[10px] font-body ${platformColor(b.platform)}`}>{b.platform || '–'}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {!isPaid && <Badge variant="destructive" className="font-body text-[10px]">DUE</Badge>}
                        {status === 'STAYING' && <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-[10px] font-body">STAYING</Badge>}
                        <EditBtn onClick={() => setEditingBooking({ ...b, room_rate: String(b.room_rate), paid_amount: String(b.paid_amount), adults: String(b.adults), addons_total: String(b.addons_total), commission_applied: String(b.commission_applied) })} />
                        <DelBtn onClick={() => deleteRow('resort_ops_bookings', b.id)} />
                      </div>
                    </div>
                    <p className="font-body text-xs text-muted-foreground">
                      {unitMap.get(b.unit_id)?.name || '–'} · {b.check_in} → {b.check_out} · {b.adults} pax
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      Rate: ₱{fmt(Number(b.room_rate))} · Paid: ₱{fmt(Number(b.paid_amount))}
                      {Number(b.commission_applied) > 0 && ` · Comm: ₱${fmt(Number(b.commission_applied))}`}
                    </p>
                    {b.notes && <p className="font-body text-xs text-muted-foreground italic">{b.notes}</p>}
                  </div>
                );
              })}
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Input
                  value={guestSearch || (newBooking.guest_id ? (guestMap.get(newBooking.guest_id) || '') : '')}
                  onChange={e => {
                    const val = e.target.value;
                    setGuestSearch(val);
                    setNewBooking(p => ({ ...p, guest_id: '', guest_name: val }));
                    setShowGuestDropdown(val.length >= 1);
                  }}
                  onFocus={() => { if (guestSearch.length >= 1) setShowGuestDropdown(true); }}
                  onBlur={() => setTimeout(() => setShowGuestDropdown(false), 200)}
                  placeholder="Guest name *"
                  className={inputCls}
                />
                {showGuestDropdown && (
                  <div className="absolute z-50 w-full mt-1 border border-border rounded-lg bg-card shadow-lg max-h-40 overflow-y-auto">
                    {guests
                      .filter((g: any) => g.full_name.toLowerCase().includes(guestSearch.toLowerCase()))
                      .slice(0, 6)
                      .map((g: any) => (
                        <button key={g.id} type="button" onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setNewBooking(p => ({ ...p, guest_id: g.id, guest_name: g.full_name }));
                            setGuestSearch(g.full_name);
                            setShowGuestDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-secondary transition-colors">
                          <p className="font-body text-sm text-foreground">{g.full_name}</p>
                        </button>
                      ))}
                    {guestSearch.trim() && !guests.some((g: any) => g.full_name.toLowerCase() === guestSearch.toLowerCase()) && (
                      <button type="button" onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setNewBooking(p => ({ ...p, guest_id: '', guest_name: guestSearch.trim() }));
                          setShowGuestDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-secondary transition-colors border-t border-border">
                        <p className="font-body text-xs text-accent">+ Add "{guestSearch.trim()}" as new guest</p>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <Select value={newBooking.unit_id} onValueChange={v => setNewBooking(p => ({...p, unit_id: v}))}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Unit" /></SelectTrigger>
                <SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Input placeholder="Platform" value={newBooking.platform} onChange={e => setNewBooking(p => ({...p, platform: e.target.value}))} className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <div><label className="font-body text-xs text-muted-foreground">Check-in</label><Input type="date" value={newBooking.check_in} onChange={e => setNewBooking(p => ({...p, check_in: e.target.value}))} className={inputCls} /></div>
              <div><label className="font-body text-xs text-muted-foreground">Check-out</label><Input type="date" value={newBooking.check_out} onChange={e => setNewBooking(p => ({...p, check_out: e.target.value}))} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Room rate" type="number" value={newBooking.room_rate} onChange={e => setNewBooking(p => ({...p, room_rate: e.target.value}))} className={inputCls} />
              <Input placeholder="Paid amount" type="number" value={newBooking.paid_amount} onChange={e => setNewBooking(p => ({...p, paid_amount: e.target.value}))} className={inputCls} />
            </div>
            <Button size="sm" onClick={addBooking} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Booking</Button>
          </div>
        </CardContent>
        <ImportReservationsModal open={importOpen} onOpenChange={setImportOpen} guests={guests} units={units} onComplete={invalidateAll} />
      </Card>

      {/* ── Occupancy Grid ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Occupancy Grid</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {occupancyData.map(({ unit, pct, unitBookings }: any) => {
            const color = pct > 90 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
            const textColor = pct > 90 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400';
            return (
              <div key={unit.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-body text-xs text-foreground">{unit.name}</span>
                  <span className={`font-body text-xs font-bold ${textColor}`}>{pct.toFixed(0)}%</span>
                </div>
                <div className="flex gap-px">
                  {daysArray.map(day => {
                    const dayStr = format(day, 'yyyy-MM-dd');
                    const isBooked = unitBookings.some((b: any) => dayStr >= b.check_in && dayStr < b.check_out);
                    return (
                      <div key={dayStr} className={`h-4 flex-1 rounded-[1px] ${isBooked ? color : 'bg-secondary'}`}
                        title={`${format(day, 'MMM d')} ${isBooked ? '● Booked' : '○ Available'}`} />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {units.length === 0 && <p className="font-body text-sm text-muted-foreground">Add units above to see occupancy</p>}
        </CardContent>
      </Card>

      {/* ── Unit Performance ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Unit Performance</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {unitPerformance.map(({ unit, projected, realized, variance, status }: any) => (
            <div key={unit.id} className="p-3 rounded border border-border space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-body text-sm text-foreground font-medium">{unit.name}</p>
                <Badge variant={status === 'HIGH' ? 'default' : status === 'ON_TRACK' ? 'secondary' : 'destructive'}
                  className="font-body text-[10px]">{status}</Badge>
              </div>
              <div className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground">Projected: <span className="text-foreground">₱{fmt(projected)}</span></span>
                <span className="text-muted-foreground">Realized: <span className="text-foreground">₱{fmt(realized)}</span></span>
              </div>
              <p className={`font-body text-xs ${variance >= 0 ? 'text-green-400' : 'text-red-400'}`}>Variance: ₱{fmt(variance)}</p>
            </div>
          ))}
          {units.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-4">No units configured</p>}
        </CardContent>
      </Card>

      {/* ── Expenses Ledger (VAT-Compliant) ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-sm tracking-wider">Expenses</CardTitle>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setExpenseReportsOpen(true)}>
                <BarChart3 className="w-3.5 h-3.5 mr-1" /> Reports
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setExpenseBulkImportOpen(true)}>
                <FileUp className="w-3.5 h-3.5 mr-1" /> Import
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'VAT', 'Non-VAT', 'VAT-Exempt', 'missing-tin'] as const).map(f => (
              <Button key={f} size="sm" variant={expenseVatFilter === f ? 'default' : 'outline'}
                className="text-xs h-7 px-2.5" onClick={() => setExpenseVatFilter(f)}>
                {f === 'all' ? 'All' : f === 'missing-tin' ? 'Missing TIN' : f}
              </Button>
            ))}
          </div>

          <Select value={expenseCategoryFilter} onValueChange={setExpenseCategoryFilter}>
            <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8 w-full">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Summary Bar */}
          {(() => {
            let filtered = monthExpenses;
            if (expenseCategoryFilter !== 'all') filtered = filtered.filter((e: any) => e.category === expenseCategoryFilter);
            if (expenseVatFilter === 'VAT') filtered = filtered.filter((e: any) => e.vat_status === 'VAT');
            else if (expenseVatFilter === 'Non-VAT') filtered = filtered.filter((e: any) => e.vat_status === 'Non-VAT');
            else if (expenseVatFilter === 'VAT-Exempt') filtered = filtered.filter((e: any) => e.vat_status === 'VAT-Exempt');
            else if (expenseVatFilter === 'missing-tin') filtered = filtered.filter((e: any) => e.vat_status === 'VAT' && !e.supplier_tin);

            const grandTotal = filtered.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
            const totalInputVat = filtered.reduce((s: number, e: any) => s + (e.vat_status === 'VAT' ? Number(e.vat_amount || 0) : 0), 0);
            const totalVatable = filtered.reduce((s: number, e: any) => s + (e.vat_status === 'VAT' ? Number(e.vatable_sale || 0) : 0), 0);
            const totalNonVat = filtered.reduce((s: number, e: any) => s + (e.vat_status === 'Non-VAT' ? Number(e.amount || 0) : 0), 0);
            return (
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-secondary border border-border">
                  <p className="font-body text-[10px] text-muted-foreground">Grand Total</p>
                  <p className="font-display text-sm text-foreground">₱{fmt(grandTotal)}</p>
                </div>
                <div className="p-2 rounded bg-secondary border border-border">
                  <p className="font-body text-[10px] text-muted-foreground">Input VAT</p>
                  <p className="font-display text-sm text-foreground">₱{fmtDec(totalInputVat)}</p>
                </div>
                <div className="p-2 rounded bg-secondary border border-border">
                  <p className="font-body text-[10px] text-muted-foreground">VATable Purchases</p>
                  <p className="font-display text-sm text-foreground">₱{fmt(totalVatable)}</p>
                </div>
                <div className="p-2 rounded bg-secondary border border-border">
                  <p className="font-body text-[10px] text-muted-foreground">Non-VAT</p>
                  <p className="font-display text-sm text-foreground">₱{fmt(totalNonVat)}</p>
                </div>
              </div>
            );
          })()}

          {/* Expense List - Consolidated by Category */}
          <div className="border border-border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary">
                  <TableHead className="font-body text-xs text-muted-foreground py-2 pl-3">Category</TableHead>
                  <TableHead className="font-body text-xs text-muted-foreground py-2">Transactions</TableHead>
                  <TableHead className="font-body text-xs text-muted-foreground py-2 text-right">Total Amount</TableHead>
                  <TableHead className="font-body text-xs text-muted-foreground py-2 text-center w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  let filtered = monthExpenses;
                  if (expenseVatFilter === 'VAT') filtered = filtered.filter((e: any) => e.vat_status === 'VAT');
                  else if (expenseVatFilter === 'Non-VAT') filtered = filtered.filter((e: any) => e.vat_status === 'Non-VAT');
                  else if (expenseVatFilter === 'VAT-Exempt') filtered = filtered.filter((e: any) => e.vat_status === 'VAT-Exempt');
                  else if (expenseVatFilter === 'missing-tin') filtered = filtered.filter((e: any) => e.vat_status === 'VAT' && !e.supplier_tin);

                  // Group by category
                  const categoryMap = new Map<string, { count: number; total: number }>();
                  
                  filtered.forEach((e: any) => {
                    const category = e.category || 'Uncategorized';
                    const existing = categoryMap.get(category);
                    const amount = Number(e.amount) || 0;
                    if (existing) {
                      existing.count++;
                      existing.total += amount;
                    } else {
                      categoryMap.set(category, { count: 1, total: amount });
                    }
                  });

                  const categories = Array.from(categoryMap.entries())
                    .map(([category, data]) => ({
                      category,
                      count: data.count,
                      total: data.total,
                    }))
                    .sort((a, b) => b.total - a.total);

                  if (categories.length === 0) {
                    return (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No expenses found for this period
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return categories.map((cat) => (
                    <TableRow key={cat.category} className="border-border hover:bg-secondary/50">
                      <TableCell className="font-body text-sm py-2 pl-3 font-medium">
                        {cat.category}
                      </TableCell>
                      <TableCell className="font-body text-sm py-2">
                        {cat.count} transaction{cat.count !== 1 ? 's' : ''}
                      </TableCell>
                      <TableCell className="font-body text-sm py-2 text-right">
                        <span className="font-mono font-medium">₱{fmt(cat.total)}</span>
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            toast.info(`${cat.category}: ${cat.count} items totaling ₱${fmt(cat.total)}`);
                          }}
                        >
                          <Info className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
          </div>

          {/* Add Expense Form */}
          {showAddExpenseForm ? (
            <div className="p-3 rounded border border-border space-y-2">
              {renderExpenseFormFields(newExpense, setNewExpense)}
              <div className="flex gap-2">
                <Button size="sm" onClick={addExpense} className="flex-1"><Check className="w-4 h-4 mr-1" /> Save</Button>
                <Button size="sm" variant="outline" onClick={() => { setShowAddExpenseForm(false); setNewExpense({ ...EMPTY_EXPENSE }); setScannedFields(new Set()); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => setShowAddExpenseForm(true)} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Expense</Button>
          )}
        </CardContent>
      </Card>
      <ExpenseReportsModal
        open={expenseReportsOpen}
        onOpenChange={setExpenseReportsOpen}
        expenses={monthExpenses}
        monthLabel={dateFrom && dateTo ? `${format(parseISO(dateFrom), 'MMM d, yyyy')} - ${format(parseISO(dateTo), 'MMM d, yyyy')}` : ''}
        onCategoryClick={(cat) => setExpenseCategoryFilter(cat)}
      />
      <ExpenseBulkImportModal
        open={expenseBulkImportOpen}
        onOpenChange={setExpenseBulkImportOpen}
        onComplete={invalidateAll}
      />

      {/* ── Tasks ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Tasks</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            {monthTasks.map((t: any) => {
              const overdue = t.status !== 'done' && isBefore(parseISO(t.due_date), new Date());
              const isCritical = t.priority === 'critical';
              if (editingTask?.id === t.id) {
                return (
                  <div key={t.id} className="p-3 rounded border border-primary/50 space-y-2">
                    <Input value={editingTask.title} onChange={e => setEditingTask((p: any) => ({...p, title: e.target.value}))} placeholder="Title" className={inputCls} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={editingTask.category} onChange={e => setEditingTask((p: any) => ({...p, category: e.target.value}))} placeholder="Category" className={inputCls} />
                      <Input type="date" value={editingTask.due_date} onChange={e => setEditingTask((p: any) => ({...p, due_date: e.target.value}))} className={inputCls} />
                    </div>
                    <Select value={editingTask.priority} onValueChange={v => setEditingTask((p: any) => ({...p, priority: v}))}>
                      <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea value={editingTask.description || ''} onChange={e => setEditingTask((p: any) => ({...p, description: e.target.value}))} placeholder="Description" className="bg-secondary border-border text-foreground font-body text-sm min-h-[60px]" />
                    <div className="flex justify-end"><SaveCancelBtns onSave={saveTask} onCancel={() => setEditingTask(null)} /></div>
                  </div>
                );
              }
              return (
                <div key={t.id} className={`flex items-center justify-between py-2 px-2 border-b border-border ${isCritical ? 'border-l-2 border-l-red-500' : ''}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={() => toggleTaskStatus(t.id, t.status)}>
                      {t.status === 'done' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <div className={`w-3 h-3 rounded-full border ${t.status === 'in_progress' ? 'border-amber-400 bg-amber-400/20' : 'border-muted-foreground'}`} />}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className={`font-body text-sm ${t.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{t.title}</p>
                      <p className="font-body text-xs text-muted-foreground">{t.category} · {t.due_date}
                        {overdue && <span className="text-red-400 ml-1">OVERDUE</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={t.priority === 'critical' ? 'destructive' : t.priority === 'high' ? 'default' : 'secondary'} className="font-body text-[10px]">{t.priority}</Badge>
                    <EditBtn onClick={() => setEditingTask({ ...t })} />
                    <DelBtn onClick={() => deleteRow('resort_ops_tasks', t.id)} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <Input placeholder="Task title" value={newTask.title} onChange={e => setNewTask(p => ({...p, title: e.target.value}))} className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Category" value={newTask.category} onChange={e => setNewTask(p => ({...p, category: e.target.value}))} className={inputCls} />
              <Input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({...p, due_date: e.target.value}))} className={inputCls} />
            </div>
            <Select value={newTask.priority} onValueChange={v => setNewTask(p => ({...p, priority: v}))}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addTask} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Task</Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Assets ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Assets & Accounts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            {assets.map((a: any) =>
              editingAsset?.id === a.id ? (
                <div key={a.id} className="flex items-center gap-2 p-2 rounded border border-primary/50">
                  <Input value={editingAsset.name} onChange={e => setEditingAsset((p: any) => ({...p, name: e.target.value}))} className={`${inputCls} flex-1`} />
                  <Input value={editingAsset.type} onChange={e => setEditingAsset((p: any) => ({...p, type: e.target.value}))} placeholder="Type" className={`${inputCls} w-24`} />
                  <Input value={editingAsset.balance} onChange={e => setEditingAsset((p: any) => ({...p, balance: e.target.value}))} type="number" placeholder="Balance" className={`${inputCls} w-28`} />
                  <SaveCancelBtns onSave={saveAsset} onCancel={() => setEditingAsset(null)} />
                </div>
              ) : (
                <div key={a.id} className="flex items-center justify-between py-2 px-2 border-b border-border">
                  <div className="flex-1">
                    <p className="font-body text-sm text-foreground">{a.name} <span className="text-muted-foreground text-xs">({a.type})</span></p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-body text-sm text-foreground">₱{fmt(Number(a.balance))}</span>
                    <EditBtn onClick={() => setEditingAsset({ ...a, balance: String(a.balance) })} />
                    <DelBtn onClick={() => deleteRow('resort_ops_assets', a.id)} />
                  </div>
                </div>
              )
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Name" value={newAsset.name} onChange={e => setNewAsset(p => ({...p, name: e.target.value}))} className={inputCls} />
            <Input placeholder="Type" value={newAsset.type} onChange={e => setNewAsset(p => ({...p, type: e.target.value}))} className={inputCls} />
            <Input placeholder="Balance" type="number" value={newAsset.balance} onChange={e => setNewAsset(p => ({...p, balance: e.target.value}))} className={inputCls} />
          </div>
          <Button size="sm" onClick={addAsset} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Asset</Button>
        </CardContent>
      </Card>

      {/* ── Incoming Payments ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="font-display text-sm tracking-wider">Incoming Payments</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            {monthPayments.map((p: any) =>
              editingPayment?.id === p.id ? (
                <div key={p.id} className="flex items-center gap-2 p-2 rounded border border-primary/50">
                  <Input value={editingPayment.source} onChange={e => setEditingPayment((pr: any) => ({...pr, source: e.target.value}))} className={`${inputCls} flex-1`} />
                  <Input value={editingPayment.amount} onChange={e => setEditingPayment((pr: any) => ({...pr, amount: e.target.value}))} type="number" className={`${inputCls} w-28`} />
                  <Input type="date" value={editingPayment.expected_date} onChange={e => setEditingPayment((pr: any) => ({...pr, expected_date: e.target.value}))} className={`${inputCls} w-36`} />
                  <SaveCancelBtns onSave={savePayment} onCancel={() => setEditingPayment(null)} />
                </div>
              ) : (
                <div key={p.id} className="flex items-center justify-between py-2 px-2 border-b border-border">
                  <div className="flex-1">
                    <p className="font-body text-sm text-foreground">{p.source}</p>
                    <p className="font-body text-xs text-muted-foreground">{p.expected_date}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-body text-sm text-foreground">₱{fmt(Number(p.amount))}</span>
                    <EditBtn onClick={() => setEditingPayment({ ...p, amount: String(p.amount) })} />
                    <DelBtn onClick={() => deleteRow('resort_ops_incoming_payments', p.id)} />
                  </div>
                </div>
              )
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Source" value={newPayment.source} onChange={e => setNewPayment(p => ({...p, source: e.target.value}))} className={inputCls} />
            <Input placeholder="Amount" type="number" value={newPayment.amount} onChange={e => setNewPayment(p => ({...p, amount: e.target.value}))} className={inputCls} />
            <Input type="date" value={newPayment.expected_date} onChange={e => setNewPayment(p => ({...p, expected_date: e.target.value}))} className={inputCls} />
          </div>
          <Button size="sm" onClick={addPayment} className="w-full"><Plus className="w-4 h-4 mr-1" /> Add Payment</Button>
        </CardContent>
      </Card>

      {showWebhook && <WebhookSettings />}
    </div>
  );
};

export default ResortOpsDashboard;
