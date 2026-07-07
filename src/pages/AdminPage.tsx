import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Eye, EyeOff, Receipt, Search, Download, Upload, Trash2, Minus, Sun } from 'lucide-react';
import StaffNavBar from '@/components/StaffNavBar';
import MenuBulkImportModal from '@/components/admin/MenuBulkImportModal';
import ResortProfileForm from '@/components/admin/ResortProfileForm';
import SetupExportCard from '@/components/admin/SetupExportCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EditableRow from '@/components/admin/EditableRow';
import TimePicker from '@/components/admin/TimePicker';
import OrderCard from '@/components/admin/OrderCard';
import ReportsDashboard from '@/components/admin/ReportsDashboard';
import PayrollDashboard from '@/components/admin/PayrollDashboard';
import TabInvoice from '@/components/admin/TabInvoice';
import RecipeEditor from '@/components/admin/RecipeEditor';
import InventoryDashboard from '@/components/admin/InventoryDashboard';
import ResortOpsDashboard from '@/components/admin/ResortOpsDashboard';
import ExperiencesPage from '@/pages/ExperiencesPage';
import InvoiceSettingsForm from '@/components/admin/InvoiceSettingsForm';
import StaffAccessManager from '@/components/admin/StaffAccessManager';
import EmployeeContactConfig from '@/components/admin/EmployeeContactConfig';
import ReceptionPage from '@/pages/ReceptionPage';
import TimesheetDashboard from '@/components/admin/TimesheetDashboard';
import WeeklyScheduleManager from '@/components/admin/WeeklyScheduleManager';
import HousekeepingConfig from '@/components/admin/HousekeepingConfig';
import HousekeeperPage from '@/pages/HousekeeperPage';
import RoomSetup from '@/components/admin/RoomSetup';
import DeviceManager from '@/components/admin/DeviceManager';
import BillingConfigForm from '@/components/admin/BillingConfigForm';
import AuditLogView from '@/components/admin/AuditLogView';
import OrderArchive from '@/components/admin/OrderArchive';
import GuestPortalConfig from '@/components/admin/GuestPortalConfig';
import DepartmentOrdersView from '@/components/DepartmentOrdersView';
import IntegrationReadinessDashboard from '@/components/integration/IntegrationReadinessDashboard';
import LiveOpsDashboard from '@/components/admin/LiveOpsDashboard';
import AgentChatPanel from '@/components/AgentChatPanel';

import { deductInventoryForOrder } from '@/lib/inventoryDeduction';
import { hasAccess, canEdit, canViewDocuments } from '@/lib/permissions';
import { usePermissions } from '@/hooks/usePermissions';

import { formatDistanceToNow } from 'date-fns';
import { useResortProfile } from '@/hooks/useResortProfile';
import { useDepartmentAlerts } from '@/hooks/useDepartmentAlerts';
import { LuxuryShell, LuxuryHeader } from '@/components/luxury';

type DateFilter = 'today' | 'yesterday' | 'all';

const ALERT_KEY_MAP: Record<string, string> = {
  rooms: 'reception',
  orders: 'orders',
  'guest-services': 'experiences',
  kitchen: 'kitchen',
  bar: 'bar',
  housekeeping: 'housekeeping',
};


// ── Tab / section definitions ────────────────────────────────────
interface TabDef { value: string; label: string; perm: string | null }

const OPERATIONS: TabDef[] = [
  { value: 'rooms', label: 'Reception', perm: 'rooms' },
  { value: 'orders', label: 'Orders', perm: 'orders' },
  { value: 'guest-services', label: 'Guest Services', perm: 'reception' },
  { value: 'kitchen', label: 'Kitchen', perm: 'kitchen' },
  { value: 'bar', label: 'Bar', perm: 'bar' },
  { value: 'housekeeping', label: 'Housekeeping', perm: 'housekeeping' },
  { value: 'live-ops', label: 'Live Ops', perm: null },
];

const PEOPLE: TabDef[] = [
  { value: 'payroll', label: 'HR', perm: 'payroll' },
  { value: 'schedules', label: 'Schedules', perm: 'schedules' },
  { value: 'timesheet', label: 'Timesheet', perm: 'timesheet' },
];

const CONFIG: TabDef[] = [
  { value: 'settings', label: 'Setup', perm: 'setup' },
  { value: 'menu', label: 'Menu', perm: 'menu' },
  { value: 'reports', label: 'Reports', perm: 'reports' },
  { value: 'inventory', label: 'Inventory', perm: 'inventory' },
  { value: 'resort-ops', label: 'Resort Ops', perm: 'resort_ops' },
  { value: 'audit', label: 'Audit', perm: null },
  { value: 'archive', label: 'Archive', perm: null },
  { value: 'guest-portal', label: 'Guest Portal', perm: null },
  ...(import.meta.env.DEV ? [{ value: 'integration', label: 'Integration', perm: null } as TabDef] : []),
];

const AdminPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: resortProfile } = useResortProfile();

  // ── Permissions ────────────────────────────────────────────────
  const { perms, isAdmin, canView, canEdit: canEditModule, readOnly, canViewDocuments: docsAllowedFn } = usePermissions();

  const allowed = (t: TabDef) => isAdmin || (t.perm !== null && canView(t.perm));
  const opsTabs = OPERATIONS.filter(allowed);
  const peopleTabs = PEOPLE.filter(allowed);
  const cfgTabs = CONFIG.filter(allowed);
  const allTabs = [...opsTabs, ...peopleTabs, ...cfgTabs];
  const defaultTab = allTabs[0]?.value || 'orders';

  const [activeTab, setActiveTab] = useState(defaultTab);
  const alerts = useDepartmentAlerts();

  const docsAllowed = docsAllowedFn();

  // ── Realtime ───────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ['orders-admin'] });
        qc.invalidateQueries({ queryKey: ['orders-staff'] });
        qc.invalidateQueries({ queryKey: ['tabs-admin'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabs' }, () => {
        qc.invalidateQueries({ queryKey: ['tabs-admin'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // ── Data queries ───────────────────────────────────────────────
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    enabled: isAdmin || hasAccess(perms, 'setup'),
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').limit(1).maybeSingle();
      return data;
    },
  });

  const { data: units = [] } = useQuery({
    queryKey: ['units-admin'],
    enabled: isAdmin || hasAccess(perms, 'setup'),
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').order('unit_name');
      return data || [];
    },
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables-admin'],
    enabled: isAdmin || hasAccess(perms, 'setup'),
    queryFn: async () => {
      const { data } = await supabase.from('resort_tables').select('*').order('table_name');
      return data || [];
    },
  });

  const { data: orderTypes = [] } = useQuery({
    queryKey: ['order-types-admin'],
    enabled: isAdmin || hasAccess(perms, 'setup'),
    queryFn: async () => {
      const { data } = await supabase.from('order_types').select('*').order('sort_order');
      return data || [];
    },
  });

  const { data: menuCategories = [] } = useQuery({
    queryKey: ['menu-categories-admin'],
    enabled: isAdmin || hasAccess(perms, 'menu') || hasAccess(perms, 'setup'),
    queryFn: async () => {
      const { data } = await supabase.from('menu_categories').select('*').order('sort_order');
      return data || [];
    },
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-admin'],
    enabled: isAdmin || hasAccess(perms, 'menu') || hasAccess(perms, 'orders'),
    queryFn: async () => {
      const { data } = await supabase.from('menu_items').select('*').order('category').order('sort_order');
      return data || [];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders-admin'],
    enabled: isAdmin || hasAccess(perms, 'orders'),
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
      return data || [];
    },
    refetchInterval: 5000,
  });

  const { data: tabs = [] } = useQuery({
    queryKey: ['tabs-admin'],
    enabled: isAdmin || hasAccess(perms, 'orders'),
    queryFn: async () => {
      const { data } = await supabase.from('tabs').select('*').order('created_at', { ascending: false }).limit(100);
      return data || [];
    },
  });

  // ── Settings state ─────────────────────────────────────────────
  const [whatsapp, setWhatsapp] = useState('');
  const [brkStart, setBrkStart] = useState('');
  const [brkEnd, setBrkEnd] = useState('');
  const [morningBriefLoading, setMorningBriefLoading] = useState(false);

  const sendMorningBrief = async () => {
    setMorningBriefLoading(true);
    try {
      const response = await fetch(
        'https://paghxagqnaisxesmhnwj.supabase.co/functions/v1/ops-coordinator',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': 'kapwa-os-ai-2026',
          },
          body: JSON.stringify({ type: 'morning' }),
        }
      );
      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || `HTTP ${response.status}`);
      }
      toast.success('Morning brief sent successfully');
    } catch (e: any) {
      toast.error(`Morning brief failed: ${e.message}`);
    } finally {
      setMorningBriefLoading(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setWhatsapp(settings.kitchen_whatsapp_number || '');
      setBrkStart(settings.breakfast_start_time || '07:00');
      setBrkEnd(settings.breakfast_end_time || '11:00');
    }
  }, [settings]);

  const saveSettings = async () => {
    const payload = {
      kitchen_whatsapp_number: whatsapp,
      breakfast_start_time: brkStart,
      breakfast_end_time: brkEnd,
    };
    if (settings?.id) {
      await supabase.from('settings').update(payload).eq('id', settings.id);
    } else {
      await supabase.from('settings').insert(payload);
    }
    qc.invalidateQueries({ queryKey: ['settings'] });
    toast.success('Settings saved');
  };

  // ── Units ──────────────────────────────────────────────────────
  const [newUnit, setNewUnit] = useState('');
  const addUnit = async () => {
    if (!newUnit.trim()) return;
    await supabase.from('units').insert({ unit_name: newUnit.trim() });
    setNewUnit('');
    qc.invalidateQueries({ queryKey: ['units-admin'] });
  };

  // ── Tables ─────────────────────────────────────────────────────
  const [newTable, setNewTable] = useState('');
  const addTable = async () => {
    if (!newTable.trim()) return;
    await supabase.from('resort_tables').insert({ table_name: newTable.trim() });
    setNewTable('');
    qc.invalidateQueries({ queryKey: ['tables-admin'] });
  };

  // ── Order Types ────────────────────────────────────────────────
  const [newOrderType, setNewOrderType] = useState('');
  const addOrderType = async () => {
    if (!newOrderType.trim()) return;
    const maxSort = orderTypes.reduce((m, ot) => Math.max(m, ot.sort_order), 0);
    await supabase.from('order_types').insert({
      label: newOrderType.trim(),
      type_key: newOrderType.trim().replace(/\s+/g, ''),
      input_mode: 'text',
      placeholder: '',
      sort_order: maxSort + 1,
    });
    setNewOrderType('');
    qc.invalidateQueries({ queryKey: ['order-types-admin'] });
  };

  // ── Menu Categories ────────────────────────────────────────────
  const [newCategory, setNewCategory] = useState('');
  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const maxSort = menuCategories.reduce((m: number, c: any) => Math.max(m, c.sort_order), 0);
    await supabase.from('menu_categories').insert({ name: newCategory.trim(), sort_order: maxSort + 1 });
    setNewCategory('');
    qc.invalidateQueries({ queryKey: ['menu-categories-admin'] });
  };

  // ── Menu item editor ──────────────────────────────────────────
  const [menuSearch, setMenuSearch] = useState('');
  const [editItem, setEditItem] = useState<any>(null);
  const [recipeCost, setRecipeCost] = useState(0);
  const defaultCategory = menuCategories.length > 0 ? menuCategories[0].name : '';
  const [itemForm, setItemForm] = useState({
    name: '', category: defaultCategory, description: '', price: '', food_cost: '', sort_order: '0', department: 'kitchen',
  });

  const openNewItem = () => {
    setEditItem('new');
    setItemForm({ name: '', category: menuCategories.length > 0 ? menuCategories[0].name : '', description: '', price: '', food_cost: '', sort_order: '0', department: 'kitchen' });
  };

  const openEditItem = (item: any) => {
    setEditItem(item);
    setItemForm({
      name: item.name, category: item.category, description: item.description || '',
      price: String(item.price), food_cost: String(item.food_cost || ''), sort_order: String(item.sort_order),
      department: (item as any).department || 'kitchen',
    });
  };

  const saveItem = async () => {
    const overrideVal = parseFloat(itemForm.food_cost);
    const hasManualOverride = itemForm.food_cost && !isNaN(overrideVal) && overrideVal > 0;
    const foodCost = hasManualOverride ? overrideVal : recipeCost > 0 ? recipeCost : null;
    const payload: any = {
      name: itemForm.name, category: itemForm.category, description: itemForm.description,
      price: parseFloat(itemForm.price) || 0, food_cost: foodCost,
      sort_order: parseInt(itemForm.sort_order) || 0,
      department: itemForm.department,
    };
    if (editItem === 'new') {
      await supabase.from('menu_items').insert(payload);
    } else {
      await supabase.from('menu_items').update(payload).eq('id', editItem.id);
    }
    setEditItem(null);
    qc.invalidateQueries({ queryKey: ['menu-admin'] });
    toast.success('Menu item saved');
  };

  // ── Delete menu item ──────────────────────────────────────────
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteItem = async () => {
    if (!editItem || editItem === 'new') return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    await supabase.from('recipe_ingredients').delete().eq('menu_item_id', editItem.id);
    await supabase.from('menu_items').delete().eq('id', editItem.id);
    setEditItem(null);
    setConfirmingDelete(false);
    qc.invalidateQueries({ queryKey: ['menu-admin'] });
    toast.success('Menu item deleted');
  };

  // ── Orders pipeline state ─────────────────────────────────────
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [showClosed, setShowClosed] = useState(false);
  const [activeStatus, setActiveStatus] = useState('New');
  const [ordersSubView, setOrdersSubView] = useState<'pipeline' | 'tabs'>('pipeline');
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const deleteAllOrders = async () => {
    try {
      // Delete in FK order: room_transactions → inventory_logs → orders → tabs
      await supabase.from('room_transactions' as any).delete().gte('created_at', '1970-01-01');
      await supabase.from('inventory_logs').delete().gte('created_at', '1970-01-01');
      const { error: ordErr } = await supabase.from('orders').delete().gte('created_at', '1970-01-01');
      if (ordErr) { toast.error(`Orders: ${ordErr.message}`); return; }
      const { error: tabErr } = await supabase.from('tabs').delete().gte('created_at', '1970-01-01');
      if (tabErr) { toast.error(`Tabs: ${tabErr.message}`); return; }
      qc.invalidateQueries({ queryKey: ['orders-admin'] });
      qc.invalidateQueries({ queryKey: ['tabs-admin'] });
      setConfirmDeleteAll(false);
      toast.success('All orders & tabs deleted');
      const { logAudit } = await import('@/lib/auditLog');
      logAudit('deleted', 'orders', 'ALL', 'Bulk delete all orders and tabs');
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  };
  const filteredOrders = useMemo(() => {
    let filtered = orders;
    const now = new Date();
    if (dateFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(o => new Date(o.created_at) >= start);
    } else if (dateFilter === 'yesterday') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(o => {
        const d = new Date(o.created_at);
        return d >= start && d < end;
      });
    }
    return filtered.filter(o => o.status === activeStatus);
  }, [orders, dateFilter, activeStatus]);

  const statusCounts = useMemo(() => {
    const now = new Date();
    let filtered = orders;
    if (dateFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(o => new Date(o.created_at) >= start);
    } else if (dateFilter === 'yesterday') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(o => {
        const d = new Date(o.created_at);
        return d >= start && d < end;
      });
    }
    const counts: Record<string, number> = { New: 0, Preparing: 0, Served: 0, Paid: 0, Closed: 0 };
    filtered.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return counts;
  }, [orders, dateFilter]);

  const advanceOrder = async (orderId: string, nextStatus: string) => {
    const updateData: any = { status: nextStatus };
    if (nextStatus === 'Closed') {
      updateData.closed_at = new Date().toISOString();
    }
    await supabase.from('orders').update(updateData).eq('id', orderId);
    if (nextStatus === 'Preparing') {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        const items = (order.items as any[]) || [];
        await deductInventoryForOrder(orderId, items);
        qc.invalidateQueries({ queryKey: ['ingredients'] });
      }
    }
    qc.invalidateQueries({ queryKey: ['orders-admin'] });
    qc.invalidateQueries({ queryKey: ['orders-staff'] });
    qc.invalidateQueries({ queryKey: ['orders-kitchen'] });
    qc.invalidateQueries({ queryKey: ['orders-bar'] });
    toast.success(`Order → ${nextStatus}`);
  };

  const deleteOrder = async (orderId: string) => {
    // Delete dependent records first to avoid FK constraint errors
    await supabase.from('room_transactions').delete().eq('order_id', orderId);
    await supabase.from('inventory_logs').delete().eq('order_id', orderId);
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ['orders-admin'] });
    toast.success('Order deleted');
  };

  // ── Add items to order ─────────────────────────────────────────
  const [addingToOrder, setAddingToOrder] = useState<any>(null);
  const [addCart, setAddCart] = useState<Record<string, { name: string; price: number; qty: number }>>({});
  const [addCat, setAddCat] = useState('');
  const activeCat = addCat || (menuCategories.length > 0 ? menuCategories[0].name : '');
  const catItems = menuItems.filter((i: any) => i.category === activeCat && i.available);
  const addCartTotal = Object.values(addCart).reduce((s, c) => s + c.price * c.qty, 0);

  const handleOpenAddItems = (order: any) => {
    setAddingToOrder(order);
    setAddCart({});
    setAddCat('');
  };

  const handleSubmitAddItems = async () => {
    if (!addingToOrder || addCartTotal === 0) return;
    const newItems = Object.entries(addCart).map(([, c]) => ({ name: c.name, price: c.price, qty: c.qty }));
    const newTotal = newItems.reduce((s, i) => s + i.price * i.qty, 0);
    const newServiceCharge = Math.round(newTotal * 0.1);
    await supabase.from('orders').insert({
      items: newItems,
      total: newTotal,
      service_charge: newServiceCharge,
      status: 'New',
      order_type: addingToOrder.order_type,
      location_detail: addingToOrder.location_detail,
      tab_id: addingToOrder.tab_id,
      room_id: addingToOrder.room_id || null,
      guest_name: addingToOrder.guest_name || '',
      staff_name: addingToOrder.staff_name || localStorage.getItem('emp_name') || '',
      payment_type: addingToOrder.payment_type || '',
    });
    qc.invalidateQueries({ queryKey: ['orders-admin'] });
    setAddingToOrder(null);
    toast.success('New items sent to kitchen');
  };

  const [viewingTabId, setViewingTabId] = useState<string | null>(null);

  const statuses = showClosed
    ? ['New', 'Preparing', 'Served', 'Paid', 'Closed']
    : ['New', 'Preparing', 'Served', 'Paid'];

  // ── No access guard ────────────────────────────────────────────
  if (allTabs.length === 0) {
    return (
      <div className="min-h-screen bg-navy-texture flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="font-body text-sm text-muted-foreground">No dashboard access granted.</p>
          <Button onClick={() => navigate('/employee-portal')} variant="outline" className="font-display text-xs tracking-wider">
            Back to Portal
          </Button>
        </div>
      </div>
    );
  }

  // ── Section header helper ──────────────────────────────────────
  const SectionLabel = ({ label }: { label: string }) => (
    <p className="font-display text-[10px] tracking-widest text-muted-foreground uppercase pt-1">{label}</p>
  );

  return (
    <LuxuryShell>
      {/* Global navigation bar */}
      <StaffNavBar />

      <div className="max-w-2xl mx-auto px-4 pb-6">
        <LuxuryHeader
          eyebrow="Control Tower"
          greeting={resortProfile?.resort_name || 'Admin'}
          meta="Operations · People · Configuration"
          className="mb-5"
        />

        {isAdmin && (
          <div className="mb-4">
            <Button
              size="sm"
              onClick={sendMorningBrief}
              disabled={morningBriefLoading}
              className="font-display text-xs tracking-wider gap-2 bg-gradient-gold text-background hover:opacity-90"
            >
              <Sun className="w-4 h-4" />
              {morningBriefLoading ? 'Sending…' : 'Send Morning Brief'}
            </Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* ── Grouped tab triggers ─────────────────────────── */}
          <div className="space-y-2 mb-6">
            {opsTabs.length > 0 && (
              <div>
                <SectionLabel label="Operations" />
                <TabsList className="flex flex-wrap gap-1 mt-1 h-auto bg-transparent p-0">
                  {opsTabs.map(t => (
                    <TabsTrigger key={t.value} value={t.value}
                      className={`font-display text-xs tracking-wider min-h-[44px] px-3 py-1.5 rounded-md border border-border/60 bg-card/40 backdrop-blur-sm text-muted-foreground data-[state=active]:bg-gradient-gold data-[state=active]:text-background data-[state=active]:border-gold/60 data-[state=active]:luxury-glow-gold ${
                        ALERT_KEY_MAP[t.value] && alerts[ALERT_KEY_MAP[t.value] as keyof typeof alerts] && activeTab !== t.value ? 'tab-pulse' : ''
                      }`}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            )}
            {peopleTabs.length > 0 && (
              <div>
                <SectionLabel label="People" />
                <TabsList className="flex flex-wrap gap-1 mt-1 h-auto bg-transparent p-0">
                  {peopleTabs.map(t => (
                    <TabsTrigger key={t.value} value={t.value}
                      className="font-display text-xs tracking-wider min-h-[44px] px-3 py-1.5 rounded-md border border-border/60 bg-card/40 backdrop-blur-sm text-muted-foreground data-[state=active]:bg-gradient-gold data-[state=active]:text-background data-[state=active]:border-gold/60 data-[state=active]:luxury-glow-gold">
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            )}
            {cfgTabs.length > 0 && (
              <div>
                <SectionLabel label="Config" />
                <TabsList className="flex flex-wrap gap-1 mt-1 h-auto bg-transparent p-0">
                  {cfgTabs.map(t => (
                    <TabsTrigger key={t.value} value={t.value}
                      className="font-display text-xs tracking-wider min-h-[44px] px-3 py-1.5 rounded-md border border-border/60 bg-card/40 backdrop-blur-sm text-muted-foreground data-[state=active]:bg-gradient-gold data-[state=active]:text-background data-[state=active]:border-gold/60 data-[state=active]:luxury-glow-gold">
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════
              OPERATIONS TAB CONTENTS
              ═══════════════════════════════════════════════════ */}

          {/* ORDERS TAB */}
          {(isAdmin || hasAccess(perms, 'orders')) && (
            <TabsContent value="orders" className="space-y-4">
              <div className="flex gap-2 mb-2">
                <Button size="sm" variant={ordersSubView === 'pipeline' ? 'default' : 'outline'}
                  onClick={() => { setOrdersSubView('pipeline'); setSelectedTabId(null); }}
                  className="font-display text-xs tracking-wider flex-1">
                  Kitchen Pipeline
                </Button>
                <Button size="sm" variant={ordersSubView === 'tabs' ? 'default' : 'outline'}
                  onClick={() => setOrdersSubView('tabs')}
                  className="font-display text-xs tracking-wider flex-1 gap-1">
                  <Receipt className="w-3.5 h-3.5" /> Open Tabs
                </Button>
              </div>

              {ordersSubView === 'pipeline' ? (
                <>
                  <div className="flex gap-2 items-center">
                    {(['today', 'yesterday', 'all'] as DateFilter[]).map(df => (
                      <Button key={df} size="sm" variant={dateFilter === df ? 'default' : 'outline'}
                        onClick={() => setDateFilter(df)} className="font-body text-xs flex-1 capitalize">
                        {df}
                      </Button>
                    ))}
                    <Button size="icon" variant="ghost" onClick={() => setShowClosed(!showClosed)}
                      className="text-muted-foreground" title={showClosed ? 'Hide Closed' : 'Show Closed'}>
                      {showClosed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    {isAdmin && (
                      confirmDeleteAll ? (
                        <Button size="sm" variant="destructive" className="font-body text-xs"
                          onClick={deleteAllOrders}>
                          Confirm Delete All?
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="font-body text-xs text-destructive border-destructive"
                          onClick={() => {
                            setConfirmDeleteAll(true);
                            setTimeout(() => setConfirmDeleteAll(false), 3000);
                          }}>
                          <Trash2 className="w-3 h-3 mr-1" /> Delete All
                        </Button>
                      )
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {statuses.map(s => (
                      <button key={s} onClick={() => setActiveStatus(s)}
                        className={`px-3 py-1.5 font-body text-xs rounded-md whitespace-nowrap transition-colors ${
                          activeStatus === s
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                        }`}>
                        {s} {statusCounts[s] > 0 && <span className="ml-1 font-display">({statusCounts[s]})</span>}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {filteredOrders.length === 0 && (
                      <p className="font-body text-muted-foreground text-center py-8">No {activeStatus.toLowerCase()} orders</p>
                    )}
                    {filteredOrders.map(order => (
                      <OrderCard key={order.id} order={order}
                        onAdvance={readOnly('orders') ? undefined : advanceOrder}
                        resortProfile={resortProfile}
                        onAddItems={readOnly('orders') ? undefined : handleOpenAddItems}
                        onViewTab={(tabId) => setViewingTabId(tabId)}
                        onDelete={isAdmin ? deleteOrder : undefined}
                      />
                    ))}
                  </div>
                </>
              ) : selectedTabId ? (
                <TabInvoice tabId={selectedTabId} onClose={() => setSelectedTabId(null)} isAdmin={isAdmin} />
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const openTabs = tabs.filter(t => t.status === 'Open');
                    const closedTabs = tabs.filter(t => t.status === 'Closed');
                    return (
                      <>
                        {openTabs.length === 0 && closedTabs.length === 0 && (
                          <p className="font-body text-muted-foreground text-center py-8">No tabs yet</p>
                        )}
                        {openTabs.length > 0 && (
                          <>
                            <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Open Tabs ({openTabs.length})</p>
                            {openTabs.map(tab => {
                              const tabOrders = orders.filter(o => o.tab_id === tab.id);
                              const tabTotal = tabOrders.reduce((s, o) => s + Number(o.total) + Number(o.service_charge || 0), 0);
                              return (
                                <button key={tab.id} onClick={() => setSelectedTabId(tab.id)}
                                  className="w-full text-left p-3 border border-border hover:border-primary/50 transition-colors rounded-lg">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <p className="font-display text-sm text-foreground">{tab.location_detail}</p>
                                      <p className="font-body text-xs text-muted-foreground">
                                        {tab.location_type} · {tabOrders.length} order{tabOrders.length !== 1 ? 's' : ''} · {formatDistanceToNow(new Date(tab.created_at), { addSuffix: true })}
                                      </p>
                                    </div>
                                    <span className="font-display text-sm text-foreground">₱{tabTotal.toLocaleString()}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        )}
                        {closedTabs.length > 0 && (
                          <>
                            <p className="font-display text-xs tracking-wider text-muted-foreground uppercase mt-4">Closed Tabs ({closedTabs.length})</p>
                            {closedTabs.slice(0, 20).map(tab => {
                              const tabOrders = orders.filter(o => o.tab_id === tab.id);
                              const tabTotal = tabOrders.reduce((s, o) => s + Number(o.total) + Number(o.service_charge || 0), 0);
                              return (
                                <button key={tab.id} onClick={() => setSelectedTabId(tab.id)}
                                  className="w-full text-left p-3 border border-border/50 transition-colors rounded-lg opacity-60">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <p className="font-display text-sm text-foreground">{tab.location_detail}</p>
                                      <p className="font-body text-xs text-muted-foreground">
                                        {tab.payment_method} · {tabOrders.length} order{tabOrders.length !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                    <span className="font-display text-sm text-foreground">₱{tabTotal.toLocaleString()}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </TabsContent>
          )}

          {/* KITCHEN TAB */}
          {(isAdmin || hasAccess(perms, 'kitchen')) && (
            <TabsContent value="kitchen">
              <DepartmentOrdersView department="kitchen" />
            </TabsContent>
          )}

          {/* BAR TAB */}
          {(isAdmin || hasAccess(perms, 'bar')) && (
            <TabsContent value="bar">
              <DepartmentOrdersView department="bar" />
            </TabsContent>
          )}

          {/* ROOMS TAB */}
          {(isAdmin || hasAccess(perms, 'rooms')) && (
            <TabsContent value="rooms" className="mt-0">
              <ReceptionPage embedded />
            </TabsContent>
          )}

          {/* HOUSEKEEPING TAB */}
          {(isAdmin || hasAccess(perms, 'housekeeping')) && (
            <TabsContent value="housekeeping">
              <HousekeeperPage embedded />
            </TabsContent>
          )}

          {/* ═══════════════════════════════════════════════════
              PEOPLE TAB CONTENTS
              ═══════════════════════════════════════════════════ */}

          {(isAdmin || hasAccess(perms, 'payroll')) && (
            <TabsContent value="payroll">
              <PayrollDashboard readOnly={readOnly('payroll')} />
            </TabsContent>
          )}

          {(isAdmin || hasAccess(perms, 'schedules')) && (
            <TabsContent value="schedules">
              <WeeklyScheduleManager readOnly={readOnly('schedules')} />
            </TabsContent>
          )}

          {(isAdmin || hasAccess(perms, 'timesheet')) && (
            <TabsContent value="timesheet">
              <TimesheetDashboard readOnly={readOnly('timesheet')} />
            </TabsContent>
          )}

          {/* ═══════════════════════════════════════════════════
              CONFIG TAB CONTENTS
              ═══════════════════════════════════════════════════ */}

          {/* SETUP TAB */}
          {(isAdmin || hasAccess(perms, 'setup')) && (
            <TabsContent value="settings" className="space-y-8">
              <div className={readOnly('setup') ? 'pointer-events-none opacity-70' : ''}>
                <SetupExportCard />
                <div className="mt-8"><ResortProfileForm /></div>

                <section className="mt-8">
                  <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Kitchen Settings</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="font-body text-xs text-muted-foreground">WhatsApp Number (with country code)</label>
                      <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                        className="bg-secondary border-border text-foreground font-body mt-1" placeholder="639171234567" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <TimePicker label="Breakfast Start" value={brkStart} onChange={setBrkStart} />
                      <TimePicker label="Breakfast End" value={brkEnd} onChange={setBrkEnd} />
                    </div>
                    <Button onClick={saveSettings} className="font-display tracking-wider w-full">Save Settings</Button>
                  </div>
                </section>

                <div className="mt-8"><InvoiceSettingsForm /></div>
                <div className="mt-8"><BillingConfigForm /></div>

                <section className="mt-8">
                  <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Units / Rooms</h3>
                  <div className="space-y-0">
                    {units.map(u => (
                      <EditableRow key={u.id} id={u.id} name={u.unit_name} active={u.active}
                        onRename={async (id, newName) => { await supabase.from('units').update({ unit_name: newName }).eq('id', id); qc.invalidateQueries({ queryKey: ['units-admin'] }); toast.success('Unit renamed'); }}
                        onDelete={async (id) => { await supabase.from('units').delete().eq('id', id); qc.invalidateQueries({ queryKey: ['units-admin'] }); toast.success('Unit deleted'); }}
                        onToggle={async (id, checked) => { await supabase.from('units').update({ active: checked }).eq('id', id); qc.invalidateQueries({ queryKey: ['units-admin'] }); }}
                      />
                    ))}
                    <div className="flex gap-2 mt-3">
                      <Input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="New unit name"
                        className="bg-secondary border-border text-foreground font-body" />
                      <Button onClick={addUnit} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </section>

                <section className="mt-8">
                  <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Dine-In Tables</h3>
                  <div className="space-y-0">
                    {tables.map(t => (
                      <EditableRow key={t.id} id={t.id} name={t.table_name} active={t.active}
                        onRename={async (id, newName) => { await supabase.from('resort_tables').update({ table_name: newName }).eq('id', id); qc.invalidateQueries({ queryKey: ['tables-admin'] }); toast.success('Table renamed'); }}
                        onDelete={async (id) => { await supabase.from('resort_tables').delete().eq('id', id); qc.invalidateQueries({ queryKey: ['tables-admin'] }); toast.success('Table deleted'); }}
                        onToggle={async (id, checked) => { await supabase.from('resort_tables').update({ active: checked }).eq('id', id); qc.invalidateQueries({ queryKey: ['tables-admin'] }); }}
                      />
                    ))}
                    <div className="flex gap-2 mt-3">
                      <Input value={newTable} onChange={e => setNewTable(e.target.value)} placeholder="New table name"
                        className="bg-secondary border-border text-foreground font-body" />
                      <Button onClick={addTable} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </section>

                <section className="mt-8">
                  <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Order Types</h3>
                  <div className="space-y-3">
                    {orderTypes.map(ot => (
                      <div key={ot.id} className="space-y-2 border border-border rounded-lg p-3">
                        <EditableRow id={ot.id} name={ot.label} active={ot.active}
                          onRename={async (id, newName) => { await supabase.from('order_types').update({ label: newName }).eq('id', id); qc.invalidateQueries({ queryKey: ['order-types-admin'] }); toast.success('Order type renamed'); }}
                          onDelete={async (id) => { await supabase.from('order_types').delete().eq('id', id); qc.invalidateQueries({ queryKey: ['order-types-admin'] }); toast.success('Order type deleted'); }}
                          onToggle={async (id, checked) => { await supabase.from('order_types').update({ active: checked }).eq('id', id); qc.invalidateQueries({ queryKey: ['order-types-admin'] }); }}
                        />
                        <div className="flex gap-2 pl-2">
                          <Select value={ot.input_mode} onValueChange={async (val) => {
                            const update: any = { input_mode: val };
                            if (val === 'text') update.source_table = null;
                            await supabase.from('order_types').update(update).eq('id', ot.id);
                            qc.invalidateQueries({ queryKey: ['order-types-admin'] });
                          }}>
                            <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              <SelectItem value="text" className="text-foreground font-body text-xs">Text</SelectItem>
                              <SelectItem value="select" className="text-foreground font-body text-xs">Dropdown</SelectItem>
                            </SelectContent>
                          </Select>
                          {ot.input_mode === 'select' && (
                            <Select value={ot.source_table || ''} onValueChange={async (val) => {
                              await supabase.from('order_types').update({ source_table: val }).eq('id', ot.id);
                              qc.invalidateQueries({ queryKey: ['order-types-admin'] });
                            }}>
                              <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8 w-36">
                                <SelectValue placeholder="Source table" />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border">
                                <SelectItem value="units" className="text-foreground font-body text-xs">Rooms/Units</SelectItem>
                                <SelectItem value="resort_tables" className="text-foreground font-body text-xs">Tables</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-3">
                      <Input value={newOrderType} onChange={e => setNewOrderType(e.target.value)} placeholder="New order type label"
                        className="bg-secondary border-border text-foreground font-body" />
                      <Button onClick={addOrderType} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </section>

                <section className="mt-8">
                  <h3 className="font-display text-sm tracking-wider text-foreground mb-4">Menu Categories</h3>
                  <div className="space-y-2">
                    {menuCategories.map((cat: any) => (
                      <div key={cat.id} className="flex items-center gap-2">
                        <div className="flex-1">
                          <EditableRow id={cat.id} name={cat.name} active={cat.active}
                            onRename={async (id, newName) => { await supabase.from('menu_categories').update({ name: newName }).eq('id', id); qc.invalidateQueries({ queryKey: ['menu-categories-admin'] }); toast.success('Category renamed'); }}
                            onDelete={async (id) => { await supabase.from('menu_categories').delete().eq('id', id); qc.invalidateQueries({ queryKey: ['menu-categories-admin'] }); toast.success('Category deleted'); }}
                            onToggle={async (id, checked) => { await supabase.from('menu_categories').update({ active: checked }).eq('id', id); qc.invalidateQueries({ queryKey: ['menu-categories-admin'] }); }}
                          />
                        </div>
                        <Select value={(cat as any).department || 'kitchen'} onValueChange={async (val) => {
                          await supabase.from('menu_categories').update({ department: val } as any).eq('id', cat.id);
                          qc.invalidateQueries({ queryKey: ['menu-categories-admin'] });
                          toast.success('Department updated');
                        }}>
                          <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8 w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            <SelectItem value="kitchen" className="text-foreground font-body text-xs">Kitchen</SelectItem>
                            <SelectItem value="bar" className="text-foreground font-body text-xs">Bar</SelectItem>
                            <SelectItem value="both" className="text-foreground font-body text-xs">Both</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-3">
                      <Input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="New category name"
                        className="bg-secondary border-border text-foreground font-body" />
                      <Button onClick={addCategory} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </section>
                <div className="mt-8"><DeviceManager /></div>
                <div className="mt-8"><RoomSetup /></div>
                <div className="mt-8"><HousekeepingConfig /></div>
                <div className="mt-8"><StaffAccessManager /></div>
                <div className="mt-8"><EmployeeContactConfig /></div>
              </div>
            </TabsContent>
          )}

          {/* MENU TAB */}
          {(isAdmin || hasAccess(perms, 'menu')) && (
            <TabsContent value="menu" className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={menuSearch}
                  onChange={e => setMenuSearch(e.target.value)}
                  placeholder="Search menu items..."
                  className="bg-secondary border-border text-foreground font-body pl-9"
                />
              </div>
              {!readOnly('menu') && (
                <div className="flex gap-2">
                  <Button onClick={openNewItem} className="font-display tracking-wider flex-1" variant="outline">
                    <Plus className="w-4 h-4 mr-2" /> Add Menu Item
                  </Button>
                  <Button variant="outline" onClick={() => setBulkImportOpen(true)} title="Bulk Import">
                    <Upload className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      let csv = 'Category,Name,Description,Price,Food Cost\n';
                      menuItems.forEach(item => {
                        csv += `\"${item.category}\",\"${item.name}\",\"${(item.description || '').replace(/"/g, '""')}\",${item.price},${item.food_cost || 0}\n`;
                      });
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `menu-items-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <MenuBulkImportModal
                open={bulkImportOpen}
                onOpenChange={setBulkImportOpen}
                onComplete={() => qc.invalidateQueries({ queryKey: ['menu-admin'] })}
                categories={menuCategories.map((c: any) => c.name)}
              />
              {menuItems
                .filter(item => {
                  if (!menuSearch.trim()) return true;
                  const q = menuSearch.toLowerCase();
                  return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
                })
                .map(item => {
                  const foodCost = item.food_cost || 0;
                  const margin = item.price > 0 && foodCost > 0
                    ? Math.round(((item.price - foodCost) / item.price) * 100)
                    : null;
                  return (
                    <button key={item.id} onClick={() => !readOnly('menu') ? openEditItem(item) : null}
                      className="w-full text-left p-3 border border-border hover:border-primary/50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-display text-sm text-foreground">{item.name}</p>
                          <div className="flex items-center gap-2">
                            <p className="font-body text-xs text-muted-foreground">{item.category}</p>
                            <span className={`font-body text-[10px] px-1.5 py-0.5 rounded ${
                              (item as any).department === 'bar' ? 'bg-purple-500/20 text-purple-400' :
                              (item as any).department === 'both' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-orange-500/20 text-orange-400'
                            }`}>
                              {((item as any).department || 'kitchen')}
                            </span>
                            {foodCost > 0 ? (
                              <span className="font-body text-xs text-muted-foreground">
                                · Cost ₱{foodCost} · {margin}% margin
                              </span>
                            ) : (
                              <span className="font-body text-xs text-amber-400">· No cost data</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-sm text-foreground">₱{item.price}</p>
                          {!item.available && <span className="font-body text-xs text-destructive">Unavailable</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </TabsContent>
          )}

          {/* REPORTS TAB */}
          {(isAdmin || hasAccess(perms, 'reports')) && (
            <TabsContent value="reports">
              <ReportsDashboard readOnly={readOnly('reports')} />
            </TabsContent>
          )}

          {/* INVENTORY TAB */}
          {(isAdmin || hasAccess(perms, 'inventory')) && (
            <TabsContent value="inventory">
              <InventoryDashboard readOnly={readOnly('inventory')} />
            </TabsContent>
          )}

          {/* GUEST SERVICES TAB */}
          {(isAdmin || hasAccess(perms, 'experiences') || hasAccess(perms, 'reception')) && (
            <TabsContent value="guest-services">
              <ExperiencesPage embedded />
            </TabsContent>
          )}

          {/* RESORT OPS TAB */}
          {(isAdmin || hasAccess(perms, 'resort_ops')) && (
            <TabsContent value="resort-ops">
              <ResortOpsDashboard readOnly={readOnly('resort_ops')} />
            </TabsContent>
          )}

          {/* AUDIT LOG TAB */}
          {isAdmin && (
            <TabsContent value="audit">
              <AuditLogView />
            </TabsContent>
          )}

          {/* ORDER ARCHIVE TAB */}
          {isAdmin && (
            <TabsContent value="archive">
              <OrderArchive />
            </TabsContent>
          )}

          {/* GUEST PORTAL CONFIG TAB */}
          {isAdmin && (
            <TabsContent value="guest-portal">
              <GuestPortalConfig />
            </TabsContent>
          )}

          {/* LIVE OPS TAB */}
          {isAdmin && (
            <TabsContent value="live-ops">
              <LiveOpsDashboard />
            </TabsContent>
          )}

          {/* INTEGRATION READINESS TAB (dev only) */}
          {import.meta.env.DEV && isAdmin && (
            <TabsContent value="integration">
              <IntegrationReadinessDashboard />
            </TabsContent>
          )}
        </Tabs>
      </div>
      <AgentChatPanel />

      {/* Menu item edit dialog */}
      <Dialog open={!!editItem} onOpenChange={() => { setEditItem(null); setConfirmingDelete(false); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider">
              {editItem === 'new' ? 'New Item' : 'Edit Item'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Name" className="bg-secondary border-border text-foreground font-body" />
            <Select value={itemForm.category} onValueChange={v => setItemForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border max-h-60">
                {menuCategories.filter((c: any) => c.active).map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.name} className="font-body text-foreground">{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description" className="bg-secondary border-border text-foreground font-body" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs text-muted-foreground">Price (₱)</label>
                <Input value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))}
                  type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Food Cost Override (₱)</label>
                <Input value={itemForm.food_cost} onChange={e => setItemForm(f => ({ ...f, food_cost: e.target.value }))}
                  type="number" placeholder="Leave empty for auto"
                  className="bg-secondary border-border text-foreground font-body mt-1" />
                <p className="font-body text-[10px] text-muted-foreground mt-0.5">Only fill this to ignore recipe calculation</p>
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Sort Order</label>
              <Input value={itemForm.sort_order} onChange={e => setItemForm(f => ({ ...f, sort_order: e.target.value }))}
                type="number" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Department</label>
              <Select value={itemForm.department} onValueChange={v => setItemForm(f => ({ ...f, department: v }))}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="kitchen" className="text-foreground font-body">Kitchen</SelectItem>
                  <SelectItem value="bar" className="text-foreground font-body">Bar</SelectItem>
                  <SelectItem value="both" className="text-foreground font-body">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editItem && editItem !== 'new' && (
              <div className="pt-3 border-t border-border">
                <RecipeEditor
                  menuItemId={editItem.id}
                  hasOverride={!!itemForm.food_cost && parseFloat(itemForm.food_cost) > 0 && parseFloat(itemForm.food_cost) !== recipeCost}
                  onFoodCostUpdate={(cost) => setRecipeCost(cost)}
                />
              </div>
            )}
            {editItem && editItem !== 'new' && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="font-body text-sm text-foreground">Available</span>
                <Switch checked={editItem.available}
                  onCheckedChange={async (checked) => {
                    await supabase.from('menu_items').update({ available: checked }).eq('id', editItem.id);
                    qc.invalidateQueries({ queryKey: ['menu-admin'] });
                    setEditItem({ ...editItem, available: checked });
                  }}
                />
              </div>
            )}
            <Button onClick={saveItem} className="font-display tracking-wider w-full">Save</Button>
            {editItem && editItem !== 'new' && (
              <Button
                variant="destructive"
                onClick={deleteItem}
                className={`font-display tracking-wider w-full ${confirmingDelete ? 'animate-pulse' : ''}`}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {confirmingDelete ? 'Confirm Delete?' : 'Delete Item'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Items Dialog */}
      <Dialog open={!!addingToOrder} onOpenChange={() => setAddingToOrder(null)}>
        <DialogContent className="bg-card border-border max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider text-center">
              Add Items to Order
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-1 pb-2">
            {menuCategories.filter((c: any) => c.active).map((cat: any) => (
              <button key={cat.id} onClick={() => setAddCat(cat.name)}
                className={`font-display text-xs tracking-wider px-3 py-1.5 rounded-full transition-colors ${
                  activeCat === cat.name
                    ? 'bg-primary/20 text-primary border border-primary/40'
                    : 'text-muted-foreground border border-transparent hover:text-foreground'
                }`}>
                {cat.name}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {catItems.map((item: any) => {
              const inCart = addCart[item.id];
              return (
                <div key={item.id} className="flex items-center justify-between py-2 px-1">
                  <div className="flex-1 min-w-0">
                    <span className="font-display text-sm text-foreground block">{item.name}</span>
                    <span className="font-display text-xs text-primary">₱{item.price.toLocaleString()}</span>
                  </div>
                  {inCart ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        const q = inCart.qty - 1;
                        if (q <= 0) { const c = { ...addCart }; delete c[item.id]; setAddCart(c); }
                        else setAddCart({ ...addCart, [item.id]: { ...inCart, qty: q } });
                      }} className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-display text-sm text-foreground w-5 text-center">{inCart.qty}</span>
                      <button onClick={() => setAddCart({ ...addCart, [item.id]: { ...inCart, qty: inCart.qty + 1 } })}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setAddCart({ ...addCart, [item.id]: { name: item.name, price: item.price, qty: 1 } })}
                      className="w-8 h-8 rounded-full border border-primary/40 flex items-center justify-center text-primary">
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {addCartTotal > 0 && (
            <Button onClick={handleSubmitAddItems} className="w-full font-display tracking-wider py-5">
              Add ₱{addCartTotal.toLocaleString()} to Order
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Tab Invoice Dialog */}
      <Dialog open={!!viewingTabId} onOpenChange={() => setViewingTabId(null)}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
          {viewingTabId && (
            <TabInvoice tabId={viewingTabId} onClose={() => setViewingTabId(null)} isAdmin={isAdmin} />
          )}
        </DialogContent>
      </Dialog>
    </LuxuryShell>
  );
};

export default AdminPage;
