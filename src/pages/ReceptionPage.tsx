import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ArrowLeft, LogIn, LogOut, DollarSign, BedDouble, MapPin, Car, Bike, Palmtree, UtensilsCrossed, ClipboardList, Sparkles, Receipt, ChevronDown, ChevronUp, CheckCircle, Clock, ShieldCheck, Eye, AlertTriangle, MessageSquare, Users, PlaneTakeoff, Cloud, Bell, ChevronRight, CalendarPlus, UserPlus, BarChart3, Package } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import RoomsDashboard from '@/components/admin/RoomsDashboard';
import ClosedCheckoutsPanel from '@/components/rooms/ClosedCheckoutsPanel';
import AddPaymentModal from '@/components/rooms/AddPaymentModal';
import HousekeeperPickerModal from '@/components/rooms/HousekeeperPickerModal';

import HousekeepingInspection from '@/components/admin/HousekeepingInspection';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useRoomTransactions } from '@/hooks/useRoomTransactions';
import { logAudit } from '@/lib/auditLog';
import { canEdit, canManage, hasAccess } from '@/lib/permissions';
import { resolveOperationalUnitWorkflow } from '@/lib/receptionOccupancy';
import ReceptionCalendar from '@/components/reception/ReceptionCalendar';
import RoomBillingTab from '@/components/rooms/RoomBillingTab';
import { LuxuryShell, LuxuryHeader, LuxuryStatCard, LuxuryCard } from '@/components/luxury';
import type { BookingWithGuest, ResortUnit } from '@/components/reception/calendarUtils';

/** Get current Manila date string (YYYY-MM-DD) */
const getManilaDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
/** Get current Manila hour (0-23) */
const getManilaHour = () => parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }));
/** Format Manila time as readable string */
const getManilaTimeStr = () => new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

const from = (table: string) => supabase.from(table as any);

/* InlineBill removed – billing is accessible via Details sheet */

/** Compute balance for a unit from transactions */
const useUnitBalance = (unitId: string | null) => {
  const { data: txns = [] } = useRoomTransactions(unitId);
  const totalC = txns.filter(t => t.total_amount > 0).reduce((s, t) => s + t.total_amount, 0);
  const totalP = Math.abs(txns.filter(t => t.total_amount < 0).reduce((s, t) => s + t.total_amount, 0));
  return totalC - totalP;
};

const SESSION_KEY = 'staff_home_session';
const getSession = () => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const s = JSON.parse(stored);
      if (s.expiresAt > Date.now()) return s;
    }
  } catch {}
  return null;
};

const ReceptionPage = ({ embedded = false }: { embedded?: boolean }) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = getSession();
  const perms: string[] = session?.permissions || [];
  const isAdmin = perms.includes('admin');
  const canDoEdit = isAdmin || canEdit(perms, 'reception');
  const canDoManage = isAdmin || canManage(perms, 'reception');
  const hasHousekeepingAccess = isAdmin || hasAccess(perms, 'housekeeping');
  const staffName = session?.name || localStorage.getItem('emp_name') || 'Staff';
  const empId = localStorage.getItem('emp_id');

  const today = getManilaDate();

  // Live Manila clock
  const [manilaTime, setManilaTime] = useState(getManilaTimeStr());
  useEffect(() => {
    const iv = setInterval(() => setManilaTime(getManilaTimeStr()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Early check-in / late check-out fee state
  const [earlyCheckInFee, setEarlyCheckInFee] = useState('');
  const [lateCheckOutFee, setLateCheckOutFee] = useState('');

  // Override sell state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideUnit, setOverrideUnit] = useState<any>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Walk-in modal state
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInUnit, setWalkInUnit] = useState<any>(null);
  const [walkInForm, setWalkInForm] = useState({
    guestName: '', checkIn: today, checkOut: '', adults: '2', children: '0', platform: 'Direct', roomRate: '0', notes: '',
  });
  const [walkingIn, setWalkingIn] = useState(false);

  // Check-in modal state (manage only)
  const [checkInBooking, setCheckInBooking] = useState<any>(null);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  // Check-out modal state
  const [checkOutBooking, setCheckOutBooking] = useState<any>(null);
  const [checkOutUnit, setCheckOutUnit] = useState<any>(null);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [checkOutPayment, setCheckOutPayment] = useState('');
  const [checkOutAmount, setCheckOutAmount] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  // checkOutHousekeeper removed — broadcast mode

  // Add Payment modal state
  const [paymentUnit, setPaymentUnit] = useState<any>(null);
  const [paymentBooking, setPaymentBooking] = useState<any>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  // Housekeeper picker state
  const [hkPickerOpen, setHkPickerOpen] = useState(false);
  const [hkTargetUnit, setHkTargetUnit] = useState<any>(null);

   // (removed expandedOrderIds — orders section removed)

  // Send to clean loading
  const [sendingClean, setSendingClean] = useState<string | null>(null);

  // Housekeeping tracker state
  const [hkTrackerOpen, setHkTrackerOpen] = useState(true);
  const [activeHkOrder, setActiveHkOrder] = useState<any>(null);
  const [acceptingHkOrderId, setAcceptingHkOrderId] = useState<string | null>(null);
  const [forcingReady, setForcingReady] = useState<string | null>(null);

  // Room detail sheet state
  const [detailUnit, setDetailUnit] = useState<any>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  // Hero stat-card → room filter
  const [statusFilter, setStatusFilter] = useState<null | 'occupied' | 'to_clean' | 'ready' | 'all'>(null);

  const scrollToId = (id: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const handleQuickAccess = (action: 'reservation' | 'walkin' | 'rooms' | 'inventory') => {
    if (action === 'reservation') return scrollToId('reception-calendar');
    if (action === 'walkin') return scrollToId('walk-in-section');
    if (action === 'rooms') return scrollToId('current-guests-section');
    if (action === 'inventory') {
      if (isAdmin) navigate('/admin');
      else toast.info('Inventory is available to admins.');
    }
  };
  const handleStatFilter = (key: 'occupied' | 'to_clean' | 'ready' | 'all') => {
    setStatusFilter((prev) => (prev === key ? null : key));
    scrollToId('filtered-rooms-section');
  };
  const hasDocAccess = isAdmin || hasAccess(perms, 'documents');
  const { data: paymentMethods = [] } = usePaymentMethods();

  // Fetch housekeeping employees for checkout picker
  const { data: hkEmployeesForCheckout = [] } = useQuery({
    queryKey: ['housekeeping-employees'],
    queryFn: async () => {
      const { data: perms } = await supabase.from('employee_permissions')
        .select('employee_id')
        .like('permission', 'housekeeping%');
      const hkIds = new Set((perms || []).map((p: any) => p.employee_id));
      const { data: emps } = await supabase.from('employees')
        .select('id, name, display_name, whatsapp_number')
        .eq('active', true)
        .order('name');
      const all = (emps || []) as any[];
      const filtered = all.filter(e => hkIds.has(e.id));
      return filtered.length > 0 ? filtered : all;
    },
  });
  const activePM = paymentMethods.filter(m => m.is_active && m.name !== 'Charge to Room');

  // Compute balance for payment modal
  const paymentBalance = useUnitBalance(paymentUnit?.id || null);

  // Room types (for base rates)
  const { data: roomTypes = [] } = useQuery({
    queryKey: ['room-types'],
    queryFn: async () => {
      const { data } = await supabase.from('room_types').select('*').order('name');
      return (data || []) as any[];
    },
  });

  // Units
  const { data: units = [] } = useQuery({
    queryKey: ['rooms-units'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').eq('active', true).order('unit_name');
      return (data || []).map((u: any) => ({ ...u, name: u.unit_name }));
    },
  });

  // Resort ops units
  const { data: resortUnits = [] } = useQuery({
    queryKey: ['resort-ops-units'],
    queryFn: async () => {
      const { data } = await from('resort_ops_units').select('*');
      return (data || []) as any[];
    },
  });

  // Bookings
  const { data: bookings = [] } = useQuery({
    queryKey: ['rooms-bookings'],
    queryFn: async () => {
      const { data } = await supabase.from('resort_ops_bookings').select('*, resort_ops_guests(*)').order('check_in', { ascending: false });
      return data || [];
    },
  });

  // All housekeeping orders (for tracker)
  const { data: allHkOrders = [] } = useQuery({
    queryKey: ['housekeeping-orders-all'],
    queryFn: async () => {
      const { data } = await from('housekeeping_orders').select('*').order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    refetchInterval: 5000,
  });

  // Derive latest active order per unit
  const latestHkByUnit = new Map<string, any>();
  allHkOrders.filter((o: any) => o.status !== 'completed').forEach((o: any) => {
    if (!latestHkByUnit.has(o.unit_name)) latestHkByUnit.set(o.unit_name, o);
  });
  const activeHkOrders = Array.from(latestHkByUnit.values());

  // Sync activeHkOrder with latest data
  useEffect(() => {
    if (activeHkOrder) {
      const fresh = allHkOrders.find((o: any) => o.id === activeHkOrder.id);
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(activeHkOrder)) {
        setActiveHkOrder(fresh);
      }
    }
  }, [allHkOrders, activeHkOrder]);

   // (Recent room orders query removed — F&B orders handled by Cashier only)

  // Today's tours (guest_tours + tour_bookings)
  const { data: todayTours = [] } = useQuery({
    queryKey: ['reception-tours-today'],
    queryFn: async () => {
      const { data } = await from('guest_tours').select('*').eq('tour_date', today).order('pickup_time');
      return (data || []) as any[];
    },
  });

  const { data: tourBookings = [] } = useQuery({
    queryKey: ['reception-tour-bookings'],
    queryFn: async () => {
      const { data } = await (supabase.from('tour_bookings') as any)
        .select('*')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(20);
      return (data || []) as any[];
    },
  });

  // Guest requests (transport, rentals)
  const { data: guestRequests = [] } = useQuery({
    queryKey: ['reception-guest-requests'],
    queryFn: async () => {
      const { data } = await from('guest_requests').select('*').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(20);
      return (data || []) as any[];
    },
  });

  // Bill disputes
  const { data: allDisputes = [] } = useQuery({
    queryKey: ['reception-bill-disputes'],
    queryFn: async () => {
      const { data } = await from('bill_disputes').select('*').eq('status', 'open').order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Room transactions for checkout
  const { data: checkOutTransactions = [] } = useRoomTransactions(checkOutUnit?.id || null);

  const resolveResortUnit = (roomName: string) =>
    resortUnits.find((ru: any) => ru.name.toLowerCase().trim() === roomName.toLowerCase().trim());

  const getUnitWorkflow = (unit: any) => {
    const resortUnit = resolveResortUnit(unit.name);
    const unitBookings = resortUnit
      ? bookings.filter((b: any) => b.unit_id === resortUnit.id)
      : [];

    return resolveOperationalUnitWorkflow({
      bookings: unitBookings,
      rawStatus: unit.status,
      today,
    });
  };

  const getUnitStatus = (unit: any): 'occupied' | 'to_clean' | 'ready' =>
    getUnitWorkflow(unit).displayStatus;

  const getActiveBooking = (unit: any) => getUnitWorkflow(unit).activeBooking;

  const getTodayArrivalBooking = (unit: any) => getUnitWorkflow(unit).pendingArrival;

  const getTodayDepartureBooking = (unit: any) => getUnitWorkflow(unit).pendingDeparture;

  // Today's arrivals
  const todayArrivals = units
    .map((unit: any) => getTodayArrivalBooking(unit))
    .filter(Boolean);

  // Today's departures
  const todayDepartures = units
    .map((unit: any) => {
      const booking = getTodayDepartureBooking(unit);
      return booking ? { unit, booking } : null;
    })
    .filter(Boolean) as { unit: any; booking: any }[];

  // Week-ahead arrivals (tomorrow through +6 days)
  const tomorrow = addDays(new Date(), 1).toISOString().split('T')[0];
  const weekEnd = addDays(new Date(), 6).toISOString().split('T')[0];
  const weekArrivals = bookings.filter((b: any) => b.check_in > today && b.check_in <= weekEnd)
    .sort((a: any, b: any) => a.check_in.localeCompare(b.check_in));
  const weekDepartures = bookings.filter((b: any) => b.check_out > today && b.check_out <= weekEnd)
    .sort((a: any, b: any) => a.check_out.localeCompare(b.check_out));

  // Group week arrivals by date
  const weekArrivalsByDate = weekArrivals.reduce((acc: Record<string, any[]>, b: any) => {
    if (!acc[b.check_in]) acc[b.check_in] = [];
    acc[b.check_in].push(b);
    return acc;
  }, {} as Record<string, any[]>);

  // Helper: get upcoming booking for a Ready room
  const getUpcomingBooking = (unit: any) => {
    const resortUnit = resolveResortUnit(unit.name);
    if (!resortUnit) return null;
    return bookings.find((b: any) => b.unit_id === resortUnit.id && b.check_in > today && b.check_in <= weekEnd) || null;
  };

  // Occupancy counts
  const occupiedUnits = units.filter((u: any) => getUnitStatus(u) === 'occupied');
  const toCleanUnits = units.filter((u: any) => getUnitStatus(u) === 'to_clean');
  const readyUnits = units.filter((u: any) => getUnitStatus(u) === 'ready');

  // Compute reserved unit IDs for today
  const todayReservedUnitIds = new Set(
    readyUnits.filter((u: any) => getTodayArrivalBooking(u)).map((u: any) => u.id)
  );
  const trulyAvailableUnits = readyUnits.filter((u: any) => !todayReservedUnitIds.has(u.id));
  const reservedTodayUnits = readyUnits.filter((u: any) => todayReservedUnitIds.has(u.id));

  const getUnitNameForBooking = (booking: any) => {
    const ru = resortUnits.find((r: any) => r.id === booking.unit_id);
    return ru?.name || 'Unknown';
  };

  const pendingRequests = guestRequests.filter((r: any) => r.status === 'pending');
  const pendingTourBookings = tourBookings.filter((b: any) => b.status === 'pending');
  const hasPendingAlerts = pendingRequests.length > 0 || pendingTourBookings.length > 0 || allDisputes.length > 0;

  // ── AUDIO CHIME for pending requests/tours ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);

  const playChime = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.4);
    });
  }, []);

  // Unlock AudioContext on first user interaction
  useEffect(() => {
    const unlock = async () => {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      if (audioCtxRef.current.state === 'suspended') {
        try { await audioCtxRef.current.resume(); } catch {}
      }
      if (audioCtxRef.current.state === 'running') {
        audioUnlockedRef.current = true;
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchstart', unlock);
      }
    };
    document.addEventListener('click', unlock, { once: false });
    document.addEventListener('touchstart', unlock, { once: false });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Chime only once when pending alerts first appear
  const prevHasPendingRef = useRef(false);
  useEffect(() => {
    if (hasPendingAlerts && !prevHasPendingRef.current && audioUnlockedRef.current) {
      playChime();
    }
    prevHasPendingRef.current = hasPendingAlerts;
  }, [hasPendingAlerts, playChime]);

  // Display-only mode: do not auto-sync stale occupied state from bookings here.
  useEffect(() => {
    return;
  }, []);

  // Realtime subscriptions for guest_requests and tour_bookings
  useEffect(() => {
    const channel = supabase
      .channel('reception-alerts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_requests' }, () => {
        qc.invalidateQueries({ queryKey: ['reception-guest-requests'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_tours' }, () => {
        qc.invalidateQueries({ queryKey: ['reception-tours-today'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_bookings' }, () => {
        qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_disputes' }, () => {
        qc.invalidateQueries({ queryKey: ['reception-bill-disputes'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'booked': return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'confirmed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'completed': return 'bg-muted text-muted-foreground';
      case 'cancelled': return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'pending': return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // ── TOUR/REQUEST ACTION HANDLERS ──
  const parsePriceFromDetails = (details: string): number => {
    const match = details.match(/₱([\d,]+)/);
    return match ? Number(match[1].replace(/,/g, '')) : 0;
  };

  const getRoomInfo = async (roomId: string) => {
    const { data } = await supabase.from('units').select('id, unit_name').eq('id', roomId).maybeSingle();
    return data;
  };

  const updateTourStatus = async (id: string, status: string, tour?: any) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await from('guest_tours').update({ status, confirmed_by: staffName }).eq('id', id);

    // Room charge is handled solely by RoomBillingTab to avoid duplicate transactions

    // Sync status to tour_bookings if a matching record exists
    if (tour && (status === 'cancelled' || status === 'completed')) {
      await (supabase.from('tour_bookings') as any)
        .update({ status, confirmed_by: staffName })
        .eq('tour_name', tour.tour_name)
        .eq('tour_date', tour.tour_date)
        .eq('guest_name', tour.unit_name || '');
    }

    qc.invalidateQueries({ queryKey: ['reception-tours-today'] });
    qc.invalidateQueries({ queryKey: ['tours-board'] });
    toast.success(`Tour ${status}`);
  };

  const confirmTourBooking = async (b: any) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await (supabase.from('tour_bookings') as any).update({
      status: 'confirmed',
      confirmed_by: staffName,
    }).eq('id', b.id);

    qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
    toast.success('Tour booking confirmed');
  };

  const cancelTourBooking = async (id: string) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await (supabase.from('tour_bookings') as any).update({
      status: 'cancelled',
      confirmed_by: staffName,
    }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
    qc.invalidateQueries({ queryKey: ['tours-board'] });
    toast.success('Tour booking cancelled');
  };

  const completeTourBooking = async (b: any) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await (supabase.from('tour_bookings') as any).update({ status: 'completed' }).eq('id', b.id);

    // Insert room charge on completion
    if (Number(b.price) > 0 && b.room_id) {
      const room = await getRoomInfo(b.room_id);
      await (supabase.from('room_transactions') as any).insert({
        unit_id: b.room_id,
        unit_name: room?.unit_name || '',
        booking_id: b.booking_id,
        guest_name: b.guest_name || '',
        transaction_type: 'tour',
        amount: Number(b.price),
        tax_amount: 0,
        service_charge_amount: 0,
        total_amount: Number(b.price),
        payment_method: 'Charge to Room',
        staff_name: staffName,
        notes: `Tour: ${b.tour_name} (${b.pax} pax) on ${b.tour_date}${b.pickup_time ? ` pickup ${b.pickup_time}` : ''}`,
      });
    }

    qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
    toast.success('Tour completed & charged to room');
  };

  const updateRequestStatus = async (id: string, status: string, req?: any) => {
    if (!canDoEdit) { toast.error('View-only access'); return; }
    await from('guest_requests').update({ status, confirmed_by: staffName }).eq('id', id);

    // Insert room charge when confirming a request with a price
    if (status === 'confirmed' && req) {
      const price = parsePriceFromDetails(req.details);
      if (price > 0 && req.room_id) {
        const room = await getRoomInfo(req.room_id);
        await (supabase.from('room_transactions') as any).insert({
          unit_id: req.room_id,
          unit_name: room?.unit_name || '',
          booking_id: req.booking_id,
          guest_name: req.guest_name || '',
          transaction_type: 'charge',
          amount: price,
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: price,
          payment_method: 'Charge to Room',
          staff_name: staffName,
          notes: `${req.request_type}: ${req.details}`,
        });
      }
    }

    qc.invalidateQueries({ queryKey: ['reception-guest-requests'] });
    toast.success(`Request ${status}`);
  };

  // ── FORCE READY (manage only) ──
  const handleForceReady = async (unit: any) => {
    if (!canDoManage) { toast.error('Manage access required'); return; }
    setForcingReady(unit.id);
    try {
      await supabase.from('units').update({ status: 'ready' } as any).eq('id', unit.id);
      // Complete any active housekeeping orders for this unit
      const hkOrder = activeHkOrders.find((o: any) => o.unit_name === unit.name);
      if (hkOrder) {
        await from('housekeeping_orders').update({
          status: 'completed',
          cleaning_notes: `Force-marked ready by ${staffName}`,
          completed_by_name: staffName,
          cleaning_completed_at: new Date().toISOString(),
        } as any).eq('id', hkOrder.id);
      }
      await logAudit('updated', 'units', unit.id, `Force-marked ${unit.name} as Ready by ${staffName}`);
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      toast.success(`${unit.name} marked as Ready`);
    } catch {
      toast.error('Failed to mark ready');
    } finally {
      setForcingReady(null);
    }
  };

  // ── HOUSEKEEPING ACCEPT (for multi-role staff) ──
  const handleHkAccept = async (employee: { id: string; name: string; display_name: string }) => {
    if (!acceptingHkOrderId) return;
    try {
      await from('housekeeping_orders').update({
        accepted_by: employee.id,
        accepted_by_name: employee.display_name || employee.name,
        accepted_at: new Date().toISOString(),
        status: 'pending_inspection',
      } as any).eq('id', acceptingHkOrderId);
      localStorage.setItem('emp_id', employee.id);
      localStorage.setItem('emp_name', employee.name);
      qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      toast.success(`Accepted — ${employee.display_name || employee.name}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept');
    }
    setAcceptingHkOrderId(null);
  };


  const handleReservationCheckIn = async () => {
    if (!checkInBooking) return;
    setCheckingIn(true);
    try {
      const unitName = getUnitNameForBooking(checkInBooking);
      const unit = units.find((u: any) => u.name === unitName);
      if (!unit) throw new Error('Unit not found');
      if (getUnitStatus(unit) === 'to_clean') throw new Error('Complete housekeeping first');

      const guestFullName = checkInBooking.resort_ops_guests?.full_name || '';
      const roomPassword = guestFullName.split(' ').pop()?.toLowerCase() || 'guest';
      const expiresAt = new Date(checkInBooking.check_out);
      expiresAt.setDate(expiresAt.getDate() + 1);

      await from('resort_ops_bookings').update({
        room_password: roomPassword,
        password_expires_at: expiresAt.toISOString(),
        checked_in_at: new Date().toISOString(),
        checked_out_at: null,
      }).eq('id', checkInBooking.id);

      await supabase.from('units').update({ status: 'occupied' } as any).eq('id', unit.id);

      // Early check-in fee
      const earlyFee = parseFloat(earlyCheckInFee) || 0;
      if (earlyFee > 0) {
        await (from('room_transactions') as any).insert({
          unit_id: unit.id,
          unit_name: unitName,
          guest_name: guestFullName,
          booking_id: checkInBooking.id,
          transaction_type: 'charge',
          amount: earlyFee,
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: earlyFee,
          payment_method: '',
          staff_name: staffName,
          notes: 'Early check-in fee',
        });
        await logAudit('created', 'room_transactions', unit.id, `Early check-in fee: ₱${earlyFee.toLocaleString()} for ${guestFullName} in ${unitName}`);
      }

      // ── Auto-post accommodation charge (skip for OTA-prepaid bookings) ──
      const roomRate = Number(checkInBooking.room_rate) || 0;
      const nights = Math.max(1, Math.ceil((new Date(checkInBooking.check_out).getTime() - new Date(checkInBooking.check_in).getTime()) / 86400000));
      const otaPlatforms = ['booking.com', 'airbnb', 'agoda', 'expedia', 'hostelworld', 'trip.com'];
      const isOtaBooking = checkInBooking.platform && otaPlatforms.includes(checkInBooking.platform.toLowerCase());
      if (roomRate > 0 && !isOtaBooking) {
        const accomTotal = nights * roomRate;
        await (from('room_transactions') as any).insert({
          unit_id: unit.id,
          unit_name: unitName,
          guest_name: guestFullName,
          booking_id: checkInBooking.id,
          transaction_type: 'accommodation',
          amount: accomTotal,
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: accomTotal,
          payment_method: '',
          staff_name: staffName,
          notes: `${nights} night${nights !== 1 ? 's' : ''} × ₱${roomRate.toLocaleString()}/night`,
        });

      }

      await logAudit('created', 'units', unit.id, `Check-in: ${checkInBooking.resort_ops_guests?.full_name} to ${unitName}${earlyFee > 0 ? ` (early fee: ₱${earlyFee})` : ''}${roomRate > 0 ? ` — ${nights} nights × ₱${roomRate.toLocaleString()}` : ''}`);

      // Telegram notification
      import('@/lib/telegram').then(({ notifyTelegram }) => {
        notifyTelegram('reception,managers', `🏨 Check-in\n${checkInBooking.resort_ops_guests?.full_name || 'Guest'} - ${unitName}\n${nights} night${nights !== 1 ? 's' : ''}`);
      });

      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['morning-briefing'] });
      qc.invalidateQueries({ queryKey: ['room-transactions', unit.id] });
      setCheckInModalOpen(false);
      setCheckInBooking(null);
      setEarlyCheckInFee('');
      toast.success(`Checked in to ${unitName}. Room password: ${roomPassword}`, { duration: 10000 });
    } catch (err: any) {
      toast.error(err.message || 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  // ── WALK-IN CHECK-IN (edit level) ──
  const handleWalkIn = async () => {
    if (!walkInUnit || !walkInForm.guestName.trim() || !walkInForm.checkOut) {
      toast.error('Guest name and check-out date required');
      return;
    }
    // Conflict check: ensure no overlapping booking for this unit
    const resortUnitForCheck = resolveResortUnit(walkInUnit.name);
    if (resortUnitForCheck) {
      const conflicting = (bookings as any[]).find((b: any) =>
        b.unit_id === resortUnitForCheck.id &&
        b.check_in < walkInForm.checkOut &&
        b.check_out > walkInForm.checkIn
      );
      if (conflicting) {
        const conflictGuest = (conflicting as any).resort_ops_guests?.full_name || conflicting.platform || 'another guest';
        toast.error(`Double booking! ${walkInUnit.name} is already booked by ${conflictGuest} (${conflicting.check_in} to ${conflicting.check_out}). Delete that booking first or pick another room.`);
        return;
      }
    }
    setWalkingIn(true);
    try {
      const { data: existing } = await from('resort_ops_guests')
        .select('id').ilike('full_name', walkInForm.guestName.trim()).maybeSingle() as any;

      let gId: string;
      if (existing) {
        gId = existing.id;
      } else {
        const { data: newG, error: gErr } = await from('resort_ops_guests').insert({
          full_name: walkInForm.guestName.trim(),
        }).select('id').single() as any;
        if (gErr || !newG) throw new Error('Failed to create guest');
        gId = newG.id;
      }

      let resortUnit = resolveResortUnit(walkInUnit.name);
      if (!resortUnit) {
        const { data: newU } = await from('resort_ops_units').insert({
          name: walkInUnit.name, type: 'room', capacity: 2,
        }).select('id').single() as any;
        if (!newU) throw new Error('Failed to create unit mapping');
        resortUnit = { id: newU.id };
        qc.invalidateQueries({ queryKey: ['resort-ops-units'] });
      }

      const roomPassword = walkInForm.guestName.trim().split(' ').pop()?.toLowerCase() || 'guest';
      const expiresAt = new Date(walkInForm.checkOut);
      expiresAt.setDate(expiresAt.getDate() + 1);

      await from('resort_ops_bookings').insert({
        guest_id: gId,
        unit_id: resortUnit.id,
        platform: walkInForm.platform,
        check_in: walkInForm.checkIn,
        check_out: walkInForm.checkOut,
        checked_in_at: new Date().toISOString(),
        adults: parseInt(walkInForm.adults) || 1,
        children: parseInt(walkInForm.children) || 0,
        room_rate: parseFloat(walkInForm.roomRate) || 0,
        notes: walkInForm.notes || '',
        room_password: roomPassword,
        password_expires_at: expiresAt.toISOString(),
      });

      await supabase.from('units').update({ status: 'occupied' } as any).eq('id', walkInUnit.id);

      // ── Auto-post accommodation charge for walk-in (skip for OTA platforms) ──
      const walkInRate = parseFloat(walkInForm.roomRate) || 0;
      const walkInOtaPlatforms = ['booking.com', 'airbnb', 'agoda', 'expedia', 'hostelworld', 'trip.com'];
      const isWalkInOta = walkInForm.platform && walkInOtaPlatforms.includes(walkInForm.platform.toLowerCase());
      const walkInNights = Math.max(1, Math.ceil((new Date(walkInForm.checkOut).getTime() - new Date(walkInForm.checkIn).getTime()) / 86400000));
      const { data: newBookings } = await from('resort_ops_bookings')
        .select('id')
        .eq('guest_id', gId)
        .eq('unit_id', resortUnit.id)
        .eq('check_in', walkInForm.checkIn)
        .order('created_at', { ascending: false })
        .limit(1) as any;
      const newBookingId = newBookings?.[0]?.id || null;

      if (walkInRate > 0 && newBookingId && !isWalkInOta) {
        const accomTotal = walkInNights * walkInRate;
        await (from('room_transactions') as any).insert({
          unit_id: walkInUnit.id,
          unit_name: walkInUnit.name,
          guest_name: walkInForm.guestName.trim(),
          booking_id: newBookingId,
          transaction_type: 'accommodation',
          amount: accomTotal,
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: accomTotal,
          payment_method: '',
          staff_name: staffName,
          notes: `${walkInNights} night${walkInNights !== 1 ? 's' : ''} × ₱${walkInRate.toLocaleString()}/night`,
        });
      }

      await logAudit('created', 'units', walkInUnit.id, `Walk-in check-in: ${walkInForm.guestName.trim()} to ${walkInUnit.name}${walkInRate > 0 ? ` — ${walkInNights} nights × ₱${walkInRate.toLocaleString()}` : ''}`);

      // Telegram notification
      import('@/lib/telegram').then(({ notifyTelegram }) => {
        notifyTelegram('reception,managers', `🏨 Check-in\n${walkInForm.guestName.trim()} - ${walkInUnit.name}\n${walkInNights} night${walkInNights !== 1 ? 's' : ''}`);
      });

      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['room-transactions', walkInUnit.id] });
      setWalkInOpen(false);
      setWalkInUnit(null);
      setWalkInForm({ guestName: '', checkIn: today, checkOut: '', adults: '2', children: '0', platform: 'Direct', roomRate: '0', notes: '' });
      toast.success(`Walk-in checked in to ${walkInUnit.name}. Password: ${roomPassword}`, { duration: 10000 });
    } catch (err: any) {
      toast.error(err.message || 'Walk-in failed');
    } finally {
      setWalkingIn(false);
    }
  };

  // ── SEND TO CLEAN (broadcast to all housekeepers) ──
  const handleSendToClean = async (unit: any, assignedTo?: string, assignedName?: string) => {
    setSendingClean(unit.id);
    try {
      await supabase.from('units').update({ status: 'to_clean' } as any).eq('id', unit.id);
      const existing = activeHkOrders.find((o: any) => o.unit_name === unit.name);
      if (!existing) {
        await from('housekeeping_orders').insert({
          unit_name: unit.name,
          room_type_id: (unit as any).room_type_id || null,
          status: 'pending_inspection',
          assigned_to: assignedTo || null,
          accepted_by: assignedTo || null,
          accepted_by_name: assignedName || '',
          accepted_at: assignedTo ? new Date().toISOString() : null,
        });
      } else if (assignedTo) {
        await from('housekeeping_orders').update({
          assigned_to: assignedTo,
          accepted_by: assignedTo,
          accepted_by_name: assignedName || '',
          accepted_at: new Date().toISOString(),
        }).eq('id', existing.id);
      }

      await logAudit('updated', 'units', unit.id, `Sent ${unit.name} to clean${assignedName ? ` (assigned: ${assignedName})` : ' (broadcast)'}`);
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      toast.success(`${unit.name} sent to housekeeping${assignedName ? ` (${assignedName})` : ''}`);
    } catch {
      toast.error('Failed to send to clean');
    } finally {
      setSendingClean(null);
    }
  };

  // ── CHECK-OUT ──

  const handleCheckOut = async () => {
    if (!checkOutBooking || !checkOutUnit) return;
    setCheckingOut(true);
    try {
      const finalAmount = parseFloat(checkOutAmount) || 0;
      if (finalAmount > 0 && checkOutPayment) {
        await (from('room_transactions') as any).insert({
          unit_id: checkOutUnit.id,
          unit_name: checkOutUnit.name,
          guest_name: checkOutBooking.resort_ops_guests?.full_name,
          booking_id: checkOutBooking.id,
          transaction_type: 'payment',
          amount: -finalAmount,
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: -finalAmount,
          payment_method: checkOutPayment,
          staff_name: staffName,
          notes: 'Final checkout payment',
        });
      }

      // Late check-out fee
      const lateFee = parseFloat(lateCheckOutFee) || 0;
      if (lateFee > 0) {
        await (from('room_transactions') as any).insert({
          unit_id: checkOutUnit.id,
          unit_name: checkOutUnit.name,
          guest_name: checkOutBooking.resort_ops_guests?.full_name,
          booking_id: checkOutBooking.id,
          transaction_type: 'charge',
          amount: lateFee,
          tax_amount: 0,
          service_charge_amount: 0,
          total_amount: lateFee,
          payment_method: '',
          staff_name: staffName,
          notes: 'Late check-out fee',
        });
        await logAudit('created', 'room_transactions', checkOutUnit.id, `Late check-out fee: ₱${lateFee.toLocaleString()} for ${checkOutBooking.resort_ops_guests?.full_name} in ${checkOutUnit.name}`);
      }

      await from('resort_ops_bookings').update({
        check_out: today,
        checked_out_at: new Date().toISOString(),
      }).eq('id', checkOutBooking.id);
      await supabase.from('units').update({ status: 'to_clean' } as any).eq('id', checkOutUnit.id);

      // Telegram notification
      import('@/lib/telegram').then(({ notifyTelegram }) => {
        const gName = checkOutBooking.resort_ops_guests?.full_name || 'Guest';
        notifyTelegram('reception,managers', `🚪 Check-out\n${gName} - ${checkOutUnit.name}`);
      });

      const existing = activeHkOrders.find((o: any) => o.unit_name === checkOutUnit.name);

      if (!existing) {
        await from('housekeeping_orders').insert({
          unit_name: checkOutUnit.name,
          room_type_id: (checkOutUnit as any).room_type_id || null,
          status: 'pending_inspection',
          assigned_to: null,
          accepted_by: null,
          accepted_by_name: '',
          accepted_at: null,
        });
      }

      // Cancel any pending guest requests & tours for this booking
      if (checkOutBooking.id) {
        await (from('guest_requests') as any)
          .update({ status: 'cancelled' })
          .eq('booking_id', checkOutBooking.id)
          .eq('status', 'pending');
        await (from('guest_tours') as any)
          .update({ status: 'cancelled' })
          .eq('booking_id', checkOutBooking.id)
          .eq('status', 'pending');
      }

      await logAudit('updated', 'units', checkOutUnit.id, `Checkout: ${checkOutBooking.resort_ops_guests?.full_name} from ${checkOutUnit.name} — housekeeping broadcast`);

      qc.invalidateQueries({ queryKey: ['room-transactions', checkOutUnit.id] });
      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
      qc.invalidateQueries({ queryKey: ['all-requests-experiences'] });
      qc.invalidateQueries({ queryKey: ['all-tours-experiences'] });
      qc.invalidateQueries({ queryKey: ['tour-bookings-experiences'] });
      qc.invalidateQueries({ queryKey: ['reception-guest-requests'] });
      qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
      qc.invalidateQueries({ queryKey: ['reception-tours-today'] });
      qc.invalidateQueries({ queryKey: ['occupied-guests'] });

      setCheckOutOpen(false);
      setCheckOutBooking(null);
      setCheckOutUnit(null);
      setLateCheckOutFee('');
      toast.success('Checkout complete — housekeepers notified');
    } catch {
      toast.error('Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  };

  // Checkout billing
  const charges = checkOutTransactions.filter(t => t.total_amount > 0);
  const payments = checkOutTransactions.filter(t => t.total_amount < 0);
  const totalCharges = charges.reduce((s, t) => s + t.total_amount, 0);
  const totalPayments = Math.abs(payments.reduce((s, t) => s + t.total_amount, 0));
  const balance = totalCharges - totalPayments;

  const hour = getManilaHour();
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const totalRooms = units.length || 1;
  const occPct = Math.round((occupiedUnits.length / totalRooms) * 100);

  // Donut geometry (SVG)
  const donutR = 42;
  const donutC = 2 * Math.PI * donutR;
  const segOcc = (occupiedUnits.length / totalRooms) * donutC;
  const segClean = (toCleanUnits.length / totalRooms) * donutC;
  const segReady = (readyUnits.length / totalRooms) * donutC;

  // Recent activity (derived from already-loaded data, no new query)
  const recentActivity: { icon: any; title: string; subtitle: string; when: string }[] = [
    ...todayDepartures.slice(0, 2).map(({ unit, booking }) => ({
      icon: LogOut,
      title: `${unit.name}`,
      subtitle: `Departure · ${(booking as any)?.resort_ops_guests?.full_name || 'Guest'}`,
      when: 'Today',
    })),
    ...todayArrivals.slice(0, 2).map((b: any) => ({
      icon: LogIn,
      title: `Reservation #${(b.id || '').slice(0, 4).toUpperCase()}`,
      subtitle: `Arrival · ${b?.resort_ops_guests?.full_name || 'Guest'}`,
      when: 'Today',
    })),
  ].slice(0, 3);

  const inner = (
    <>
      {!embedded && (
        <header className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <p className="font-body text-[10px] tracking-[0.3em] uppercase text-gold/80 mb-1.5">
              Reception · KAPWA OS
            </p>
            <h1 className="font-serif-display text-3xl sm:text-4xl text-foreground leading-tight">
              Good {timeOfDay}, {staffName} <span className="inline-block">👋</span>
            </h1>
            <p className="font-body text-sm text-muted-foreground mt-1.5">
              Here's what's happening at KAPWA OS · <span className="text-foreground/70">{manilaTime}</span>
            </p>
          </div>
          <div className="shrink-0 luxury-glass rounded-2xl px-3 py-2 flex items-center gap-2.5">
            <Cloud className="h-5 w-5 text-teal" />
            <div className="text-right leading-tight">
              <p className="font-serif-display text-lg text-foreground tabular-nums">28°C</p>
              <p className="font-body text-[10px] text-muted-foreground">San Vicente, Palawan</p>
            </div>
          </div>
        </header>
      )}

      {/* ── Hero stat row — 4 glowing cards (clickable filters) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {([
          { key: 'occupied' as const, tone: 'rose' as const, icon: <BedDouble className="h-4 w-4" />, label: 'Occupied', value: occupiedUnits.length, delta: 'Tap to filter' },
          { key: 'to_clean' as const, tone: 'gold' as const, icon: <Sparkles className="h-4 w-4" />, label: 'To Clean', value: toCleanUnits.length, delta: 'Tap to filter' },
          { key: 'ready' as const, tone: 'emerald' as const, icon: <CheckCircle className="h-4 w-4" />, label: 'Ready', value: readyUnits.length, delta: 'Tap to filter' },
          { key: 'all' as const, tone: 'teal' as const, icon: <BarChart3 className="h-4 w-4" />, label: 'Occupancy', value: `${occPct}%`, delta: 'View all rooms' },
        ]).map((s) => {
          const active = statusFilter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => handleStatFilter(s.key)}
              aria-pressed={active}
              className={`text-left rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${active ? 'ring-2 ring-gold/70 ring-offset-2 ring-offset-background' : ''}`}
            >
              <LuxuryStatCard glow tone={s.tone} icon={s.icon} label={s.label} value={s.value} delta={s.delta} />
            </button>
          );
        })}
      </div>

      {/* ── Arrivals / Departures / Available strip ── */}
      <LuxuryCard className="p-4 sm:p-5 mb-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="font-body text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Arrivals</p>
            <div className="flex items-end justify-between gap-2 mt-2">
              <p className="font-serif-display text-3xl text-foreground tabular-nums leading-none">{todayArrivals.length}</p>
              <Users className="h-5 w-5 text-muted-foreground/70" />
            </div>
            <p className="font-body text-[11px] text-muted-foreground mt-1">Today</p>
          </div>
          <div className="border-x border-border/40 px-4">
            <p className="font-body text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Departures</p>
            <div className="flex items-end justify-between gap-2 mt-2">
              <p className="font-serif-display text-3xl text-foreground tabular-nums leading-none">{todayDepartures.length}</p>
              <PlaneTakeoff className="h-5 w-5 text-muted-foreground/70" />
            </div>
            <p className="font-body text-[11px] text-muted-foreground mt-1">Today</p>
          </div>
          <div>
            <p className="font-body text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Available</p>
            <div className="flex items-end justify-between gap-2 mt-2">
              <p className="font-serif-display text-3xl text-emerald tabular-nums leading-none">{trulyAvailableUnits.length}</p>
              <CheckCircle className="h-5 w-5 text-emerald/70" />
            </div>
            <p className="font-body text-[11px] text-muted-foreground mt-1">{weekArrivals.length} week ahead</p>
          </div>
        </div>
      </LuxuryCard>

      {/* ── Housekeeping overview + Tasks & Alerts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <LuxuryCard className="p-5">
          <p className="font-body text-[10px] tracking-[0.28em] uppercase text-muted-foreground mb-4">Housekeeping Overview</p>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
                <circle cx="60" cy="60" r={donutR} fill="none" stroke="hsl(var(--border) / 0.4)" strokeWidth="10" />
                <circle cx="60" cy="60" r={donutR} fill="none" stroke="hsl(var(--destructive))" strokeWidth="10"
                  strokeDasharray={`${segOcc} ${donutC}`} strokeDashoffset="0" strokeLinecap="butt" />
                <circle cx="60" cy="60" r={donutR} fill="none" stroke="hsl(var(--gold))" strokeWidth="10"
                  strokeDasharray={`${segClean} ${donutC}`} strokeDashoffset={`-${segOcc}`} strokeLinecap="butt" />
                <circle cx="60" cy="60" r={donutR} fill="none" stroke="hsl(var(--emerald))" strokeWidth="10"
                  strokeDasharray={`${segReady} ${donutC}`} strokeDashoffset={`-${segOcc + segClean}`} strokeLinecap="butt" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-serif-display text-2xl text-foreground tabular-nums leading-none">{units.length}</p>
                <p className="font-body text-[9px] tracking-[0.2em] uppercase text-muted-foreground mt-0.5">Total</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald" /><span className="font-body text-foreground tabular-nums w-5">{readyUnits.length}</span><span className="font-body text-muted-foreground">Ready</span></li>
              <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-gold" /><span className="font-body text-foreground tabular-nums w-5">{toCleanUnits.length}</span><span className="font-body text-muted-foreground">To Clean</span></li>
              <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-destructive" /><span className="font-body text-foreground tabular-nums w-5">{occupiedUnits.length}</span><span className="font-body text-muted-foreground">Occupied</span></li>
            </ul>
          </div>
        </LuxuryCard>

        <LuxuryCard className="p-5">
          <p className="font-body text-[10px] tracking-[0.28em] uppercase text-muted-foreground mb-4">Tasks & Alerts</p>
          <ul className="space-y-3">
            <li className="flex items-center gap-3">
              <span className="font-serif-display text-2xl text-destructive tabular-nums w-6">{todayDepartures.length}</span>
              <span className="font-body text-sm text-foreground flex-1">Departures Today</span>
              <AlertTriangle className="h-4 w-4 text-destructive/80" />
            </li>
            <li className="flex items-center gap-3">
              <span className="font-serif-display text-2xl text-gold tabular-nums w-6">{pendingRequests.length}</span>
              <span className="font-body text-sm text-foreground flex-1">Guest Requests</span>
              <MessageSquare className="h-4 w-4 text-gold/80" />
            </li>
            <li className="flex items-center gap-3">
              <span className="font-serif-display text-2xl text-emerald tabular-nums w-6">{pendingTourBookings.length}</span>
              <span className="font-body text-sm text-foreground flex-1">Tour Bookings</span>
              <CheckCircle className="h-4 w-4 text-emerald/80" />
            </li>
            <li className="flex items-center gap-3">
              <span className="font-serif-display text-2xl text-teal tabular-nums w-6">{allDisputes.length}</span>
              <span className="font-body text-sm text-foreground flex-1">Bill Disputes</span>
              <ShieldCheck className="h-4 w-4 text-teal/80" />
            </li>
          </ul>
        </LuxuryCard>
      </div>

      {/* ── Recent Activity + Inspiration ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <LuxuryCard className="p-5">
          <p className="font-body text-[10px] tracking-[0.28em] uppercase text-muted-foreground mb-4">Recent Activity</p>
          {recentActivity.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground">No activity yet today.</p>
          ) : (
            <ul className="space-y-3">
              {recentActivity.map((a, i) => {
                const Icon = a.icon;
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 w-9 h-9 rounded-lg border border-border/60 bg-card/60 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-gold" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm text-foreground truncate">{a.title}</p>
                      <p className="font-body text-xs text-muted-foreground truncate">{a.subtitle}</p>
                    </div>
                    <span className="font-body text-[10px] text-muted-foreground/80 shrink-0">{a.when}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </LuxuryCard>

        <LuxuryCard className="p-0 overflow-hidden relative min-h-[180px]">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, hsl(var(--teal) / 0.45) 0%, hsl(var(--emerald) / 0.35) 50%, hsl(220 40% 8%) 100%)',
            }}
          />
          <svg aria-hidden viewBox="0 0 400 200" preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full opacity-40">
            <path d="M0 140 Q 100 100 200 130 T 400 120 L 400 200 L 0 200 Z" fill="hsl(var(--teal))" />
            <path d="M0 160 Q 120 130 240 155 T 400 150 L 400 200 L 0 200 Z" fill="hsl(220 40% 6%)" opacity="0.7" />
          </svg>
          <div className="relative p-5 h-full flex flex-col justify-end min-h-[180px]">
            <p className="font-serif-display text-2xl text-foreground leading-tight">Today's Inspiration</p>
            <p className="font-body text-sm text-foreground/80 mt-2">Breathe in the ocean.</p>
            <p className="font-body text-sm text-foreground/80">Let hospitality flow naturally.</p>
          </div>
        </LuxuryCard>
      </div>

      {/* ── Quick Access ── */}
      <LuxuryCard className="p-5 mb-4">
        <p className="font-body text-[10px] tracking-[0.28em] uppercase text-muted-foreground mb-1">Quick Access</p>
        <p className="font-body text-xs text-muted-foreground mb-4">Frequently used modules at your fingertips.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { icon: CalendarPlus, label: 'New Reservation', tone: 'gold', action: 'reservation' as const },
            { icon: UserPlus, label: 'Walk-in Guest', tone: 'teal', action: 'walkin' as const },
            { icon: BedDouble, label: 'Room Status', tone: 'emerald', action: 'rooms' as const },
            { icon: Package, label: 'Inventory', tone: 'rose', action: 'inventory' as const },
          ] as const).map(({ icon: Icon, label, tone, action }) => (
            <button key={label} type="button"
              onClick={() => handleQuickAccess(action)}
              className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-border/50 bg-card/40 hover:border-gold/40 hover:bg-card/60 transition-colors min-h-[88px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60">
              <span className={
                tone === 'gold' ? 'w-12 h-12 rounded-xl flex items-center justify-center border border-gold/40 bg-gold/10 text-gold' :
                tone === 'teal' ? 'w-12 h-12 rounded-xl flex items-center justify-center border border-teal/40 bg-teal/10 text-teal' :
                tone === 'emerald' ? 'w-12 h-12 rounded-xl flex items-center justify-center border border-emerald/40 bg-emerald/10 text-emerald' :
                'w-12 h-12 rounded-xl flex items-center justify-center border border-destructive/40 bg-destructive/10 text-destructive'
              }>
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-body text-xs text-foreground text-center">{label}</span>
            </button>
          ))}
        </div>
      </LuxuryCard>

      {/* ── System Notice ── */}
      <div className="luxury-glass rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
        <Bell className="h-4 w-4 text-gold shrink-0" />
        <p className="font-body text-xs text-foreground flex-1">
          <span className="text-gold">System Notice · </span>
          Night Audit will run automatically at 11:59 PM.
        </p>
        <button type="button" className="font-body text-xs text-gold hover:underline flex items-center gap-1 shrink-0">
          View all <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* ── Filtered Rooms (from stat-card tap) ── */}
      <div id="filtered-rooms-section" className="scroll-mt-4">
        {statusFilter && (() => {
          const filtered =
            statusFilter === 'occupied' ? occupiedUnits :
            statusFilter === 'to_clean' ? toCleanUnits :
            statusFilter === 'ready' ? readyUnits :
            units;
          const titleMap = { occupied: 'Occupied Rooms', to_clean: 'To Clean', ready: 'Ready Rooms', all: 'All Rooms' } as const;
          const toneMap = { occupied: 'text-destructive', to_clean: 'text-gold', ready: 'text-emerald', all: 'text-teal' } as const;
          return (
            <LuxuryCard className="p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-body text-[10px] tracking-[0.28em] uppercase text-muted-foreground">Filtered View</p>
                  <h2 className={`font-serif-display text-xl ${toneMap[statusFilter]}`}>
                    {titleMap[statusFilter]} <span className="text-muted-foreground tabular-nums">({filtered.length})</span>
                  </h2>
                </div>
                <button type="button" onClick={() => setStatusFilter(null)}
                  className="font-body text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                  Clear filter
                </button>
              </div>
              {filtered.length === 0 ? (
                <p className="font-body text-sm text-muted-foreground">No rooms in this category.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map((unit: any) => {
                    const s = getUnitStatus(unit);
                    const booking = getActiveBooking(unit);
                    const guest = (booking as any)?.resort_ops_guests;
                    const tone =
                      s === 'occupied' ? 'border-destructive/40 bg-destructive/5' :
                      s === 'to_clean' ? 'border-gold/40 bg-gold/5' :
                      'border-emerald/40 bg-emerald/5';
                    const dot =
                      s === 'occupied' ? 'bg-destructive' :
                      s === 'to_clean' ? 'bg-gold' : 'bg-emerald';
                    return (
                      <button key={unit.id} type="button"
                        onClick={() => { setDetailUnit(unit); setDetailSheetOpen(true); }}
                        className={`text-left rounded-xl border p-3 hover:brightness-110 transition-all min-h-[72px] ${tone}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-display text-sm text-foreground tracking-wider truncate">{unit.name}</p>
                          <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
                        </div>
                        <p className="font-body text-xs text-muted-foreground mt-1 truncate">
                          {s === 'occupied' && (guest?.full_name || 'Guest')}
                          {s === 'to_clean' && 'Awaiting cleaning'}
                          {s === 'ready' && (getUpcomingBooking(unit)?.resort_ops_guests?.full_name ? `Next: ${getUpcomingBooking(unit)?.resort_ops_guests?.full_name}` : 'Available')}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </LuxuryCard>
          );
        })()}
      </div>

      {/* ── Current Guests (all occupied rooms) ── */}
      {occupiedUnits.length > 0 && (
        <div id="current-guests-section" className="mb-6 space-y-2 scroll-mt-4">
          <h2 className="font-display text-xs tracking-wider text-foreground uppercase">🏨 Current Guests ({occupiedUnits.length})</h2>
          {occupiedUnits.map((unit: any) => {
            const booking = getActiveBooking(unit);
            const workflow = getUnitWorkflow(unit);
            const guest = (booking as any)?.resort_ops_guests;
            const nights = booking ? Math.max(1, Math.ceil((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000)) : 0;
            const isDepartingToday = Boolean(workflow.pendingDeparture);
            const incomingArrival = workflow.pendingArrival;

            return (
              <div key={unit.id} className={`border rounded-lg p-3 space-y-2 ${isDepartingToday ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
                    <p className="font-body text-xs text-foreground">{guest?.full_name || 'Guest'}</p>
                    <p className="font-body text-[10px] text-muted-foreground">
                      {booking && `${format(new Date(booking.check_in + 'T00:00:00'), 'MMM d')} – ${format(new Date(booking.check_out + 'T00:00:00'), 'MMM d')} · ${nights} night${nights !== 1 ? 's' : ''}`}
                      {booking && ` · ${booking.platform}`}
                    </p>
                    {booking && Number(booking.room_rate) > 0 && (
                      <p className="font-body text-[10px] text-muted-foreground">₱{Number(booking.room_rate).toLocaleString()}/night · {booking.adults} adult{booking.adults > 1 ? 's' : ''}{booking.children > 0 ? `, ${booking.children} child` : ''}</p>
                    )}
                    {incomingArrival && (
                      <p className="font-body text-[10px] text-blue-400">
                        Next arrival: {incomingArrival.resort_ops_guests?.full_name || 'Guest'}
                        {workflow.isExtensionReview ? ' · Review extension' : ' · Ready for check-in after checkout'}
                      </p>
                    )}
                    {guest?.phone && <p className="font-body text-[10px] text-muted-foreground">📞 {guest.phone}</p>}
                    {guest?.email && <p className="font-body text-[10px] text-muted-foreground">✉️ {guest.email}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`font-body text-[10px] ${isDepartingToday ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-red-500/20 text-red-400 border-red-500/40'}`}>
                      {isDepartingToday ? 'Departure Pending' : 'Occupied'}
                    </Badge>
                    {workflow.isExtensionReview && (
                      <Badge className="font-body text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/40">Review</Badge>
                    )}
                    {allDisputes.some((d: any) => d.unit_name === unit.name) && (
                      <Badge className="font-body text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/40 flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> Dispute
                      </Badge>
                    )}
                  </div>
                </div>
                {canDoEdit && isDepartingToday && (
                  <Button size="sm" variant="destructive" onClick={() => {
                    setCheckOutBooking(booking);
                    setCheckOutUnit(unit);
                    setCheckOutPayment('');
                    setCheckOutAmount('');
                    setCheckOutOpen(true);
                  }} className="font-display text-xs tracking-wider min-h-[36px]">
                    <LogOut className="w-4 h-4 mr-1" /> Check Out
                  </Button>
                )}
                 <div className="flex flex-wrap gap-1.5">
                  {canDoEdit && booking && (
                    <Button size="sm" variant="outline" onClick={() => {
                      const params = new URLSearchParams({
                        mode: 'staff',
                        orderType: 'Room',
                        location: unit.name,
                        roomName: unit.name,
                        guestName: guest?.full_name || 'Guest',
                      });
                      navigate(`/menu?${params.toString()}`);
                    }} className="font-display text-[10px] tracking-wider min-h-[32px]">
                      <UtensilsCrossed className="w-3 h-3 mr-0.5" /> Order
                    </Button>
                  )}
                   {canDoEdit && (
                     <Button size="sm" variant="outline" onClick={() => handleSendToClean(unit)}
                       disabled={sendingClean === unit.id}
                       className="font-display text-[10px] tracking-wider min-h-[32px] border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                       <Sparkles className="w-3 h-3 mr-0.5" /> {sendingClean === unit.id ? '...' : '🧹 Clean'}
                     </Button>
                   )}
                   <Button size="sm" variant="outline" onClick={() => { setDetailUnit(unit); setDetailSheetOpen(true); }}
                     className="font-display text-[10px] tracking-wider min-h-[32px]">
                     <Eye className="w-3 h-3 mr-0.5" /> Details
                   </Button>
                 </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Arrivals Today ── */}
      {todayArrivals.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-emerald-400 uppercase">🟢 Arrivals Today ({todayArrivals.length})</h2>
          {todayArrivals.map((b: any) => {
            const guest = b.resort_ops_guests;
            const unitName = getUnitNameForBooking(b);
            const unit = units.find((u: any) => u.name === unitName);
            const workflow = unit ? getUnitWorkflow(unit) : null;
            return (
              <div key={b.id} className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3 flex justify-between items-center gap-3">
                <div>
                  <p className="font-display text-sm text-foreground tracking-wider">{unitName}</p>
                  <p className="font-body text-xs text-muted-foreground">{guest?.full_name || 'Guest'} · {b.adults} adult{b.adults > 1 ? 's' : ''}</p>
                  <p className="font-body text-xs text-muted-foreground">{b.platform} · ₱{Number(b.room_rate).toLocaleString()}/night</p>
                  <p className="font-body text-[10px] text-emerald-400">Ready for Check-in</p>
                  {workflow?.isExtensionReview && (
                    <p className="font-body text-[10px] text-blue-400">Flag for review: possible duplicate / stay extension</p>
                  )}
                </div>
                {canDoEdit && (
                  <Button size="sm" onClick={() => { setCheckInBooking(b); setCheckInModalOpen(true); }}
                    className="font-display text-xs tracking-wider min-h-[44px]">
                    <LogIn className="w-4 h-4 mr-1" /> Check In
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Upcoming This Week ── */}
      {weekArrivals.length > 0 && (
        <Collapsible defaultOpen={false} className="mb-6">
          <CollapsibleTrigger className="flex items-center gap-2 w-full">
            <h2 className="font-display text-xs tracking-wider text-blue-400 uppercase">📅 Upcoming This Week ({weekArrivals.length} arrivals · {weekDepartures.length} departures)</h2>
            <ChevronDown className="w-3.5 h-3.5 text-blue-400 ml-auto" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-2">
            {Object.entries(weekArrivalsByDate).map(([date, dayBookings]) => (
              <div key={date} className="space-y-1.5">
                <p className="font-display text-xs text-muted-foreground tracking-wider">
                  {format(new Date(date + 'T00:00:00'), 'EEE, MMM d')} — {(dayBookings as any[]).length} arrival{(dayBookings as any[]).length !== 1 ? 's' : ''}
                </p>
                {(dayBookings as any[]).map((b: any) => {
                  const guest = b.resort_ops_guests;
                  const unitName = getUnitNameForBooking(b);
                  return (
                    <div key={b.id} className="border border-blue-500/20 bg-blue-500/5 rounded-lg p-2.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-display text-sm text-foreground tracking-wider">{unitName}</p>
                          <p className="font-body text-xs text-muted-foreground">{guest?.full_name || 'Guest'} · {b.adults} adult{b.adults > 1 ? 's' : ''}{b.children > 0 ? `, ${b.children} child` : ''}</p>
                          <p className="font-body text-[10px] text-muted-foreground">{b.platform} · ₱{Number(b.room_rate).toLocaleString()}/night · until {format(new Date(b.check_out + 'T00:00:00'), 'MMM d')}</p>
                        </div>
                        <Badge className="font-body text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/40">Upcoming</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {weekDepartures.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-border">
                <p className="font-display text-xs text-muted-foreground tracking-wider uppercase">Upcoming Departures</p>
                {weekDepartures.map((b: any) => {
                  const guest = b.resort_ops_guests;
                  const unitName = getUnitNameForBooking(b);
                  return (
                    <div key={b.id} className="border border-border rounded-lg p-2.5">
                      <p className="font-display text-sm text-foreground tracking-wider">{unitName}</p>
                      <p className="font-body text-xs text-muted-foreground">{guest?.full_name || 'Guest'} · out {format(new Date(b.check_out + 'T00:00:00'), 'EEE, MMM d')}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {readyUnits.length > 0 && (
        <div id="walk-in-section" className="mb-6 space-y-2 scroll-mt-4">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-xs tracking-wider text-foreground uppercase">Walk-In / Sell Room ({trulyAvailableUnits.length} available)</h2>
          </div>

          {/* Reserved today — protected rooms */}
          {reservedTodayUnits.map((unit: any) => {
            const arrivalBooking = getTodayArrivalBooking(unit);
            const arrGuest = (arrivalBooking as any)?.resort_ops_guests;
            return (
              <div key={unit.id} className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <BedDouble className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
                    <p className="font-body text-xs text-amber-400">🔒 Reserved for {arrGuest?.full_name || 'Guest'} at 2:00 PM</p>
                  </div>
                </div>
                {canDoManage && (
                  <Button size="sm" variant="outline" onClick={() => {
                    setOverrideUnit(unit);
                    setOverrideReason('');
                    setOverrideOpen(true);
                  }} className="font-display text-[10px] tracking-wider min-h-[44px] border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                    <AlertTriangle className="w-3 h-3 mr-1" /> Override
                  </Button>
                )}
              </div>
            );
          })}

          {/* Truly available rooms */}
          {trulyAvailableUnits.map((unit: any) => {
            const upcoming = getUpcomingBooking(unit);
            const upGuest = (upcoming as any)?.resort_ops_guests;
            return (
            <div key={unit.id} className="border border-emerald-500/30 rounded-lg p-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-emerald-400" />
                <div>
                  <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
                  <Badge className="font-body text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/40">Ready</Badge>
                  {upcoming && (
                    <p className="font-body text-[10px] text-blue-400 mt-0.5">
                      📅 {upGuest?.full_name || 'Guest'} · {format(new Date(upcoming.check_in + 'T00:00:00'), 'MMM d')}
                    </p>
                  )}
                </div>
              </div>
              {canDoEdit && (
                <Button size="sm" variant="outline" onClick={() => {
                  setWalkInUnit(unit);
                  const rt = roomTypes.find((r: any) => r.id === unit.room_type_id);
                  const defaultRate = rt?.base_rate ? String(rt.base_rate) : '0';
                  setWalkInForm({ guestName: '', checkIn: today, checkOut: '', adults: '2', children: '0', platform: 'Direct', roomRate: defaultRate, notes: '' });
                  setWalkInOpen(true);
                }} className="font-display text-xs tracking-wider min-h-[44px]">
                  <DollarSign className="w-4 h-4 mr-1" /> Sell
                </Button>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* ── Tours & Activities Today (with action buttons) ── */}
      {(todayTours.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled').length > 0 || pendingTourBookings.length > 0 || tourBookings.filter((b: any) => b.status === 'confirmed').length > 0) && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">🏝️ Tours & Activities ({todayTours.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled').length + pendingTourBookings.length + tourBookings.filter((b: any) => b.status === 'confirmed').length})</h2>
          {todayTours.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled').map((tour: any) => (
            <div key={tour.id} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <p className="font-display text-sm text-foreground tracking-wider">{tour.tour_name}</p>
                  </div>
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    {tour.pickup_time && `${tour.pickup_time} · `}{tour.unit_name} · {tour.pax} pax
                  </p>
                  {tour.provider && <p className="font-body text-xs text-muted-foreground">Provider: {tour.provider}</p>}
                </div>
                <Badge className={`font-body text-xs ${statusColor(tour.status)}`}>{tour.status}</Badge>
              </div>
              {canDoEdit && (
                <div className="flex gap-2">
                  {tour.status === 'booked' && (
                    <Button size="sm" variant="outline" onClick={() => updateTourStatus(tour.id, 'confirmed', tour)}
                      className="font-display text-xs tracking-wider min-h-[36px]">Confirm</Button>
                  )}
                  <Button size="sm" onClick={() => updateTourStatus(tour.id, 'completed', tour)}
                    className="font-display text-xs tracking-wider min-h-[36px]">
                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Complete
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => updateTourStatus(tour.id, 'cancelled', tour)}
                    className="font-display text-xs tracking-wider min-h-[36px]">Cancel</Button>
                </div>
              )}
            </div>
          ))}
          {pendingTourBookings.map((b: any) => (
            <div key={b.id} className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2 new-order-card">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <Palmtree className="w-3.5 h-3.5 text-amber-400" />
                    <p className="font-display text-sm text-foreground tracking-wider">{b.tour_name}</p>
                  </div>
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    {b.tour_date && format(new Date(b.tour_date + 'T00:00:00'), 'MMM d')} · {b.guest_name} · {b.pax} pax
                  </p>
                  {Number(b.price) > 0 && <p className="font-body text-xs text-foreground">₱{Number(b.price).toLocaleString()}</p>}
                </div>
                <Badge className={`font-body text-xs ${statusColor('pending')}`}>pending</Badge>
              </div>
              {canDoEdit && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => confirmTourBooking(b)}
                    className="font-display text-xs tracking-wider min-h-[36px]">Confirm</Button>
                  <Button size="sm" variant="destructive" onClick={() => cancelTourBooking(b.id)}
                    className="font-display text-xs tracking-wider min-h-[36px]">Cancel</Button>
                </div>
              )}
            </div>
          ))}
          {/* Show confirmed tour bookings with Complete button */}
          {tourBookings.filter((b: any) => b.status === 'confirmed').map((b: any) => (
            <div key={b.id} className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <Palmtree className="w-3.5 h-3.5 text-emerald-400" />
                    <p className="font-display text-sm text-foreground tracking-wider">{b.tour_name}</p>
                  </div>
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    {b.tour_date && format(new Date(b.tour_date + 'T00:00:00'), 'MMM d')} · {b.guest_name} · {b.pax} pax
                  </p>
                </div>
                <Badge className={`font-body text-xs ${statusColor('confirmed')}`}>confirmed</Badge>
              </div>
              {canDoEdit && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => completeTourBooking(b)}
                    className="font-display text-xs tracking-wider min-h-[36px]">
                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Complete
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => cancelTourBooking(b.id)}
                    className="font-display text-xs tracking-wider min-h-[36px]">Cancel</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Guest Requests (with action buttons) ── */}
      {guestRequests.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">
            📋 Guest Requests ({pendingRequests.length} pending)
          </h2>
          {guestRequests.slice(0, 10).map((req: any) => (
            <div key={req.id} className={`border rounded-lg p-3 space-y-2 ${req.status === 'pending' ? 'border-amber-500/30 bg-amber-500/5 new-order-card' : 'border-border'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-display text-sm text-foreground tracking-wider">{req.request_type}</p>
                  <p className="font-body text-xs text-muted-foreground">{req.guest_name} · {req.details}</p>
                  <p className="font-body text-[10px] text-muted-foreground">{format(new Date(req.created_at), 'MMM d, h:mm a')}</p>
                </div>
                <Badge className={`font-body text-xs ${statusColor(req.status)}`}>{req.status}</Badge>
              </div>
              {canDoEdit && req.status === 'pending' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateRequestStatus(req.id, 'confirmed', req)}
                    className="font-display text-xs tracking-wider min-h-[36px]">Confirm</Button>
                  <Button size="sm" variant="destructive" onClick={() => updateRequestStatus(req.id, 'cancelled')}
                    className="font-display text-xs tracking-wider min-h-[36px]">Cancel</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* (Recent Room Orders section removed — F&B orders handled by Cashier) */}
      <ClosedCheckoutsPanel isAdmin={isAdmin} />

      {/* ── 🧹 Needs Cleaning — Live Housekeeping Progress ── */}
      {activeHkOrders.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="font-display text-xs tracking-wider text-amber-400 uppercase">
            🧹 Needs Cleaning ({activeHkOrders.length})
          </h2>
          {activeHkOrder ? (
            <HousekeepingInspection
              order={activeHkOrder}
              onClose={() => {
                setActiveHkOrder(null);
                qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
                qc.invalidateQueries({ queryKey: ['rooms-units'] });
              }}
            />
          ) : (
            activeHkOrders.map((order: any) => {
              const hkStatusLabel = order.status === 'pending_inspection' ? 'Pending' : order.status === 'inspecting' ? 'Inspecting' : order.status === 'cleaning' ? 'Cleaning' : order.status;
              const hkStatusColor = order.status === 'pending_inspection' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : order.status === 'cleaning' ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-muted text-muted-foreground';
              const isMyOrder = order.accepted_by === empId;
              const timeSince = order.created_at ? `${Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000)} min ago` : '';

              return (
                <div key={order.id} className={`border rounded-lg p-3 bg-card space-y-2 ${
                  order.priority === 'urgent' ? 'border-destructive/60 bg-destructive/5' : 'border-amber-500/30 bg-amber-500/5'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-display text-sm tracking-wider text-foreground">{order.unit_name}</span>
                      {order.accepted_by_name ? (
                        <p className="font-body text-xs text-foreground">👤 {order.accepted_by_name}</p>
                      ) : (
                        <p className="font-body text-xs text-amber-400">⏳ Waiting for acceptance</p>
                      )}
                      <p className="font-body text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {timeSince}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={`font-body text-xs ${hkStatusColor}`}>{hkStatusLabel}</Badge>
                      {order.priority === 'urgent' && (
                        <Badge className="bg-destructive text-destructive-foreground font-body text-[10px]">Urgent</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!order.accepted_by && (
                      <Button size="sm" variant="outline" onClick={() => {
                        setHkTargetUnit(units.find((u: any) => u.name === order.unit_name) || { id: '', name: order.unit_name });
                        setHkPickerOpen(true);
                      }} className="font-display text-[10px] tracking-wider min-h-[32px] border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                        Assign
                      </Button>
                    )}
                    {order.accepted_by_name && (
                      <Button size="sm" variant="ghost" onClick={() => {
                        const emp = hkEmployeesForCheckout.find((e: any) => e.id === order.accepted_by);
                        if (emp?.whatsapp_number) {
                          import('@/lib/messenger').then(({ openWhatsApp }) => {
                            openWhatsApp(emp.whatsapp_number, `Reminder: Room ${order.unit_name} still needs cleaning. Please update status.`);
                          });
                        } else {
                          toast.info('No WhatsApp number for this staff member');
                        }
                      }} className="font-display text-[10px] tracking-wider min-h-[32px]">
                        📲 Remind
                      </Button>
                    )}
                    {canDoManage && (
                      <Button size="sm" variant="outline" onClick={() => handleForceReady(units.find((u: any) => u.name === order.unit_name) || { id: '', name: order.unit_name })}
                        disabled={!!forcingReady}
                        className="font-display text-[10px] tracking-wider min-h-[32px] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
                        <ShieldCheck className="w-3 h-3 mr-0.5" /> Force Ready
                      </Button>
                    )}
                    {hasHousekeepingAccess && !order.accepted_by && (
                      <Button size="sm" onClick={async () => {
                        const empId = localStorage.getItem('emp_id') || '';
                        const empName = localStorage.getItem('emp_name') || 'Staff';
                        const empDisplay = localStorage.getItem('emp_display_name') || empName;
                        try {
                          await from('housekeeping_orders').update({
                            accepted_by: empId,
                            accepted_by_name: empDisplay,
                            accepted_at: new Date().toISOString(),
                            status: 'pending_inspection',
                          } as any).eq('id', order.id);
                          qc.invalidateQueries({ queryKey: ['housekeeping-orders-all'] });
                          toast.success(`Accepted — ${empDisplay}`);
                        } catch (err: any) {
                          toast.error(err.message || 'Failed to accept');
                        }
                      }}
                        className="font-display text-[10px] tracking-wider min-h-[32px]">
                        ✋ Accept
                      </Button>
                    )}
                    {hasHousekeepingAccess && isMyOrder && (
                      <Button size="sm" variant="outline" onClick={() => setActiveHkOrder(order)}
                        className="font-display text-[10px] tracking-wider min-h-[32px]">
                        Continue →
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}


      <Dialog open={checkInModalOpen} onOpenChange={setCheckInModalOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">Check-In — {checkInBooking && getUnitNameForBooking(checkInBooking)}</DialogTitle>
          </DialogHeader>
          {checkInBooking && (() => {
            const guest = checkInBooking.resort_ops_guests;
            const nights = Math.max(1, Math.ceil((new Date(checkInBooking.check_out).getTime() - new Date(checkInBooking.check_in).getTime()) / 86400000));
            const rate = Number(checkInBooking.room_rate);
            return (
              <div className="space-y-4">
                <div className="border border-border rounded-lg p-3 bg-secondary space-y-1">
                  <p className="font-display text-sm text-foreground">{guest?.full_name || 'Guest'}</p>
                  <p className="font-body text-xs text-muted-foreground">{guest?.email || ''} {guest?.phone || ''}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm font-body">
                  <div><span className="text-muted-foreground">Room:</span> <span className="text-foreground">{getUnitNameForBooking(checkInBooking)}</span></div>
                  <div><span className="text-muted-foreground">Dates:</span> <span className="text-foreground">{format(new Date(checkInBooking.check_in + 'T00:00:00'), 'MMM d')} – {format(new Date(checkInBooking.check_out + 'T00:00:00'), 'MMM d')}</span></div>
                  <div><span className="text-muted-foreground">Nights:</span> <span className="text-foreground">{nights}</span></div>
                  <div><span className="text-muted-foreground">Guests:</span> <span className="text-foreground">{checkInBooking.adults} Adult{checkInBooking.adults > 1 ? 's' : ''}{checkInBooking.children > 0 ? `, ${checkInBooking.children} Child` : ''}</span></div>
                  <div><span className="text-muted-foreground">Rate:</span> <span className="text-foreground">₱{rate.toLocaleString()}/night</span></div>
                  <div><span className="text-muted-foreground">Total:</span> <span className="text-foreground">₱{(nights * rate).toLocaleString()}</span></div>
                  <div><span className="text-muted-foreground">Platform:</span> <span className="text-foreground">{checkInBooking.platform}</span></div>
                  {Number(checkInBooking.paid_amount) > 0 && (
                    <div><span className="text-muted-foreground">Paid:</span> <span className="text-green-400">₱{Number(checkInBooking.paid_amount).toLocaleString()}</span></div>
                  )}
                </div>
                {checkInBooking.special_requests && (
                  <div className="border border-border rounded-lg p-2 bg-secondary">
                    <p className="font-body text-xs text-muted-foreground">Special Requests</p>
                    <p className="font-body text-sm text-foreground">{checkInBooking.special_requests}</p>
                  </div>
                )}
                {/* Early check-in fee */}
                {getManilaHour() < 14 && (
                  <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2">
                    <p className="font-display text-xs tracking-wider text-amber-400 uppercase">⏰ Early Check-In (before 2:00 PM)</p>
                    <p className="font-body text-xs text-muted-foreground">Standard check-in is 2:00 PM. Add an optional early check-in fee.</p>
                    <Input
                      type="number"
                      value={earlyCheckInFee}
                      onChange={e => setEarlyCheckInFee(e.target.value)}
                      placeholder="₱0 (optional)"
                      className="bg-secondary border-border text-foreground font-body"
                    />
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckInModalOpen(false)} className="font-display text-xs tracking-wider">Cancel</Button>
            <Button onClick={handleReservationCheckIn} disabled={checkingIn} className="font-display text-xs tracking-wider">
              {checkingIn ? 'Checking in...' : 'Confirm Check-In'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ WALK-IN MODAL ══════ */}
      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">Sell Room — {walkInUnit?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={walkInForm.guestName} onChange={e => setWalkInForm(p => ({ ...p, guestName: e.target.value }))}
              placeholder="Guest full name *" className="bg-secondary border-border text-foreground font-body" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-body text-xs text-muted-foreground">Check-in</label>
                <Input type="date" value={walkInForm.checkIn} onChange={e => setWalkInForm(p => ({ ...p, checkIn: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs" />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Check-out *</label>
                <Input type="date" value={walkInForm.checkOut} onChange={e => setWalkInForm(p => ({ ...p, checkOut: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-body text-xs text-muted-foreground">Adults</label>
                <Input type="number" value={walkInForm.adults} onChange={e => setWalkInForm(p => ({ ...p, adults: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs" />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Children</label>
                <Input type="number" value={walkInForm.children} onChange={e => setWalkInForm(p => ({ ...p, children: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs" />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Rate/night</label>
                <Input type="number" value={walkInForm.roomRate} onChange={e => setWalkInForm(p => ({ ...p, roomRate: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs" />
              </div>
            </div>
            {walkInForm.checkOut && walkInForm.checkOut > walkInForm.checkIn && (
              <p className="font-body text-sm text-foreground text-center">
                {Math.ceil((new Date(walkInForm.checkOut).getTime() - new Date(walkInForm.checkIn).getTime()) / 86400000)} nights × ₱{Number(walkInForm.roomRate).toLocaleString()} = <strong>₱{(Math.ceil((new Date(walkInForm.checkOut).getTime() - new Date(walkInForm.checkIn).getTime()) / 86400000) * Number(walkInForm.roomRate)).toLocaleString()}</strong>
              </p>
            )}
            <Textarea value={walkInForm.notes} onChange={e => setWalkInForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notes (optional)" className="bg-secondary border-border text-foreground font-body text-sm min-h-[50px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalkInOpen(false)} className="font-display text-xs tracking-wider">Cancel</Button>
            <Button onClick={handleWalkIn} disabled={walkingIn} className="font-display text-xs tracking-wider">
              {walkingIn ? 'Processing...' : 'Complete Check-In'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ CHECK-OUT MODAL (manage only) ══════ */}
      <Dialog open={checkOutOpen} onOpenChange={setCheckOutOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">Checkout — {checkOutUnit?.name}</DialogTitle>
          </DialogHeader>
          {checkOutBooking && (() => {
            const guest = checkOutBooking.resort_ops_guests;
            const nights = Math.max(1, Math.ceil((new Date(checkOutBooking.check_out).getTime() - new Date(checkOutBooking.check_in).getTime()) / 86400000));
            const rate = Number(checkOutBooking.room_rate);
            return (
              <div className="space-y-4">
                <div className="border border-border rounded-lg p-3 bg-secondary space-y-1">
                  <p className="font-display text-sm text-foreground">{guest?.full_name || 'Guest'}</p>
                  <p className="font-body text-xs text-muted-foreground">{nights} night{nights !== 1 ? 's' : ''} × ₱{rate.toLocaleString()}/night = ₱{(nights * rate).toLocaleString()}</p>
                </div>

                {charges.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Charges</p>
                    {charges.map(t => (
                      <div key={t.id} className="flex justify-between font-body text-sm">
                        <span className="text-muted-foreground truncate flex-1">{t.notes || t.transaction_type}</span>
                        <span className="text-foreground">₱{t.total_amount.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-display text-sm">
                      <span className="text-foreground">Total Charges</span>
                      <span className="text-foreground">₱{totalCharges.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <Separator />

                {payments.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Payments Received</p>
                    {payments.map(t => (
                      <div key={t.id} className="flex justify-between font-body text-sm">
                        <span className="text-muted-foreground truncate flex-1">{t.payment_method}</span>
                        <span className="text-green-400">₱{Math.abs(t.total_amount).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-display text-sm">
                      <span className="text-foreground">Total Paid</span>
                      <span className="text-green-400">₱{totalPayments.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="flex justify-between font-display text-lg tracking-wider">
                  <span className="text-foreground">Balance</span>
                  <span className={balance > 0 ? 'text-destructive' : 'text-green-400'}>
                    ₱{Math.abs(balance).toLocaleString()}
                  </span>
                </div>

                {balance > 0 && (
                  <div className="space-y-3 border border-border rounded-lg p-3">
                    <p className="font-display text-xs tracking-wider text-foreground uppercase">Final Payment</p>
                    <Select onValueChange={setCheckOutPayment} value={checkOutPayment}>
                      <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                        <SelectValue placeholder="Payment method" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {activePM.map(m => (
                          <SelectItem key={m.id} value={m.name} className="text-foreground font-body">{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" value={checkOutAmount} onChange={e => setCheckOutAmount(e.target.value)}
                      placeholder={`₱${balance.toLocaleString()}`}
                      className="bg-secondary border-border text-foreground font-body" />
                  </div>
                )}
                {/* Late check-out fee */}
                {getManilaHour() >= 12 && checkOutBooking.check_out === today && (
                  <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2">
                    <p className="font-display text-xs tracking-wider text-amber-400 uppercase">⏰ Late Check-Out (after 12:00 PM)</p>
                    <p className="font-body text-xs text-muted-foreground">Standard checkout is 12:00 PM noon. Add an optional late check-out fee.</p>
                    <Input
                      type="number"
                      value={lateCheckOutFee}
                      onChange={e => setLateCheckOutFee(e.target.value)}
                      placeholder="₱0 (optional)"
                      className="bg-secondary border-border text-foreground font-body"
                    />
                  </div>
                )}
                {/* Housekeeping broadcast notice */}
                <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3">
                  <p className="font-display text-xs tracking-wider text-amber-400 uppercase">🧹 Housekeeping</p>
                  <p className="font-body text-xs text-muted-foreground mt-1">All on-duty housekeepers will be notified and can accept the assignment.</p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckOutOpen(false)} className="font-display text-xs tracking-wider">Cancel</Button>
            <Button onClick={handleCheckOut} disabled={checkingOut} variant="destructive" className="font-display text-xs tracking-wider">
              {checkingOut ? 'Processing...' : 'Confirm Checkout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ ADD PAYMENT MODAL ══════ */}
      {paymentUnit && (
        <AddPaymentModal
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          unitId={paymentUnit.id}
          unitName={paymentUnit.name}
          guestName={paymentBooking?.resort_ops_guests?.full_name || null}
          bookingId={paymentBooking?.id || null}
          currentBalance={paymentBalance}
        />
      )}

      {/* ══════ HOUSEKEEPER PICKER MODAL ══════ */}
      <HousekeeperPickerModal
        open={hkPickerOpen}
        onOpenChange={setHkPickerOpen}
        onSelect={(empId, empName) => {
          if (hkTargetUnit) {
            handleSendToClean(hkTargetUnit, empId, empName);
          }
        }}
      />


      {/* ══════ ROOM DETAIL SHEET ══════ */}
      <Sheet open={detailSheetOpen} onOpenChange={(open) => { setDetailSheetOpen(open); if (!open) setDetailUnit(null); }}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="font-display text-lg tracking-wider">{detailUnit?.name} — Room Details</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {detailUnit && (
              <RoomsDashboard
                readOnly={!canDoEdit}
                canViewDocuments={hasDocAccess}
                initialUnit={detailUnit}
                singleUnitMode
                onClose={() => { setDetailSheetOpen(false); setDetailUnit(null); }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ══════ OVERRIDE SELL DIALOG ══════ */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider text-amber-400">⚠️ Override Reserved Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="font-body text-sm text-muted-foreground">
              This room is reserved for a guest arriving today. Selling it to a walk-in requires a reason.
            </p>
            {overrideUnit && (() => {
              const arrBooking = getTodayArrivalBooking(overrideUnit);
              const arrGuest = (arrBooking as any)?.resort_ops_guests;
              return arrGuest ? (
                <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-2">
                  <p className="font-body text-xs text-foreground">Reserved: <strong>{arrGuest.full_name}</strong></p>
                  <p className="font-body text-[10px] text-muted-foreground">Expected at 2:00 PM</p>
                </div>
              ) : null;
            })()}
            <Textarea
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder="Reason for override (required)"
              className="bg-secondary border-border text-foreground font-body text-sm min-h-[60px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)} className="font-display text-xs tracking-wider">Cancel</Button>
            <Button
              variant="destructive"
              disabled={!overrideReason.trim()}
              onClick={async () => {
                if (!overrideUnit || !overrideReason.trim()) return;
                const arrBooking = getTodayArrivalBooking(overrideUnit);
                const arrGuest = (arrBooking as any)?.resort_ops_guests;
                await logAudit('updated', 'units', overrideUnit.id, `Override sell: ${overrideReason} — reserved for ${arrGuest?.full_name || 'Guest'} in ${overrideUnit.name}`);
                setOverrideOpen(false);
                setOverrideReason('');
                // Open walk-in modal
                const rt = roomTypes.find((r: any) => r.id === overrideUnit.room_type_id);
                const defaultRate = rt?.base_rate ? String(rt.base_rate) : '0';
                setWalkInUnit(overrideUnit);
                setWalkInForm({ guestName: '', checkIn: today, checkOut: '', adults: '2', children: '0', platform: 'Direct', roomRate: defaultRate, notes: '' });
                setWalkInOpen(true);
                setOverrideUnit(null);
                toast.info('Override logged — proceed with walk-in');
              }}
              className="font-display text-xs tracking-wider"
            >
              Override & Sell
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── BOOKING CALENDAR ─── */}
      <Separator className="my-6" />
      <div id="reception-calendar" className="scroll-mt-4">
        <ReceptionCalendar
          bookings={bookings as BookingWithGuest[]}
          rooms={resortUnits as ResortUnit[]}
          units={units as any[]}
          canEdit={canDoEdit}
          canManage={canDoManage}
        />
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{inner}</div>;
  }

  return (
    <LuxuryShell>
      <div className="p-4 max-w-2xl md:max-w-5xl mx-auto">{inner}</div>
    </LuxuryShell>
  );
};

export default ReceptionPage;
