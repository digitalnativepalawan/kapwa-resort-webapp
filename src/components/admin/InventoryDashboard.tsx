import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, AlertTriangle, Download, Package, UtensilsCrossed, BarChart3, Calendar, ArrowRightLeft, Zap, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { format, subDays, differenceInDays } from 'date-fns';
import { Label } from '@/components/ui/label';

const UNITS = ['grams', 'ml', 'pcs', 'kg', 'liters', 'bottles', 'cans', 'slices'];
const DEPARTMENTS = ['kitchen', 'bar', 'gardens', 'housekeeping'] as const;
type Department = typeof DEPARTMENTS[number];

const DEPT_LABELS: Record<string, string> = {
  kitchen: '🍳 Kitchen',
  bar: '🍸 Bar',
  gardens: '🌿 Gardens',
  housekeeping: '🏨 Housekeeping',
};

const BUFFER_DAYS_DEFAULT = 3;

interface BurnInfo {
  dailyRate: number;
  daysRemaining: number | null; // null = no consumption data
  suggestedThreshold: number;
  reorderQty: number;
}

const InventoryDashboard = ({ readOnly = false }: { readOnly?: boolean }) => {
  const qc = useQueryClient();
  const [selectedDept, setSelectedDept] = useState<Department | 'all'>('all');

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const { data } = await supabase.from('ingredients').select('*').order('name');
      return data || [];
    },
  });

  const { data: recipeLinks = [] } = useQuery({
    queryKey: ['recipe_ingredients_with_menu'],
    queryFn: async () => {
      const { data } = await supabase
        .from('recipe_ingredients')
        .select('ingredient_id, menu_item_id, quantity, menu_items(name)');
      return data || [];
    },
  });

  // Fetch 14 days of consumption for burn rate calculation
  const { data: burnLogs = [] } = useQuery({
    queryKey: ['burn-rate-logs'],
    queryFn: async () => {
      const since = subDays(new Date(), 14).toISOString();
      const { data } = await supabase
        .from('inventory_logs')
        .select('ingredient_id, change_qty, created_at')
        .eq('reason', 'order_deduction')
        .gte('created_at', since);
      return data || [];
    },
  });

  const [logDays, setLogDays] = useState(7);
  const { data: consumptionLogs = [] } = useQuery({
    queryKey: ['consumption-logs', logDays],
    queryFn: async () => {
      const since = subDays(new Date(), logDays).toISOString();
      const { data } = await supabase
        .from('inventory_logs')
        .select('*, ingredients(name, unit, department)')
        .eq('reason', 'order_deduction')
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Calculate burn rates per ingredient from 14-day window
  const burnMap = useMemo(() => {
    const map: Record<string, BurnInfo> = {};
    if (burnLogs.length === 0) return map;

    // Find actual date range of logs
    const dates = burnLogs.map((l: any) => new Date(l.created_at));
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    const now = new Date();
    const daySpan = Math.max(1, differenceInDays(now, earliest));

    // Aggregate total consumption per ingredient
    const totals: Record<string, number> = {};
    burnLogs.forEach((l: any) => {
      const id = l.ingredient_id;
      totals[id] = (totals[id] || 0) + Math.abs(l.change_qty);
    });

    for (const [id, totalUsed] of Object.entries(totals)) {
      const dailyRate = totalUsed / daySpan;
      const ing = ingredients.find((i: any) => i.id === id);
      const currentStock = ing ? (ing as any).current_stock : 0;
      const daysRemaining = dailyRate > 0 ? currentStock / dailyRate : null;
      const suggestedThreshold = Math.ceil(dailyRate * BUFFER_DAYS_DEFAULT);
      const reorderQty = Math.max(0, Math.ceil((BUFFER_DAYS_DEFAULT * dailyRate) - currentStock));

      map[id] = { dailyRate, daysRemaining, suggestedThreshold, reorderQty };
    }

    return map;
  }, [burnLogs, ingredients]);

  // Build usage map
  const usageMap: Record<string, { dishName: string; quantity: number }[]> = {};
  recipeLinks.forEach((rl: any) => {
    const dishName = rl.menu_items?.name || 'Unknown';
    if (!usageMap[rl.ingredient_id]) usageMap[rl.ingredient_id] = [];
    usageMap[rl.ingredient_id].push({ dishName, quantity: rl.quantity });
  });

  // Filter by department
  const deptIngredients = selectedDept === 'all'
    ? ingredients
    : ingredients.filter((i: any) => i.department === selectedDept);

  // Dashboard stats (department-scoped)
  const totalValue = deptIngredients.reduce((sum: number, i: any) => sum + (i.current_stock * i.cost_per_unit), 0);
  const missingCostCount = deptIngredients.filter((i: any) => i.cost_per_unit === 0).length;
  const outOfStockCount = deptIngredients.filter((i: any) => i.current_stock <= 0).length;

  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [editIng, setEditIng] = useState<any>(null);
  const [form, setForm] = useState({ name: '', unit: 'grams', cost_per_unit: '', current_stock: '', low_stock_threshold: '', department: 'kitchen' as Department });

  // Transfer state
  const [showTransfer, setShowTransfer] = useState(false);
  const [transfer, setTransfer] = useState({ fromDept: '' as string, toDept: '' as string, ingredientId: '', quantity: '', reason: '' });

  // Auto-threshold state
  const [bufferDays, setBufferDays] = useState(BUFFER_DAYS_DEFAULT);

  const openNew = () => {
    setEditIng('new');
    setForm({ name: '', unit: 'grams', cost_per_unit: '', current_stock: '', low_stock_threshold: '', department: (selectedDept === 'all' ? 'kitchen' : selectedDept) as Department });
  };

  const openEdit = (ing: any) => {
    setEditIng(ing);
    setForm({
      name: ing.name,
      unit: ing.unit,
      cost_per_unit: String(ing.cost_per_unit),
      current_stock: String(ing.current_stock),
      low_stock_threshold: String(ing.low_stock_threshold),
      department: ing.department || 'kitchen',
    });
  };

  const save = async () => {
    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      cost_per_unit: parseFloat(form.cost_per_unit) || 0,
      current_stock: parseFloat(form.current_stock) || 0,
      low_stock_threshold: parseFloat(form.low_stock_threshold) || 0,
      department: form.department,
    };
    if (!payload.name) return;

    if (editIng === 'new') {
      await supabase.from('ingredients').insert(payload);
    } else {
      const oldStock = editIng.current_stock;
      if (payload.current_stock !== oldStock) {
        await supabase.from('inventory_logs').insert({
          ingredient_id: editIng.id,
          change_qty: payload.current_stock - oldStock,
          reason: 'manual_adjustment',
          department: payload.department,
        });
      }
      await supabase.from('ingredients').update(payload).eq('id', editIng.id);
    }
    setEditIng(null);
    qc.invalidateQueries({ queryKey: ['ingredients'] });
    toast.success('Ingredient saved');
  };

  const deleteIng = async (id: string) => {
    await supabase.from('ingredients').delete().eq('id', id);
    setEditIng(null);
    qc.invalidateQueries({ queryKey: ['ingredients'] });
    toast.success('Ingredient deleted');
  };

  // Smart low stock: use consumption-based "days remaining" when available, fall back to static threshold
  const getUrgency = (ing: any): { level: 'critical' | 'warning' | 'ok'; daysLeft: number | null; dailyRate: number } => {
    const burn = burnMap[ing.id];
    if (burn && burn.daysRemaining !== null) {
      if (ing.current_stock <= 0) return { level: 'critical', daysLeft: 0, dailyRate: burn.dailyRate };
      if (burn.daysRemaining < 2) return { level: 'critical', daysLeft: burn.daysRemaining, dailyRate: burn.dailyRate };
      if (burn.daysRemaining < 5) return { level: 'warning', daysLeft: burn.daysRemaining, dailyRate: burn.dailyRate };
      return { level: 'ok', daysLeft: burn.daysRemaining, dailyRate: burn.dailyRate };
    }
    // Fallback: static threshold
    if (ing.current_stock <= 0) return { level: 'critical', daysLeft: null, dailyRate: 0 };
    if (ing.low_stock_threshold > 0 && ing.current_stock < ing.low_stock_threshold) {
      return { level: 'warning', daysLeft: null, dailyRate: 0 };
    }
    return { level: 'ok', daysLeft: null, dailyRate: 0 };
  };

  // Build urgency list for alert panel
  const urgentItems = useMemo(() => {
    return deptIngredients
      .map((ing: any) => ({ ing, urgency: getUrgency(ing) }))
      .filter(({ urgency }) => urgency.level !== 'ok')
      .sort((a, b) => {
        // Sort: critical first, then by days remaining (ascending)
        if (a.urgency.level !== b.urgency.level) return a.urgency.level === 'critical' ? -1 : 1;
        const aDays = a.urgency.daysLeft ?? 999;
        const bDays = b.urgency.daysLeft ?? 999;
        return aDays - bDays;
      });
  }, [deptIngredients, burnMap]);

  const lowStockItems = urgentItems;

  const filtered = deptIngredients.filter((i: any) => {
    if (search.trim() && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (unitFilter !== 'all' && i.unit !== unitFilter) return false;
    if (stockFilter === 'low') {
      const u = getUrgency(i);
      if (u.level === 'ok') return false;
    }
    if (stockFilter === 'out' && i.current_stock > 0) return false;
    return true;
  });

  const downloadCSV = () => {
    let csv = 'Name,Department,Unit,Cost Per Unit,Current Stock,Low Stock Threshold,Daily Burn Rate,Days Remaining,Status\n';
    deptIngredients.forEach((i: any) => {
      const u = getUrgency(i);
      const status = u.level === 'critical' ? 'CRITICAL' : u.level === 'warning' ? 'LOW' : 'OK';
      const daysLeft = u.daysLeft !== null ? u.daysLeft.toFixed(1) : 'N/A';
      csv += `"${i.name}","${i.department || 'kitchen'}","${i.unit}",${i.cost_per_unit},${i.current_stock},${i.low_stock_threshold},${u.dailyRate.toFixed(2)},${daysLeft},${status}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${selectedDept}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const editIngUsage = editIng && editIng !== 'new' ? (usageMap[editIng.id] || []) : [];

  // Auto-set thresholds based on consumption
  const autoSetThresholds = async () => {
    const updates: { id: string; threshold: number }[] = [];
    for (const ing of deptIngredients as any[]) {
      const burn = burnMap[ing.id];
      if (burn && burn.dailyRate > 0) {
        const newThreshold = Math.ceil(burn.dailyRate * bufferDays);
        if (newThreshold !== ing.low_stock_threshold) {
          updates.push({ id: ing.id, threshold: newThreshold });
        }
      }
    }

    if (updates.length === 0) {
      toast.info('No threshold changes needed — no consumption data for these ingredients');
      return;
    }

    for (const u of updates) {
      await supabase.from('ingredients').update({ low_stock_threshold: u.threshold }).eq('id', u.id);
    }

    qc.invalidateQueries({ queryKey: ['ingredients'] });
    toast.success(`Updated thresholds for ${updates.length} ingredients (${bufferDays}-day buffer)`);
  };

  // Filter consumption logs by department
  const filteredLogs = selectedDept === 'all'
    ? consumptionLogs
    : consumptionLogs.filter((log: any) => log.department === selectedDept || log.ingredients?.department === selectedDept);

  const logsByDate: Record<string, Record<string, { name: string; total: number; unit: string }>> = {};
  filteredLogs.forEach((log: any) => {
    const date = format(new Date(log.created_at), 'yyyy-MM-dd');
    const ingName = log.ingredients?.name || 'Unknown';
    const ingUnit = log.ingredients?.unit || '';
    if (!logsByDate[date]) logsByDate[date] = {};
    if (!logsByDate[date][ingName]) logsByDate[date][ingName] = { name: ingName, total: 0, unit: ingUnit };
    logsByDate[date][ingName].total += Math.abs(log.change_qty);
  });

  // Transfer logic
  const transferIngredients = transfer.fromDept
    ? ingredients.filter((i: any) => i.department === transfer.fromDept)
    : [];

  const executeTransfer = async () => {
    const qty = parseFloat(transfer.quantity);
    if (!transfer.fromDept || !transfer.toDept || !transfer.ingredientId || !qty || qty <= 0) {
      toast.error('Please fill all transfer fields');
      return;
    }
    if (transfer.fromDept === transfer.toDept) {
      toast.error('Source and destination must be different');
      return;
    }
    const sourceIng = ingredients.find((i: any) => i.id === transfer.ingredientId);
    if (!sourceIng) return;
    if (qty > (sourceIng as any).current_stock) {
      toast.error('Insufficient stock to transfer');
      return;
    }

    // Deduct from source
    await supabase.from('ingredients').update({
      current_stock: (sourceIng as any).current_stock - qty,
    }).eq('id', sourceIng.id);

    // Find or create target ingredient
    const { data: existing } = await supabase
      .from('ingredients')
      .select('*')
      .eq('name', (sourceIng as any).name)
      .eq('department', transfer.toDept)
      .maybeSingle();

    if (existing) {
      await supabase.from('ingredients').update({
        current_stock: existing.current_stock + qty,
      }).eq('id', existing.id);
    } else {
      await supabase.from('ingredients').insert({
        name: (sourceIng as any).name,
        unit: (sourceIng as any).unit,
        cost_per_unit: (sourceIng as any).cost_per_unit,
        current_stock: qty,
        low_stock_threshold: 0,
        department: transfer.toDept,
      });
    }

    // Log both
    const reason = transfer.reason ? `transfer: ${transfer.reason}` : 'transfer';
    await supabase.from('inventory_logs').insert([
      { ingredient_id: sourceIng.id, change_qty: -qty, reason, department: transfer.fromDept },
      { ingredient_id: existing?.id || sourceIng.id, change_qty: qty, reason, department: transfer.toDept },
    ]);

    setShowTransfer(false);
    setTransfer({ fromDept: '', toDept: '', ingredientId: '', quantity: '', reason: '' });
    qc.invalidateQueries({ queryKey: ['ingredients'] });
    toast.success(`Transferred ${qty} ${(sourceIng as any).unit} of ${(sourceIng as any).name}`);
  };

  // Helper to format days remaining
  const formatDays = (days: number | null) => {
    if (days === null) return null;
    if (days <= 0) return '0d';
    if (days < 1) return `${Math.round(days * 24)}h`;
    return `~${Math.round(days)}d`;
  };

  return (
    <div className="space-y-4">
      {/* Department pill selector */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedDept('all')}
          className={`px-3 py-2 rounded-full font-body text-xs border transition-colors min-h-[40px] ${
            selectedDept === 'all'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-secondary text-foreground border-border hover:bg-accent'
          }`}
        >
          All
        </button>
        {DEPARTMENTS.map(dept => (
          <button
            key={dept}
            onClick={() => setSelectedDept(dept)}
            className={`px-3 py-2 rounded-full font-body text-xs border transition-colors min-h-[40px] ${
              selectedDept === dept
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary text-foreground border-border hover:bg-accent'
            }`}
          >
            {DEPT_LABELS[dept]}
          </button>
        ))}
      </div>

      <Tabs defaultValue="stock" className="w-full">
        <TabsList className="w-full bg-secondary mb-4">
          <TabsTrigger value="stock" className="font-display text-xs tracking-wider flex-1">
            <Package className="w-3.5 h-3.5 mr-1" /> Stock
          </TabsTrigger>
          <TabsTrigger value="consumption" className="font-display text-xs tracking-wider flex-1">
            <BarChart3 className="w-3.5 h-3.5 mr-1" /> Usage Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-lg border border-border bg-secondary/50 text-center">
              <p className="font-display text-lg text-foreground">₱{totalValue.toLocaleString()}</p>
              <p className="font-body text-[10px] text-cream-dim">Inventory Value</p>
            </div>
            <button onClick={() => setStockFilter(stockFilter === 'out' ? 'all' : 'out')}
              className={`p-2.5 rounded-lg border text-center transition-colors ${
                outOfStockCount > 0 ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-secondary/50'
              }`}>
              <p className="font-display text-lg text-foreground">{outOfStockCount}</p>
              <p className="font-body text-[10px] text-cream-dim">Out of Stock</p>
            </button>
            <button onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}
              className={`p-2.5 rounded-lg border text-center transition-colors ${
                urgentItems.length > 0 ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-secondary/50'
              }`}>
              <p className="font-display text-lg text-foreground">{urgentItems.length}</p>
              <p className="font-body text-[10px] text-cream-dim">Needs Attention</p>
            </button>
          </div>

          {/* Missing cost alert */}
          {missingCostCount > 0 && (
            <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="font-body text-xs text-foreground">
                {missingCostCount} ingredient{missingCostCount !== 1 ? 's' : ''} missing cost data — food costing won't be accurate
              </p>
            </div>
          )}

          {/* Smart low stock alerts — sorted by urgency */}
          {urgentItems.length > 0 && stockFilter === 'all' && (
            <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="font-display text-xs tracking-wider text-destructive">
                    Reorder Alerts{selectedDept !== 'all' ? ` (${DEPT_LABELS[selectedDept]})` : ''}
                  </span>
                </div>
              </div>
              {urgentItems.slice(0, 8).map(({ ing, urgency }) => {
                const burn = burnMap[ing.id];
                return (
                  <div key={ing.id} className={`flex items-center justify-between gap-2 p-2 rounded-md ${
                    urgency.level === 'critical' ? 'bg-destructive/15' : 'bg-amber-500/10'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          urgency.level === 'critical' ? 'bg-destructive' : 'bg-amber-500'
                        }`} />
                        <span className="font-body text-xs text-foreground truncate">{ing.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 pl-3.5">
                        <span className="font-body text-[10px] text-cream-dim">
                          {ing.current_stock} {ing.unit}
                        </span>
                        {urgency.dailyRate > 0 && (
                          <span className="font-body text-[10px] text-cream-dim">
                            · {urgency.dailyRate.toFixed(1)}/day
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {urgency.daysLeft !== null ? (
                        <Badge variant={urgency.level === 'critical' ? 'destructive' : 'outline'}
                          className={`text-[10px] py-0 ${urgency.level === 'warning' ? 'border-amber-500/50 text-amber-400' : ''}`}>
                          <Clock className="w-2.5 h-2.5 mr-0.5" />
                          {formatDays(urgency.daysLeft)} left
                        </Badge>
                      ) : (
                        <Badge variant={urgency.level === 'critical' ? 'destructive' : 'outline'}
                          className={`text-[10px] py-0 ${urgency.level === 'warning' ? 'border-amber-500/50 text-amber-400' : ''}`}>
                          {ing.current_stock <= 0 ? 'OUT' : 'LOW'}
                        </Badge>
                      )}
                      {burn && burn.reorderQty > 0 && (
                        <p className="font-body text-[10px] text-muted-foreground mt-0.5">
                          Order: {burn.reorderQty} {ing.unit}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {urgentItems.length > 8 && (
                <p className="font-body text-[10px] text-cream-dim text-center">
                  +{urgentItems.length - 8} more — tap "Needs Attention" to see all
                </p>
              )}
            </div>
          )}

          {/* Auto-threshold tool */}
          {!readOnly && (
            <div className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="font-display text-xs tracking-wider text-foreground">Auto-Set Thresholds</span>
              </div>
              <p className="font-body text-[10px] text-cream-dim">
                Set low-stock thresholds based on actual consumption. Buffer = days of stock to keep.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[2, 3, 5, 7].map(d => (
                    <button key={d} onClick={() => setBufferDays(d)}
                      className={`px-2.5 py-1.5 rounded-md font-body text-xs border transition-colors ${
                        bufferDays === d
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary text-foreground border-border hover:bg-accent'
                      }`}>
                      {d}d
                    </button>
                  ))}
                </div>
                <Button size="sm" onClick={autoSetThresholds} variant="outline" className="font-body text-xs ml-auto">
                  <Zap className="w-3 h-3 mr-1" /> Apply
                </Button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ingredients..."
              className="bg-secondary border-border text-foreground font-body flex-1"
            />
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all" className="font-body text-foreground">All</SelectItem>
                <SelectItem value="pcs" className="font-body text-foreground">pcs</SelectItem>
                <SelectItem value="grams" className="font-body text-foreground">grams</SelectItem>
                <SelectItem value="ml" className="font-body text-foreground">ml</SelectItem>
                <SelectItem value="slices" className="font-body text-foreground">slices</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={downloadCSV}>
              <Download className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Button onClick={openNew} className="font-display tracking-wider flex-1" variant="outline">
              <Plus className="w-4 h-4 mr-2" /> Add Ingredient
            </Button>
            <Button onClick={() => setShowTransfer(true)} className="font-display tracking-wider" variant="outline">
              <ArrowRightLeft className="w-4 h-4 mr-2" /> Transfer
            </Button>
          </div>

          {/* Ingredients list */}
          {filtered.map((ing: any) => {
            const urgency = getUrgency(ing);
            const isOut = ing.current_stock <= 0;
            const noCost = ing.cost_per_unit === 0;
            const dishCount = (usageMap[ing.id] || []).length;
            const burn = burnMap[ing.id];
            const daysLabel = formatDays(urgency.daysLeft);
            return (
              <button key={ing.id} onClick={() => openEdit(ing)}
                className={`w-full text-left p-3 border rounded-lg transition-colors ${
                  isOut ? 'border-destructive/60 bg-destructive/10' :
                  urgency.level === 'critical' ? 'border-destructive/40 bg-destructive/5' :
                  urgency.level === 'warning' ? 'border-amber-500/30 bg-amber-500/5' : 'border-border hover:border-gold/50'
                }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-cream-dim" />
                      <p className="font-display text-sm text-foreground">{ing.name}</p>
                      {isOut && <Badge variant="destructive" className="text-[10px] py-0">OUT</Badge>}
                      {urgency.level === 'critical' && !isOut && <Badge variant="destructive" className="text-[10px] py-0">CRITICAL</Badge>}
                      {urgency.level === 'warning' && <Badge variant="outline" className="text-[10px] py-0 border-amber-500/50 text-amber-400">LOW</Badge>}
                      {noCost && <Badge variant="outline" className="text-[10px] py-0 border-amber-500/50 text-amber-400">No Cost</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="font-body text-xs text-cream-dim">
                        {noCost ? '₱—' : `₱${ing.cost_per_unit}`}/{ing.unit}
                      </p>
                      {selectedDept === 'all' && (
                        <Badge variant="outline" className="text-[10px] py-0 border-muted-foreground/30">
                          {DEPT_LABELS[ing.department] || ing.department}
                        </Badge>
                      )}
                      {dishCount > 0 && (
                        <span className="font-body text-xs text-muted-foreground">
                          · {dishCount} {dishCount === 1 ? 'dish' : 'dishes'}
                        </span>
                      )}
                      {dishCount === 0 && (
                        <span className="font-body text-xs text-muted-foreground">· No recipe</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-display text-sm ${isOut ? 'text-destructive' : 'text-foreground'}`}>{ing.current_stock}</p>
                    <p className="font-body text-[10px] text-cream-dim">{ing.unit}</p>
                    {daysLabel && (
                      <p className={`font-body text-[10px] mt-0.5 ${
                        urgency.level === 'critical' ? 'text-destructive' :
                        urgency.level === 'warning' ? 'text-amber-400' : 'text-muted-foreground'
                      }`}>
                        {daysLabel} left
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <p className="font-body text-sm text-cream-dim text-center py-8">No ingredients found</p>
          )}
        </TabsContent>

        {/* CONSUMPTION LOG TAB */}
        <TabsContent value="consumption" className="space-y-4">
          <div className="flex gap-2">
            {[7, 14, 30].map(d => (
              <Button key={d} size="sm" variant={logDays === d ? 'default' : 'outline'}
                onClick={() => setLogDays(d)} className="font-body text-xs flex-1">
                {d}d
              </Button>
            ))}
          </div>

          {Object.keys(logsByDate).length === 0 ? (
            <p className="font-body text-sm text-cream-dim text-center py-8">No consumption data yet</p>
          ) : (
            Object.entries(logsByDate)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, ings]) => (
                <div key={date} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-cream-dim" />
                    <span className="font-display text-xs tracking-wider text-foreground">
                      {format(new Date(date), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {Object.values(ings)
                    .sort((a, b) => b.total - a.total)
                    .map((ing, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="font-body text-xs text-foreground">{ing.name}</span>
                        <span className="font-body text-xs text-cream-dim">-{ing.total} {ing.unit}</span>
                      </div>
                    ))
                  }
                </div>
              ))
          )}
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={!!editIng} onOpenChange={() => setEditIng(null)}>
        <DialogContent className="bg-card border-border max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider">
              {editIng === 'new' ? 'New Ingredient' : 'Edit Ingredient'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ingredient name" className="bg-secondary border-border text-foreground font-body" />

            {/* Department selector */}
            <div>
              <Label className="font-body text-xs text-cream-dim">Department</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {DEPARTMENTS.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, department: dept }))}
                    className={`px-3 py-2 rounded-full font-body text-xs border transition-colors min-h-[36px] ${
                      form.department === dept
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary text-foreground border-border hover:bg-accent'
                    }`}
                  >
                    {DEPT_LABELS[dept]}
                  </button>
                ))}
              </div>
            </div>

            <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {UNITS.map(u => (
                  <SelectItem key={u} value={u} className="font-body text-foreground">{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <label className="font-body text-xs text-cream-dim">Cost per unit (₱)</label>
              <Input value={form.cost_per_unit} onChange={e => setForm(f => ({ ...f, cost_per_unit: e.target.value }))}
                type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs text-cream-dim">Current Stock</label>
                <Input value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))}
                  type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
              </div>
              <div>
                <label className="font-body text-xs text-cream-dim">Low Threshold</label>
                <Input value={form.low_stock_threshold} onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
                  type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
              </div>
            </div>

            {/* Burn rate info in edit dialog */}
            {editIng && editIng !== 'new' && burnMap[editIng.id] && (
              <div className="p-2.5 rounded-lg border border-border bg-secondary/30 space-y-1">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" />
                  <span className="font-display text-xs tracking-wider text-foreground">Consumption Stats</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div>
                    <p className="font-display text-sm text-foreground">{burnMap[editIng.id].dailyRate.toFixed(1)}</p>
                    <p className="font-body text-[10px] text-cream-dim">{editIng.unit}/day</p>
                  </div>
                  <div>
                    <p className="font-display text-sm text-foreground">
                      {burnMap[editIng.id].daysRemaining !== null ? formatDays(burnMap[editIng.id].daysRemaining) : '—'}
                    </p>
                    <p className="font-body text-[10px] text-cream-dim">remaining</p>
                  </div>
                </div>
                <p className="font-body text-[10px] text-cream-dim">
                  Suggested threshold ({bufferDays}d buffer): <strong className="text-foreground">{burnMap[editIng.id].suggestedThreshold} {editIng.unit}</strong>
                </p>
              </div>
            )}

            {/* Used in dishes section */}
            {editIngUsage.length > 0 && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-cream-dim" />
                  <span className="font-display text-xs tracking-wider text-foreground">
                    Used in {editIngUsage.length} {editIngUsage.length === 1 ? 'dish' : 'dishes'}
                  </span>
                </div>
                {editIngUsage
                  .sort((a, b) => a.dishName.localeCompare(b.dishName))
                  .map((u, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="font-body text-xs text-foreground">{u.dishName}</span>
                    <span className="font-body text-[10px] text-cream-dim">{u.quantity} per order</span>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={save} className="font-display tracking-wider w-full">Save</Button>
            {editIng && editIng !== 'new' && (
              <Button variant="destructive" onClick={() => deleteIng(editIng.id)} className="font-display tracking-wider w-full">
                Delete Ingredient
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider">Transfer Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="font-body text-xs text-cream-dim">From Department</Label>
              <Select value={transfer.fromDept} onValueChange={v => setTransfer(t => ({ ...t, fromDept: v, ingredientId: '' }))}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d} value={d} className="font-body text-foreground">{DEPT_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-body text-xs text-cream-dim">To Department</Label>
              <Select value={transfer.toDept} onValueChange={v => setTransfer(t => ({ ...t, toDept: v }))}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {DEPARTMENTS.filter(d => d !== transfer.fromDept).map(d => (
                    <SelectItem key={d} value={d} className="font-body text-foreground">{DEPT_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-body text-xs text-cream-dim">Ingredient</Label>
              <Select value={transfer.ingredientId} onValueChange={v => setTransfer(t => ({ ...t, ingredientId: v }))}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent className="bg-card border-border max-h-48">
                  {transferIngredients.map((i: any) => (
                    <SelectItem key={i.id} value={i.id} className="font-body text-xs text-foreground">
                      {i.name} ({i.current_stock} {i.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-body text-xs text-cream-dim">Quantity</Label>
              <Input value={transfer.quantity} onChange={e => setTransfer(t => ({ ...t, quantity: e.target.value }))}
                type="number" placeholder="Amount to transfer" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div>
              <Label className="font-body text-xs text-cream-dim">Reason (optional)</Label>
              <Input value={transfer.reason} onChange={e => setTransfer(t => ({ ...t, reason: e.target.value }))}
                placeholder="e.g. Bar ran out" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <Button onClick={executeTransfer} className="font-display tracking-wider w-full">
              <ArrowRightLeft className="w-4 h-4 mr-2" /> Transfer Stock
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryDashboard;
