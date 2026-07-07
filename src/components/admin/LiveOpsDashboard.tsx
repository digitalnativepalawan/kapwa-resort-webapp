import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Search, RefreshCw, Users, LogIn, LogOut, BedDouble, AlertTriangle,
  TrendingUp, Calendar, DollarSign,
} from 'lucide-react';

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const AUTH = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

const apiFetch = async (path: string) => {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
};

/* ── Stat card ─────────────────────────────────────── */
const StatCard = ({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
}) => (
  <Card className="flex-1 min-w-[120px]">
    <CardContent className="p-4 flex items-center gap-3">
      <div className="rounded-md bg-primary/10 p-2">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="font-display text-[10px] tracking-widest text-muted-foreground uppercase">{label}</p>
        <p className="font-display text-lg font-semibold text-foreground">{value}</p>
        {sub && <p className="font-body text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </CardContent>
  </Card>
);

/* ══════════════════════════════════════════════════════
   TODAY OPS
   ══════════════════════════════════════════════════════ */
const TodayOps = () => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['live-today-ops'],
    queryFn: () => apiFetch('/today-ops'),
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm tracking-wider text-foreground">Today — {data.date}</h3>
        <Button size="icon" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Stat row */}
      <div className="flex flex-wrap gap-2">
        <StatCard icon={LogIn} label="Arrivals" value={data.arrivals?.length ?? 0} />
        <StatCard icon={LogOut} label="Departures" value={data.departures?.length ?? 0} />
        <StatCard icon={BedDouble} label="Occupied" value={data.occupiedRooms?.length ?? 0}
          sub={`${data.availableRooms?.length ?? 0} available`} />
        <StatCard icon={AlertTriangle} label="Unpaid" value={data.unpaidReservations?.length ?? 0} />
      </div>

      {/* Arrivals table */}
      {data.arrivals?.length > 0 && (
        <SectionTable title="Arrivals" headers={['Guest', 'Room', 'Platform', 'Rate', 'Pax']}>
          {data.arrivals.map((a: any) => (
            <TableRow key={a.id}>
              <TableCell className="font-body text-sm">{a.guest}</TableCell>
              <TableCell>{a.room}</TableCell>
              <TableCell><Badge variant="outline" className="text-[10px]">{a.platform}</Badge></TableCell>
              <TableCell className="text-right">₱{Number(a.rate).toLocaleString()}</TableCell>
              <TableCell className="text-center">{a.adults}{a.children > 0 ? `+${a.children}` : ''}</TableCell>
            </TableRow>
          ))}
        </SectionTable>
      )}

      {/* Departures table */}
      {data.departures?.length > 0 && (
        <SectionTable title="Departures" headers={['Guest', 'Room', 'Paid', 'Rate']}>
          {data.departures.map((d: any) => (
            <TableRow key={d.id}>
              <TableCell className="font-body text-sm">{d.guest}</TableCell>
              <TableCell>{d.room}</TableCell>
              <TableCell className="text-right">₱{Number(d.paid).toLocaleString()}</TableCell>
              <TableCell className="text-right">₱{Number(d.rate).toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </SectionTable>
      )}

      {/* Pending orders */}
      {data.pendingOrders?.length > 0 && (
        <SectionTable title="Pending Orders" headers={['Guest', 'Type', 'Status', 'Total']}>
          {data.pendingOrders.map((o: any) => (
            <TableRow key={o.id}>
              <TableCell className="font-body text-sm">{o.guest}</TableCell>
              <TableCell>{o.type}</TableCell>
              <TableCell><Badge variant="secondary" className="text-[10px]">{o.status}</Badge></TableCell>
              <TableCell className="text-right">₱{Number(o.total).toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </SectionTable>
      )}

      {/* Unpaid reservations */}
      {data.unpaidReservations?.length > 0 && (
        <SectionTable title="Unpaid Reservations" headers={['Guest', 'Room', 'Balance']}>
          {data.unpaidReservations.map((u: any) => (
            <TableRow key={u.id}>
              <TableCell className="font-body text-sm">{u.guest}</TableCell>
              <TableCell>{u.room}</TableCell>
              <TableCell className="text-right font-semibold text-destructive">
                ₱{(Number(u.rate) - Number(u.paid)).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </SectionTable>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   GUEST SEARCH
   ══════════════════════════════════════════════════════ */
const GuestSearch = () => {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const enabled = trimmed.length >= 2;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['live-guest-search', trimmed],
    queryFn: () => apiFetch(`/guest-search?name=${encodeURIComponent(trimmed)}`),
    enabled,
    staleTime: 30_000,
  });

  const results = data?.results ?? [];

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search guest by name (min 2 chars)…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-9"
        />
        {isFetching && (
          <RefreshCw className="absolute right-3 top-3 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {enabled && isLoading && <LoadingSkeleton rows={2} />}

      {enabled && !isLoading && results.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-6">No guests found for "{trimmed}"</p>
      )}

      {results.map((r: any, i: number) => (
        <Card key={r.guest?.id ?? i}>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {r.guest?.name}
            </CardTitle>
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground font-body">
              {r.guest?.email && <span>{r.guest.email}</span>}
              {r.guest?.phone && <span>• {r.guest.phone}</span>}
              {r.guest?.country && <span>• {r.guest.country}</span>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{r.summary?.total_stays ?? 0} stays</Badge>
              <Badge variant="outline">₱{Number(r.summary?.total_spent ?? 0).toLocaleString()} spent</Badge>
              {Number(r.summary?.outstanding_balance ?? 0) > 0 && (
                <Badge variant="destructive">₱{Number(r.summary.outstanding_balance).toLocaleString()} unpaid</Badge>
              )}
            </div>

            {/* Bookings */}
            {r.bookings?.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Dates</TableHead>
                      <TableHead className="text-[10px]">Room</TableHead>
                      <TableHead className="text-[10px]">Platform</TableHead>
                      <TableHead className="text-[10px] text-right">Rate</TableHead>
                      <TableHead className="text-[10px] text-right">Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.bookings.map((b: any) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-body text-xs whitespace-nowrap">
                          {b.check_in} → {b.check_out}
                        </TableCell>
                        <TableCell className="text-xs">{b.room}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{b.platform}</Badge></TableCell>
                        <TableCell className="text-right text-xs">₱{Number(b.rate).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs">₱{Number(b.paid).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   7-DAY FORECAST
   ══════════════════════════════════════════════════════ */
const Forecast = () => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['live-forecast'],
    queryFn: () => apiFetch('/forecast-7day'),
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingSkeleton rows={3} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm tracking-wider text-foreground">
          7-Day Forecast — {data.start_date} to {data.end_date}
        </h3>
        <Button size="icon" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <p className="font-body text-xs text-muted-foreground">{data.total_rooms} total rooms</p>

      <div className="space-y-2">
        {(data.days ?? []).map((day: any) => (
          <Card key={day.date}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="font-display text-sm tracking-wider text-foreground">{day.date}</span>
                </div>
                <Badge
                  variant={day.occupancy_pct >= 80 ? 'default' : day.occupancy_pct >= 50 ? 'secondary' : 'outline'}
                  className="text-[10px]"
                >
                  {day.occupancy_pct}% occ
                </Badge>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <MiniStat label="In" value={day.arrivals} icon={LogIn} />
                <MiniStat label="Out" value={day.departures} icon={LogOut} />
                <MiniStat label="Occ" value={day.occupied} icon={BedDouble} />
                <MiniStat label="Rev" value={`₱${Number(day.expected_revenue).toLocaleString()}`} icon={DollarSign} />
              </div>

              {/* Arrival details */}
              {day.arrival_details?.length > 0 && (
                <div className="space-y-0.5">
                  <p className="font-display text-[10px] tracking-widest text-muted-foreground uppercase">Arriving</p>
                  {day.arrival_details.map((a: any, i: number) => (
                    <p key={i} className="font-body text-xs text-foreground">
                      {a.guest} — {a.room} <span className="text-muted-foreground">₱{Number(a.rate).toLocaleString()}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Departure details */}
              {day.departure_details?.length > 0 && (
                <div className="space-y-0.5">
                  <p className="font-display text-[10px] tracking-widest text-muted-foreground uppercase">Departing</p>
                  {day.departure_details.map((d: any, i: number) => (
                    <p key={i} className="font-body text-xs text-foreground">
                      {d.guest} — {d.room}
                      {Number(d.balance) > 0 && (
                        <span className="text-destructive ml-1">₱{Number(d.balance).toLocaleString()} due</span>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {/* Issues */}
              {day.issues?.length > 0 && (
                <div className="space-y-0.5">
                  {day.issues.map((issue: string, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                      <span className="font-body text-destructive">{issue}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

/* ── Shared helpers ────────────────────────────────── */
const MiniStat = ({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) => (
  <div>
    <Icon className="w-3 h-3 text-muted-foreground mx-auto mb-0.5" />
    <p className="font-display text-xs font-semibold text-foreground">{value}</p>
    <p className="font-display text-[9px] tracking-widest text-muted-foreground uppercase">{label}</p>
  </div>
);

const SectionTable = ({ title, headers, children }: {
  title: string; headers: string[]; children: React.ReactNode;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="font-display text-sm tracking-wider">{title}</CardTitle>
    </CardHeader>
    <CardContent className="overflow-x-auto p-0 pb-2">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map(h => (
              <TableHead key={h} className="font-display text-[10px] tracking-widest">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </CardContent>
  </Card>
);

const LoadingSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-20 w-full rounded-lg" />
    ))}
  </div>
);

/* ══════════════════════════════════════════════════════
   MAIN DASHBOARD
   ══════════════════════════════════════════════════════ */
type Section = 'today' | 'search' | 'forecast';

const LiveOpsDashboard = () => {
  const [section, setSection] = useState<Section>('today');

  const sections: { key: Section; label: string; icon: React.ElementType }[] = [
    { key: 'today', label: 'Today', icon: TrendingUp },
    { key: 'search', label: 'Guests', icon: Search },
    { key: 'forecast', label: 'Forecast', icon: Calendar },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex gap-1">
        {sections.map(s => (
          <Button
            key={s.key}
            size="sm"
            variant={section === s.key ? 'default' : 'outline'}
            onClick={() => setSection(s.key)}
            className="font-display text-xs tracking-wider flex-1 gap-1.5"
          >
            <s.icon className="w-3.5 h-3.5" />
            {s.label}
          </Button>
        ))}
      </div>

      {section === 'today' && <TodayOps />}
      {section === 'search' && <GuestSearch />}
      {section === 'forecast' && <Forecast />}
    </div>
  );
};

export default LiveOpsDashboard;
