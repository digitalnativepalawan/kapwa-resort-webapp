import { useNavigate } from 'react-router-dom';
import { LogOut, Flame, GlassWater, BellRing, Banknote, ArrowLeft, Plus, Compass, ConciergeBell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMemo } from 'react';
import { getStaffSession, clearStaffSession } from '@/lib/session';
import { canEdit } from '@/lib/permissions';
import ThemeToggle from '@/components/ThemeToggle';

const DEPT_CONFIG: Record<string, { label: string; icon: React.ReactNode; gradient: string }> = {
  kitchen: { label: 'Kitchen', icon: <Flame className="w-4 h-4" />, gradient: 'from-[hsl(25,85%,55%)] to-[hsl(15,80%,45%)]' },
  bar: { label: 'Bar', icon: <GlassWater className="w-4 h-4" />, gradient: 'from-[hsl(270,60%,55%)] to-[hsl(280,55%,42%)]' },
  reception: { label: 'Reception', icon: <BellRing className="w-4 h-4" />, gradient: 'from-[hsl(210,70%,50%)] to-[hsl(220,65%,40%)]' },
  cashier: { label: 'Cashier', icon: <Banknote className="w-4 h-4" />, gradient: 'from-[hsl(45,90%,50%)] to-[hsl(35,85%,42%)]' },
  waitstaff: { label: 'Waitstaff', icon: <ConciergeBell className="w-4 h-4" />, gradient: 'from-[hsl(150,60%,45%)] to-[hsl(160,55%,35%)]' },
  tours: { label: 'Tours', icon: <Compass className="w-4 h-4" />, gradient: 'from-[hsl(180,55%,45%)] to-[hsl(190,50%,35%)]' },
};

interface ServiceHeaderProps {
  department: 'kitchen' | 'bar' | 'reception' | 'cashier' | 'waitstaff' | 'tours';
}

const ServiceHeader = ({ department }: ServiceHeaderProps) => {
  const navigate = useNavigate();
  const config = DEPT_CONFIG[department];

  const { staffName, canOrder } = useMemo(() => {
    const s = getStaffSession();
    const perms: string[] = s?.permissions || [];
    const isAdmin = perms.includes('admin');
    return {
      staffName: s?.name || '',
      canOrder: isAdmin || canEdit(perms, 'orders'),
    };
  }, []);

  const handleBack = () => navigate('/service');

  const handleLogout = () => {
    clearStaffSession();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 flex-shrink-0">
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="icon" onClick={handleBack} className="w-9 h-9 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className={`flex items-center gap-1.5 bg-gradient-to-r ${config.gradient} text-white rounded-lg px-3 py-1.5`}>
            {config.icon}
            <span className="font-display text-xs tracking-[0.15em] uppercase">{config.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canOrder && department !== 'reception' && department !== 'cashier' && department !== 'tours' && (
            <Button
              size="sm"
              onClick={() => navigate(`/order-type?mode=staff&returnTo=/service/${department}`)}
              className="gap-1.5 h-9 bg-gold text-background hover:bg-gold/90 font-display text-xs tracking-wider"
            >
              <Plus className="w-4 h-4" />
              <span>Order</span>
            </Button>
          )}
          <ThemeToggle />
          {staffName && (
            <span className="font-body text-xs text-muted-foreground hidden sm:inline truncate max-w-[140px]">{staffName}</span>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 text-muted-foreground hover:text-foreground h-9">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline font-body text-xs">Exit</span>
          </Button>
        </div>
      </div>
      {/* Gradient accent line */}
      <div className={`h-[2px] bg-gradient-to-r ${config.gradient} opacity-60`} />
    </header>
  );
};

export default ServiceHeader;
