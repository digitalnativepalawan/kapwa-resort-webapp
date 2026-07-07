import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { startOfDay, startOfWeek, startOfMonth, startOfYear, subDays, endOfDay, format } from 'date-fns';
import { DollarSign, ShoppingCart, TrendingUp, Lock, Download, Upload, CalendarIcon, Percent, PiggyBank, Receipt, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import AccountingExport from './AccountingExport';
import { cn } from '@/lib/utils';
import { LuxuryCard, LuxuryStatCard, LuxurySection } from '@/components/luxury';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

const TYPE_LABELS: Record<string, string> = {
  Room: 'Room Delivery',
  DineIn: 'Dine In',
  Beach: 'Beach Delivery',
  WalkIn: 'Walk-In Guest',
};

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'ytd' | 'custom';

const ReportsDashboard = ({ readOnly = false }: { readOnly?: boolean }) => {
  const [range, setRange] = useState<DateRange>('today');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [tabTypeFilter, setTabTypeFilter] = useState<string>('all');
  const [expandedTabId, setExpandedTabId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    switch (range) {
      case 'today':
        return { dateFrom: startOfDay(now).toISOString(), dateTo: endOfDay(now).toISOString() };
      case 'yesterday': {
        const y = subDays(now, 1);
        return { dateFrom: startOfDay(y).toISOString(), dateTo: endOfDay(y).toISOString() };
      }
      case 'week':
        return { dateFrom: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), dateTo: endOfDay(now).toISOString() };
      case 'month':
        return { dateFrom: startOfMonth(now).toISOString(), dateTo: endOfDay(now).toISOString() };
      case 'ytd':
        return { dateFrom: startOfYear(now).toISOString(), dateTo: endOfDay(now).toISOString() };
      case 'custom':
        return {
          dateFrom: customFrom ? startOfDay(customFrom).toISOString() : '2000-01-01T00:00:00Z',
          dateTo: customTo ? endOfDay(customTo).toISOString() : endOfDay(now).toISOString(),
        };
      default:
        return { dateFrom: startOfDay(now).toISOString(), dateTo: endOfDay(now).toISOString() };
    }
  }, [range, customFrom, customTo]);

  // Fetch completed orders
  const { data: orders = [] } = useQuery({
    queryKey: ['reports-orders', dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Fetch closed tabs for the selected period
  const { data: closedTabs = [] } = useQuery({
    queryKey: ['reports-closed-tabs', dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await supabase
        .from('tabs')
        .select('*')
        .eq('status', 'Closed')
        .gte('closed_at', dateFrom)
        .lte('closed_at', dateTo)
        .order('closed_at', { ascending: false });
      return data || [];
    },
  });

  // Fetch orders for closed tabs
  const tabIds = closedTabs.map(t => t.id);
  const { data: tabOrders = [] } = useQuery({
    queryKey: ['reports-tab-orders', tabIds],
    queryFn: async () => {
      if (tabIds.length === 0) return [];
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('tab_id', tabIds)
        .order('created_at', { ascending: true });
      return data || [];
    },
    enabled: tabIds.length > 0,
  });

  const tabOrdersMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    tabOrders.forEach(o => {
      if (o.tab_id) {
        if (!map[o.tab_id]) map[o.tab_id] = [];
        map[o.tab_id].push(o);
      }
    });
    return map;
  }, [tabOrders]);

  const filteredTabs = useMemo(() => {
    if (tabTypeFilter === 'all') return closedTabs;
    return closedTabs.filter(t => t.location_type === tabTypeFilter);
  }, [closedTabs, tabTypeFilter]);

  const tabLocationTypes = useMemo(() => {
    const types = new Set(closedTabs.map(t => t.location_type));
    return Array.from(types).sort();
  }, [closedTabs]);

  // Fetch menu items for food cost lookup
  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-items-cost'],
    queryFn: async () => {
      const { data } = await supabase.from('menu_items').select('name, food_cost');
      return data || [];
    },
  });

  // Fetch historical F&B revenue data filtered by selected date range
  const histDateFrom = dateFrom.slice(0, 10);
  const histDateTo = dateTo.slice(0, 10);
  const { data: histRevenue = [], isLoading: histLoading } = useQuery({
    queryKey: ['historical-revenue', histDateFrom, histDateTo],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('historical_revenue')
        .select('*')
        .gte('date', histDateFrom)
        .lte('date', histDateTo)
        .order('date', { ascending: true })
        .limit(5000);
      if (error) {
        console.error('historical_revenue query error:', error);
        return [] as any[];
      }
      return (data || []) as any[];
    },
  });

  const histStats = useMemo(() => {
    const totalRevenue = histRevenue.reduce((s, r) => s + (r.revenue || 0), 0);
    const totalQty = histRevenue.reduce((s, r) => s + (r.qty || 0), 0);
    const monthMap: Record<string, number> = {};
    histRevenue.forEach(r => {
      const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] || 0) + (r.revenue || 0);
    });
    const monthlyData = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => {
        const [y, m] = month.split('-');
        const label = format(new Date(Number(y), Number(m) - 1), 'MMM yyyy');
        return { month: label, revenue };
      });
    const catMap: Record<string, number> = {};
    histRevenue.forEach(r => {
      const cat = r.category || 'Other';
      catMap[cat] = (catMap[cat] || 0) + (r.revenue || 0);
    });
    const categoryData = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([category, revenue]) => ({ category, revenue }));
    const payMap: Record<string, number> = {};
    histRevenue.forEach(r => {
      const pm = r.payment_method || 'Unknown';
      payMap[pm] = (payMap[pm] || 0) + (r.revenue || 0);
    });
    const paymentData = Object.entries(payMap)
      .sort((a, b) => b[1] - a[1])
      .map(([method, revenue]) => ({ method, revenue }));
    return { totalRevenue, totalQty, monthlyData, categoryData, paymentData };
  }, [histRevenue]);

  const costMap = useMemo(() => {
    const map: Record<string, number> = {};
    menuItems.forEach(m => { map[m.name] = m.food_cost || 0; });
    return map;
  }, [menuItems]);

  const stats = useMemo(() => {
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const count = orders.length;
    const avg = count ? revenue / count : 0;
    const byType: Record<string, number> = {};
    orders.forEach(o => {
      byType[o.order_type] = (byType[o.order_type] || 0) + (o.total || 0);
    });
    const itemMap: Record<string, { qty: number; revenue: number; foodCost: number }> = {};
    orders.forEach(o => {
      ((o.items as any[]) || []).forEach((i: any) => {
        const qty = i.qty || 1;
        const price = i.price || 0;
        const fc = costMap[i.name] || 0;
        if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, revenue: 0, foodCost: 0 };
        itemMap[i.name].qty += qty;
        itemMap[i.name].revenue += price * qty;
        itemMap[i.name].foodCost += fc * qty;
      });
    });
    const itemBreakdown = Object.entries(itemMap)
      .map(([name, d]) => ({
        name,
        qty: d.qty,
        revenue: d.revenue,
        foodCost: d.foodCost,
        profit: d.revenue - d.foodCost,
        margin: d.revenue > 0 ? ((d.revenue - d.foodCost) / d.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    const totalFoodCost = itemBreakdown.reduce((s, i) => s + i.foodCost, 0);
    const totalProfit = revenue - totalFoodCost;
    const marginPct = revenue > 0 ? (totalProfit / revenue) * 100 : 0;
    const totalServiceCharge = orders.reduce((s, o) => s + (o.service_charge || 0), 0);
    return { revenue, count, avg, byType, itemBreakdown, totalFoodCost, totalProfit, marginPct, totalServiceCharge };
  }, [orders, costMap]);

  const ranges: { key: DateRange; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'ytd', label: 'YTD' },
    { key: 'custom', label: 'Custom' },
  ];

  const generateCSV = () => {
    const periodLabel = range === 'custom'
      ? `${customFrom ? format(customFrom, 'yyyy-MM-dd') : 'start'}_to_${customTo ? format(customTo, 'yyyy-MM-dd') : 'now'}`
      : range;
    let csv = '';
    csv += 'REPORT SUMMARY\n';
    csv += `Period,${periodLabel}\n`;
    csv += `Total Revenue,${stats.revenue.toFixed(2)}\n`;
    csv += `Total Food Cost,${stats.totalFoodCost.toFixed(2)}\n`;
    csv += `Total Profit,${stats.totalProfit.toFixed(2)}\n`;
    csv += `Margin %,${stats.marginPct.toFixed(1)}%\n`;
    csv += `Total Service Charge,${stats.totalServiceCharge.toFixed(2)}\n`;
    csv += `Total Orders,${stats.count}\n`;
    csv += '\n';
    csv += 'ITEM BREAKDOWN\n';
    csv += 'Item,Qty Sold,Revenue,Food Cost,Profit,Margin %\n';
    stats.itemBreakdown.forEach(i => {
      csv += `"${i.name}",${i.qty},${i.revenue.toFixed(2)},${i.foodCost.toFixed(2)},${i.profit.toFixed(2)},${i.margin.toFixed(1)}%\n`;
    });
    csv += '\n';
    csv += 'TRANSACTIONS\n';
    csv += 'Order ID,Date/Time,Order Type,Location,Items,Subtotal,Service Charge,Total,Payment Type,Status\n';
    orders.forEach(o => {
      const items = ((o.items as any[]) || [])
        .map((i: any) => `${i.name} x${i.qty || 1} @${i.price || 0}`)
        .join('; ');
      const subtotal = (o.total || 0) - (o.service_charge || 0);
      const dateStr = o.created_at ? format(new Date(o.created_at), 'yyyy-MM-dd HH:mm') : '';
      csv += `"${o.id}","${dateStr}","${o.order_type}","${o.location_detail || ''}","${items}",${subtotal.toFixed(2)},${(o.service_charge || 0).toFixed(2)},${(o.total || 0).toFixed(2)},"${o.payment_type || ''}","${o.status}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${format(new Date(), 'yyyy-MM-dd')}-${periodLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let inQuote = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => {
      toast.error('Failed to read CSV file');
    };
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/);
      let headerIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === 'TRANSACTIONS') {
          headerIdx = i + 1;
          break;
        }
      }
      if (headerIdx === -1) {
        toast.error('No TRANSACTIONS section found in CSV');
        e.target.value = '';
        return;
      }
      const KNOWN_SECTIONS = new Set(['REPORT SUMMARY', 'ITEM BREAKDOWN', 'TRANSACTIONS']);
      const dataLines = lines
        .slice(headerIdx + 1)
        .filter(l => l.trim() !== '' && !KNOWN_SECTIONS.has(l.trim()));
      const rows: Record<string, unknown>[] = [];
      for (const line of dataLines) {
        const cols = parseCSVLine(line);
        if (cols.length < 10) continue;
        const dateTime = cols[1];
        const orderType = cols[2];
        const location = cols[3];
        const itemsStr = cols[4];
        const serviceChargeStr = cols[6];
        const totalStr = cols[7];
        const paymentType = cols[8];
        const status = cols[9];
        const items = itemsStr
          .split('; ')
          .map(part => {
            const match = part.match(/^(.+) x(\d+) @([\d.]+)$/);
            if (match) return { name: match[1], qty: parseInt(match[2], 10), price: parseFloat(match[3]) };
            return part.trim() ? { name: part.trim(), qty: 1, price: 0 } : null;
          })
          .filter(Boolean);
        let createdAt: string | null = null;
        if (dateTime) {
          const parsed = new Date(dateTime);
          createdAt = isNaN(parsed.getTime()) ? null : parsed.toISOString();
        }
        rows.push({
          order_type: orderType || 'WalkIn',
          location_detail: location || '',
          items,
          total: parseFloat(totalStr) || 0,
          service_charge: parseFloat(serviceChargeStr) || 0,
          payment_type: paymentType || '',
          status: status?.trim() || 'closed',
          created_at: createdAt,
        });
      }
      if (rows.length === 0) {
        toast.error('No valid transaction rows found in CSV');
        e.target.value = '';
        return;
      }
      setIsImporting(true);
      try {
        const { error } = await supabase.from('orders').insert(rows as any);
        if (error) throw error;
        toast.success(`${rows.length} transaction${rows.length !== 1 ? 's' : ''} imported successfully`);
      } catch (err: any) {
        toast.error(`Import failed: ${err.message}`);
      } finally {
        setIsImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {ranges.map(r => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              'flex-1 min-w-[68px] min-h-[40px] px-3 rounded-xl border font-display text-[11px] tracking-[0.18em] uppercase transition-all',
              range === r.key
                ? 'bg-gradient-gold text-background border-gold/60 luxury-glow-gold'
                : 'border-border/60 bg-card/40 backdrop-blur-sm text-muted-foreground hover:border-gold/40 hover:text-foreground',
            )}
          >
            {r.label}
          </button>
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
        <Button size="sm" variant="outline" onClick={generateCSV} className="font-body text-xs flex-1">
          <Download className="w-4 h-4 mr-1" /> Download CSV Report
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => csvImportRef.current?.click()}
          disabled={isImporting}
          className="font-body text-xs flex-1"
        >
          <Upload className="w-4 h-4 mr-1" /> {isImporting ? 'Importing…' : 'Import CSV'}
        </Button>
        <input
          ref={csvImportRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleImportCSV}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <LuxuryStatCard
          icon={<DollarSign className="w-4 h-4" />}
          tone="gold"
          label="Revenue"
          value={`₱${stats.revenue.toLocaleString()}`}
        />
        <LuxuryStatCard
          icon={<ShoppingCart className="w-4 h-4" />}
          tone="rose"
          label="Food Cost"
          value={`₱${stats.totalFoodCost.toLocaleString()}`}
        />
        <LuxuryStatCard
          icon={<PiggyBank className="w-4 h-4" />}
          tone="emerald"
          label="Profit"
          value={`₱${stats.totalProfit.toLocaleString()}`}
        />
        <LuxuryStatCard
          icon={<Percent className="w-4 h-4" />}
          tone="teal"
          label="Margin"
          value={`${stats.marginPct.toFixed(1)}%`}
        />
      </div>

      <LuxuryStatCard
        icon={<Receipt className="w-4 h-4" />}
        tone="gold"
        label="Service Charge (Payroll)"
        value={`₱${stats.totalServiceCharge.toLocaleString()}`}
      />

      <div className="grid grid-cols-2 gap-3">
        <LuxuryStatCard tone="neutral" label="Orders" value={stats.count} />
        <LuxuryStatCard tone="neutral" label="Avg Order" value={`₱${stats.avg.toFixed(0)}`} />
      </div>

      {Object.keys(stats.byType).length > 0 && (
        <section>
          <h3 className="font-display text-sm tracking-wider text-foreground mb-3">Revenue by Order Type</h3>
          <div className="space-y-2">
            {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, rev]) => (
              <div key={type} className="flex justify-between items-center p-2 border border-border rounded">
                <span className="font-body text-sm text-foreground">{type}</span>
                <span className="font-display text-sm text-gold">₱{rev.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats.itemBreakdown.length > 0 && (
        <section>
          <h3 className="font-display text-sm tracking-wider text-foreground mb-3">Item Profit Breakdown</h3>
          <div className="space-y-2">
            {stats.itemBreakdown.map(item => (
              <div key={item.name} className="border border-border rounded-lg p-3 space-y-1.5">
                <p className="font-display text-sm text-foreground">{item.name}</p>
                <div className="flex justify-between font-body text-xs text-cream-dim">
                  <span>Qty: {item.qty}</span>
                  <span>Revenue: ₱{item.revenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-body text-xs text-cream-dim">
                  <span>Cost: ₱{item.foodCost.toLocaleString()}</span>
                  <span>Profit: <span className="text-foreground">₱{item.profit.toLocaleString()}</span></span>
                  <span>Margin: <span className="text-gold">{item.margin.toFixed(1)}%</span></span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm tracking-wider text-foreground flex items-center gap-2">
            <Receipt className="w-4 h-4 text-gold" />
            Closed Tabs ({filteredTabs.length})
          </h3>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Button
            size="sm"
            variant={tabTypeFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setTabTypeFilter('all')}
            className="font-body text-[11px] h-7 px-2"
          >
            All
          </Button>
          {['Room', 'DineIn', 'Beach', 'WalkIn'].map(type => (
            <Button
              key={type}
              size="sm"
              variant={tabTypeFilter === type ? 'default' : 'outline'}
              onClick={() => setTabTypeFilter(type)}
              className="font-body text-[11px] h-7 px-2"
            >
              {TYPE_LABELS[type] || type}
            </Button>
          ))}
        </div>
        {filteredTabs.length === 0 ? (
          <p className="font-body text-xs text-cream-dim text-center py-4">No closed tabs for this period.</p>
        ) : (
          <div className="space-y-2">
            {filteredTabs.map(tab => {
              const orders = tabOrdersMap[tab.id] || [];
              const tabTotal = orders.reduce((s, o) => s + (o.total || 0), 0);
              const tabSC = orders.reduce((s, o) => s + (o.service_charge || 0), 0);
              const isExpanded = expandedTabId === tab.id;
              return (
                <div key={tab.id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedTabId(isExpanded ? null : tab.id)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-xs tracking-wider text-foreground">
                          {TYPE_LABELS[tab.location_type] || tab.location_type}
                        </span>
                        <Badge variant="outline" className="font-body text-[10px]">
                          {tab.location_detail}
                        </Badge>
                        {tab.guest_name && (
                          <span className="font-body text-[10px] text-cream-dim">({tab.guest_name})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-body text-[10px] text-cream-dim">
                          {tab.closed_at ? format(new Date(tab.closed_at), 'MMM d, h:mm a') : ''}
                        </span>
                        {tab.payment_method && (
                          <Badge variant="outline" className="font-body text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-400/30">
                            {tab.payment_method}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm text-gold">₱{(tabTotal + tabSC).toLocaleString()}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-cream-dim" /> : <ChevronDown className="w-4 h-4 text-cream-dim" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border p-3 bg-secondary/10 space-y-3">
                      {orders.length === 0 ? (
                        <p className="font-body text-xs text-cream-dim">No orders found.</p>
                      ) : (
                        orders.map((order, idx) => {
                          const items = (Array.isArray(order.items) ? order.items : []) as any[];
                          return (
                            <div key={order.id} className="space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="font-display text-[11px] text-cream-dim tracking-wider">
                                  Order #{idx + 1}
                                </span>
                                <span className="font-body text-[10px] text-cream-dim">
                                  {format(new Date(order.created_at), 'MMM d, h:mm a')}
                                </span>
                              </div>
                              {items.map((item: any, i: number) => (
                                <div key={i} className="flex justify-between font-body text-xs">
                                  <span className="text-foreground">{item.qty}× {item.name}</span>
                                  <span className="text-cream-dim">₱{((item.price || 0) * (item.qty || 1)).toLocaleString()}</span>
                                </div>
                              ))}
                              <div className="flex justify-between font-body text-[10px] text-cream-dim pt-1 border-t border-border/30">
                                <span>Subtotal: ₱{Number(order.total || 0).toLocaleString()}</span>
                                <span>SC: ₱{Number(order.service_charge || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div className="border-t border-border pt-2 flex justify-between font-display text-sm">
                        <span className="text-foreground">Tab Total</span>
                        <span className="text-gold">₱{(tabTotal + tabSC).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <AccountingExport />
    </div>
  );
};

export default ReportsDashboard;
