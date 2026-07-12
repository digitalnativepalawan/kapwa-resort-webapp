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
  overdueTasks: any[];
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

export async function loadResortState(supabase: any): Promise<ResortState> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 48 * 3600 * 1000).toISOString().slice(0, 10);
  const overdueCutoff = new Date(now.getTime() - ESCALATION_HOURS * 3600 * 1000).toISOString();

  const [
    arrivalsQ, departuresQ, requestsQ, housekeepingQ, tasksQ, tabsQ, webhooksQ, casesQ,
  ] = await Promise.all([
    supabase.from("resort_ops_bookings").select("*, resort_ops_guests(name), resort_ops_units(name)").eq("check_in", today),
    supabase.from("resort_ops_bookings")
      .select("id, guest_id, unit_id, check_out, room_rate, addons_total, paid_amount, resort_ops_guests(name), resort_ops_units(name)")
      .gte("check_out", today).lte("check_out", horizon),
    supabase.from("guest_requests").select("*").not("status", "in", "(completed,cancelled)"),
    supabase.from("housekeeping_orders").select("*").in("status", ["pending", "in_progress"]),
    supabase.from("resort_ops_tasks").select("*").eq("status", "pending").lt("due_date", today),
    supabase.from("tabs").select("*").eq("status", "open"),
    supabase.from("webhook_events").select("*").eq("status", "failed").limit(50),
    supabase.from("ops_cases").select("*").not("status", "in", "(resolved,closed)"),
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

  const openCases = casesQ.data ?? [];

  return {
    now: now.toISOString(),
    today,
    arrivals: arrivalsQ.data ?? [],
    departures,
    unpaidDepartures,
    openGuestRequests: openRequests,
    overdueGuestRequests,
    pendingHousekeeping: housekeepingQ.data ?? [],
    overdueTasks: tasksQ.data ?? [],
    openTabs: tabsQ.data ?? [],
    webhookFailures: webhooksQ.data ?? [],
    openCases,
    pendingApprovals: openCases.filter((c: any) => c.status === "pending_approval"),
  };
}
