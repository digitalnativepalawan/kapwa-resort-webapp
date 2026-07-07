import { useNavigate } from 'react-router-dom';
import { Flame, GlassWater, BellRing, Banknote, ArrowLeft, LayoutGrid, UtensilsCrossed, ConciergeBell, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';
import { getStaffSession } from '@/lib/session';
import { getHomeRoute } from '@/lib/getHomeRoute';
import { hasAccess, canEdit } from '@/lib/permissions';

const departments = [
  {
    key: 'kitchen',
    label: 'Kitchen',
    subtitle: 'Food preparation board',
    icon: <Flame className="w-7 h-7" />,
    gradient: 'from-[hsl(25,85%,55%)] to-[hsl(15,80%,45%)]',
    glow: 'shadow-[0_0_30px_-5px_hsl(25,85%,55%,0.3)]',
    route: '/service/kitchen',
    statusField: 'kitchen_status',
    permKeys: ['kitchen'],
  },
  {
    key: 'bar',
    label: 'Bar',
    subtitle: 'Drink preparation board',
    icon: <GlassWater className="w-7 h-7" />,
    gradient: 'from-[hsl(270,60%,55%)] to-[hsl(280,55%,42%)]',
    glow: 'shadow-[0_0_30px_-5px_hsl(270,60%,55%,0.3)]',
    route: '/service/bar',
    statusField: 'bar_status',
    permKeys: ['bar'],
  },
  {
    key: 'reception',
    label: 'Reception',
    subtitle: 'Service coordination & billing',
    icon: <BellRing className="w-7 h-7" />,
    gradient: 'from-[hsl(210,70%,50%)] to-[hsl(220,65%,40%)]',
    glow: 'shadow-[0_0_30px_-5px_hsl(210,70%,50%,0.3)]',
    route: '/service/reception',
    statusField: null,
    permKeys: ['reception_display', 'reception'],
  },
  {
    key: 'cashier',
    label: 'Cashier',
    subtitle: 'Fast checkout & payment',
    icon: <Banknote className="w-7 h-7" />,
    gradient: 'from-[hsl(45,90%,50%)] to-[hsl(35,85%,42%)]',
    glow: 'shadow-[0_0_30px_-5px_hsl(45,90%,50%,0.3)]',
    route: '/service/cashier',
    statusField: null,
    permKeys: ['cashier'],
  },
  {
    key: 'waitstaff',
    label: 'Waitstaff',
    subtitle: 'Order tracking & delivery',
    icon: <ConciergeBell className="w-7 h-7" />,
    gradient: 'from-[hsl(150,60%,45%)] to-[hsl(160,55%,35%)]',
    glow: 'shadow-[0_0_30px_-5px_hsl(150,60%,45%,0.2)]',
    route: '/service/waitstaff',
    statusField: null,
    permKeys: ['waitstaff'],
  },
  {
    key: 'tours',
    label: 'Tours',
    subtitle: 'Tour bookings & pickups',
    icon: <Compass className="w-7 h-7" />,
    gradient: 'from-[hsl(180,55%,45%)] to-[hsl(190,50%,35%)]',
    glow: 'shadow-[0_0_30px_-5px_hsl(180,55%,45%,0.25)]',
    route: '/service/tours',
    statusField: null,
    permKeys: ['experiences', 'reception'],
  },
];

const ServiceModePage = () => {
  const navigate = useNavigate();

  const session = useMemo(() => getStaffSession(), []);
  const staffName = session?.name || '';
  const perms: string[] = session?.permissions || [];
  const isAdmin = perms.includes('admin');

  // Filter departments by permission
  const visibleDepartments = useMemo(() => {
    if (isAdmin) return departments;
    return departments.filter(dept => dept.permKeys.some(k => hasAccess(perms, k)));
  }, [perms, isAdmin]);

  // Fetch today's active orders for live counts
  const { data: orders = [] } = useQuery({
    queryKey: ['service-mode-counts'],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('orders')
        .select('id, status, kitchen_status, bar_status, payment_type, items')
        .in('status', ['New', 'Preparing', 'Ready', 'Served'])
        .gte('created_at', start.toISOString())
        .limit(300);
      return data || [];
    },
    refetchInterval: 10000,
  });

  const counts = useMemo(() => {
    let kitchen = 0, bar = 0, reception = 0, cashier = 0;
    orders.forEach((o: any) => {
      const items = (o.items as any[]) || [];
      const hasFood = items.some((i: any) => { const d = i.department || 'kitchen'; return d === 'kitchen' || d === 'both'; });
      const hasDrinks = items.some((i: any) => i.department === 'bar' || i.department === 'both');
      if (hasFood && o.kitchen_status !== 'ready') kitchen++;
      if (hasDrinks && o.bar_status !== 'ready') bar++;
      // Cashier: orders awaiting settlement (Ready/Served, not already charged to room)
      if ((o.status === 'Ready' || o.status === 'Served') && o.payment_type !== 'Charge to Room') cashier++;
    });
    // Reception has no order-based count
    return { kitchen, bar, reception: 0, cashier };
  }, [orders]);

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      {/* Ambient gradient */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 90% 50% at 50% -10%, hsl(var(--gold) / 0.10), transparent 60%),' +
            'radial-gradient(ellipse 70% 50% at 100% 100%, hsl(var(--teal) / 0.08), transparent 70%),' +
            'linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--navy-deep)) 100%)',
        }}
      />
      <header className="sticky top-0 z-30 luxury-glass border-b border-border/40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { const s = getStaffSession(); navigate(s?.isAdmin ? '/admin' : getHomeRoute(s?.permissions || [])); }} className="w-10 h-10 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2.5 flex-1">
            <LayoutGrid className="w-5 h-5 text-gold" />
            <div>
              <p className="font-body text-[9px] tracking-[0.3em] uppercase text-gold/80 leading-none mb-0.5">Choose</p>
              <h1 className="font-serif-display text-xl text-foreground leading-tight">Service Mode</h1>
            </div>
          </div>
          {staffName && (
            <span className="font-body text-xs text-muted-foreground truncate max-w-[120px]">{staffName}</span>
          )}
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-4">
          <p className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground text-center mb-2">
            Focus on what matters right now
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleDepartments.map(dept => {
              const count = counts[dept.key as keyof typeof counts] || 0;
              return (
                <button
                  key={dept.key}
                  onClick={() => navigate(dept.route)}
                  className={`relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 flex flex-col gap-4 text-left group transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${dept.glow} hover:border-accent/40`}
                >
                  {/* Gradient accent strip */}
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${dept.gradient}`} />

                  <div className="flex items-center justify-between">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${dept.gradient} flex items-center justify-center text-white group-hover:scale-110 transition-transform duration-200`}>
                      {dept.icon}
                    </div>
                    {dept.key !== 'reception' && count > 0 && (
                      <span className="font-body text-xs font-bold bg-gold/20 text-gold rounded-full px-2.5 py-1 min-w-[28px] text-center tabular-nums">
                        {count}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-display text-xl text-foreground tracking-wider">{dept.label}</p>
                    <p className="font-body text-xs text-muted-foreground mt-0.5">{dept.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Menu button — only for staff who can place orders */}
          {(isAdmin || canEdit(perms, 'orders')) && (
            <button
              onClick={() => navigate('/order-type?mode=staff&returnTo=/service')}
              className="w-full rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 flex items-center gap-4 group transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] hover:border-accent/40 shadow-[0_0_30px_-5px_hsl(150,60%,45%,0.2)]"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[hsl(150,60%,45%)] to-[hsl(160,55%,35%)] flex items-center justify-center text-white group-hover:scale-110 transition-transform duration-200">
                <UtensilsCrossed className="w-7 h-7" />
              </div>
              <div className="text-left">
                <p className="font-display text-xl text-foreground tracking-wider">Menu</p>
                <p className="font-body text-xs text-muted-foreground mt-0.5">Place a new order</p>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceModePage;
