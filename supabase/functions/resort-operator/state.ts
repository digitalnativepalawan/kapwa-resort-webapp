// Unified resort state loader. One consistent snapshot for the planner,
// preserving domain-specific detail. Read-only.

export interface ResortState {
  now: string;
  today: string;
  arrivals: any[];
  departures: any[];
  unpaidDepartures: UnpaidDeparture[];
  openGuestRequests: any[];
  overdueGuestRequests: any[];
  pendingHousekeeping: any[];
  unreadyArrivals: any[];
  maintenanceTasks: any[];
  overdueMaintenanceTasks: any[];
  overdueTasks: any[];
  reservationExceptionTasks: any[];
  unconfirmedTours: any[];
  stuckOrders: any[];
  openTabs: any[];
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

export async function loadResortState(supabase: any): Promise<ResortState> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 48 * 3600 * 1000).toISOString().slice(0, 10);
  const tourHorizon = new Date(now.getTime() + TOUR_CONFIRM_WINDOW_HOURS * 3600 * 1000).toISOString().slice(0, 10);
  const overdueCutoff = new Date(now.getTime() - ESCALATION_HOURS * 3600 * 1000).toISOString();
  const maintenanceCutoff = new Date(now.getTime() - MAINTENANCE_OVERDUE_HOURS * 3600 * 1000).toISOString().slice(0, 10);
  const stuckOrderCutoff = new Date(now.getTime() - STUCK_ORDER_MINUTES * 60 * 1000).toISOString();

  const [
    arrivalsQ, departuresQ, requestsQ, housekeepingQ, tasksQ, tabsQ, webhooksQ, casesQ,
    maintenanceQ, reservationTasksQ, toursQ, ordersQ,
  ] = await Promise.all([
    supabase.from("resort_ops_bookings").select("*, resort_ops_guests(name), resort_ops_units(name)").eq("check_in", today),
    supabase.from("resort_ops_bookings")
      .select("id, guest_id, unit_id, check_out, room_rate, addons_total, paid_amount, resort_ops_guests(name), resort_ops_units(name)")
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
  ]);

  const departures = departuresQ.data ?? [];
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
  const arrivals = arrivalsQ.data ?? [];
  // An arrival is "unready" if its unit still has an incomplete housekeeping order.
  const dirtyUnitNames = new Set(pendingHousekeeping.map((h: any) => h.unit_name));
  const unreadyArrivals = arrivals.filter((a: any) =>
    dirtyUnitNames.has(a.resort_ops_units?.name),
  );

  const maintenanceTasks = maintenanceQ.data ?? [];
  const overdueMaintenanceTasks = maintenanceTasks.filter((t: any) => t.due_date < maintenanceCutoff);

  const openCases = casesQ.data ?? [];

  return {
    now: now.toISOString(),
    today,
    arrivals,
    departures,
    unpaidDepartures,
    openGuestRequests: openRequests,
    overdueGuestRequests,
    pendingHousekeeping,
    unreadyArrivals,
    maintenanceTasks,
    overdueMaintenanceTasks,
    overdueTasks: tasksQ.data ?? [],
    reservationExceptionTasks: reservationTasksQ.data ?? [],
    unconfirmedTours: toursQ.data ?? [],
    stuckOrders: ordersQ.data ?? [],
    openTabs: tabsQ.data ?? [],
    webhookFailures: webhooksQ.data ?? [],
    openCases,
    pendingApprovals: openCases.filter((c: any) => c.status === "pending_approval"),
  };
}
