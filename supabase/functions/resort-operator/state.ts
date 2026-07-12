// Unified resort state loader. One consistent snapshot for the planner,
// preserving domain-specific detail. Read-only.

export interface ResortState {
  now: string;
  today: string;
  units: any[];
  assets: any[];
  lowStockAssets: any[];
  arrivals: any[];
  pendingArrivals: any[];
  departures: any[];
  pendingDepartures: any[];
  unpaidDepartures: UnpaidDeparture[];
  openGuestRequests: any[];
  overdueGuestRequests: any[];
  pendingHousekeeping: any[];
  dirtyUnitsWithoutOrder: any[];
  unreadyArrivals: any[];
  maintenanceTasks: any[];
  overdueMaintenanceTasks: any[];
  overdueTasks: any[];
  reservationExceptionTasks: any[];
  reservationConflicts: any[];
  unconfirmedTours: any[];
  stuckOrders: any[];
  openTabs: any[];
  tabsPastCheckout: any[];
  webhookFailures: any[];
  openCases: any[];
  pendingApprovals: any[];
}

export interface UnpaidDeparture {
  booking_id: string;
  guest_id: string | null;
  guest_name: string;
  unit_id: string | null;
  check_out: string;
  total_due: number;
  paid_amount: number;
  balance: number;
}

const ESCALATION_HOURS = 2;
const MAINTENANCE_OVERDUE_HOURS = 24;
const STUCK_ORDER_MINUTES = 45;
const TOUR_CONFIRM_WINDOW_HOURS = 24;
const CHECKIN_CUTOFF_HOURS = 4;
const STOCK_OUT_THRESHOLD = 5;

export async function loadResortState(supabase: any): Promise<ResortState> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 48 * 3600 * 1000).toISOString().slice(0, 10);
  const tourHorizon = new Date(now.getTime() + TOUR_CONFIRM_WINDOW_HOURS * 3600 * 1000).toISOString().slice(0, 10);
  const overdueCutoff = new Date(now.getTime() - ESCALATION_HOURS * 3600 * 1000).toISOString();
  const maintenanceCutoff = new Date(now.getTime() - MAINTENANCE_OVERDUE_HOURS * 3600 * 1000).toISOString().slice(0, 10);
  const stuckOrderCutoff = new Date(now.getTime() - STUCK_ORDER_MINUTES * 60 * 1000).toISOString();
  const checkinCutoff = new Date(now.getTime() + CHECKIN_CUTOFF_HOURS * 3600 * 1000).toISOString();

  const [
    unitsQ,
    assetsQ,
    arrivalsQ,
    departuresQ,
    requestsQ,
    housekeepingQ,
    tasksQ,
    tabsQ,
    webhooksQ,
    casesQ,
    maintenanceQ,
    reservationTasksQ,
    toursQ,
    ordersQ,
    sirvoyWebhookQ,
  ] = await Promise.all([
    supabase.from("units").select("*").eq("active", true),
    supabase.from("resort_ops_assets").select("*"),
    supabase.from("resort_ops_bookings").select("*, resort_ops_guests(name), resort_ops_units(name)").eq("check_in", today),
    supabase.from("resort_ops_bookings")
      .select("id, guest_id, unit_id, check_in, check_out, room_rate, addons_total, paid_amount, checked_in_at, checked_out_at, resort_ops_guests(name), resort_ops_units(name)")
      .gte("check_out", today).lte("check_out", horizon),
    supabase.from("guest_requests").select("*").not("status", "in", "(completed,cancelled)"),
    supabase.from("housekeeping_orders").select("*").is("cleaning_completed_at", null),
    supabase.from("resort_ops_tasks").select("*").eq("status", "pending").lt("due_date", today),
    supabase.from("tabs").select("*").eq("status", "open"),
    supabase.from("webhook_events").select("*").eq("status", "failed").limit(50),
    supabase.from("ops_cases").select("*").not("status", "in", "(resolved,closed)"),
    supabase.from("resort_ops_tasks").select("*").eq("category", "maintenance").not("status", "in", "(completed,cancelled)"),
    supabase.from("resort_ops_tasks").select("*").eq("category", "reservation").not("status", "in", "(completed,cancelled)"),
    supabase.from("tour_bookings").select("*").lte("tour_date", tourHorizon).gte("tour_date", today)
      .or("captain_confirmed.is.null,captain_confirmed.eq.false,guide_confirmed.is.null,guide_confirmed.eq.false"),
    supabase.from("orders").select("*").not("status", "in", "(Completed,Cancelled,Paid)").lt("created_at", stuckOrderCutoff),
    supabase.from("webhook_events").select("*").eq("event_type", "sirvoy").is("processed_at", null).limit(50),
  ]);

  const units = unitsQ.data ?? [];
  const assets = assetsQ.data ?? [];
  const lowStockAssets = assets.filter((a: any) => Number(a.balance ?? 0) <= STOCK_OUT_THRESHOLD);

  const arrivals = arrivalsQ.data ?? [];
  const pendingArrivals = arrivals.filter((a: any) => !a.checked_in_at);
  const nearCutoffArrivals = pendingArrivals.filter((a: any) => a.created_at < checkinCutoff);

  const departures = departuresQ.data ?? [];
  const pendingDepartures = departures.filter((d: any) => !d.checked_out_at);

  const unpaidDepartures: UnpaidDeparture[] = departures
    .map((b: any) => {
      const totalDue = Number(b.room_rate ?? 0) + Number(b.addons_total ?? 0);
      const paid = Number(b.paid_amount ?? 0);
      return {
        booking_id: b.id,
        guest_id: b.guest_id,
        guest_name: b.resort_ops_guests?.name ?? "",
        unit_id: b.unit_id,
        check_out: b.check_out,
        total_due: totalDue,
        paid_amount: paid,
        balance: Math.round((totalDue - paid) * 100) / 100,
      };
    })
    .filter((d: UnpaidDeparture) => d.balance > 0);

  const openRequests = requestsQ.data ?? [];
  const overdueGuestRequests = openRequests.filter((r: any) =>
    !r.completed_at && !r.escalated_at && r.created_at < overdueCutoff,
  );

  const pendingHousekeeping = housekeepingQ.data ?? [];
  const activeHousekeepingUnitNames = new Set(pendingHousekeeping.map((h: any) => h.unit_name));
  const dirtyUnitsWithoutOrder = units.filter((u: any) =>
    (u.status === "dirty" || u.status === "needs_cleaning") && !activeHousekeepingUnitNames.has(u.unit_name),
  );

  // An arrival is "unready" if its unit still has an incomplete housekeeping order.
  const dirtyUnitNames = new Set(pendingHousekeeping.map((h: any) => h.unit_name));
  const unreadyArrivals = arrivals.filter((a: any) =>
    dirtyUnitNames.has(a.resort_ops_units?.name),
  );

  const maintenanceTasks = maintenanceQ.data ?? [];
  const overdueMaintenanceTasks = maintenanceTasks.filter((t: any) => t.due_date < maintenanceCutoff);

  // Damage notes in housekeeping orders that aren't already tracked as maintenance tasks.
  const damageNotes = pendingHousekeeping.filter((h: any) =>
    h.damage_notes && String(h.damage_notes).trim().length > 0,
  );

  const openTabs = tabsQ.data ?? [];
  const tabsPastCheckout = openTabs.filter((t: any) => {
    const tabCreated = new Date(t.created_at);
    return (now.getTime() - tabCreated.getTime()) > 12 * 3600 * 1000;
  });

  const openCases = casesQ.data ?? [];

  return {
    now: now.toISOString(),
    today,
    units,
    assets,
    lowStockAssets,
    arrivals,
    pendingArrivals: nearCutoffArrivals,
    departures,
    pendingDepartures,
    unpaidDepartures,
    openGuestRequests: openRequests,
    overdueGuestRequests,
    pendingHousekeeping,
    dirtyUnitsWithoutOrder,
    unreadyArrivals,
    maintenanceTasks: [...maintenanceTasks, ...damageNotes],
    overdueMaintenanceTasks,
    overdueTasks: tasksQ.data ?? [],
    reservationExceptionTasks: reservationTasksQ.data ?? [],
    reservationConflicts: sirvoyWebhookQ.data ?? [],
    unconfirmedTours: toursQ.data ?? [],
    stuckOrders: ordersQ.data ?? [],
    openTabs,
    tabsPastCheckout,
    webhookFailures: webhooksQ.data ?? [],
    openCases,
    pendingApprovals: openCases.filter((c: any) => c.status === "pending_approval"),
  };
}
