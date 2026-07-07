import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Briefcase, LogOut, Menu, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { hasAccess } from '@/lib/permissions';
import { getHomeRoute } from '@/lib/getHomeRoute';
import { Badge } from '@/components/ui/badge';
import { getStaffSession, clearStaffSession } from '@/lib/session';
import ThemeToggle from '@/components/ThemeToggle';

/** Color map for department badges — HSL values from design tokens where possible */
const DEPT_COLORS: Record<string, string> = {
  reception:    'bg-[hsl(210,70%,50%)] text-white',
  kitchen:      'bg-[hsl(25,85%,55%)] text-white',
  bar:          'bg-[hsl(270,60%,55%)] text-white',
  housekeeping: 'bg-[hsl(142,71%,45%)] text-white',
  maintenance:  'bg-[hsl(220,15%,50%)] text-white',
  experiences:  'bg-[hsl(38,60%,55%)] text-white',
  orders:       'bg-[hsl(200,60%,50%)] text-white',
  
};

const DEPT_LABELS: Record<string, string> = {
  reception: 'Reception',
  kitchen: 'Kitchen',
  bar: 'Bar',
  housekeeping: 'Housekeeping',
  maintenance: 'Maintenance',
  experiences: 'Experiences',
  orders: 'Orders',
  
};

interface StaffNavBarProps {
  /** Current active department/role key — passed from StaffShell */
  activeDepartment?: string;
}

const StaffNavBar = ({ activeDepartment }: StaffNavBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getStaffSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) return null;

  const perms: string[] = session.permissions || [];
  const isAdmin = perms.includes('admin');
  const displayName = session.name || 'Staff';

  // Determine displayed department
  let currentDept = activeDepartment || '';
  if (!currentDept) {
    // Infer from route when not explicitly passed
    if (location.pathname === '/kitchen') currentDept = 'kitchen';
    else if (location.pathname === '/bar') currentDept = 'bar';
    else if (location.pathname === '/housekeeper') currentDept = 'housekeeping';
    else if (location.pathname === '/reception') currentDept = 'reception';
    else if (location.pathname === '/experiences') currentDept = 'experiences';
    else if (location.pathname === '/employee-portal') currentDept = ''; // no dept badge on My Work
  }

  const deptLabel = DEPT_LABELS[currentDept] || '';
  const deptColor = DEPT_COLORS[currentDept] || '';


  const handleLogout = () => {
    clearStaffSession();
    navigate('/');
  };

  const goHome = () => {
    const route = getHomeRoute(perms);
    navigate(route);
    setMenuOpen(false);
  };

  const goMyWork = () => {
    navigate('/employee-portal');
    setMenuOpen(false);
  };


  const isActive = (path: string) => location.pathname === path;

  const DeptBadge = () => {
    if (!deptLabel) return null;
    return (
      <Badge className={`font-display text-[10px] tracking-widest uppercase px-2.5 py-0.5 border-0 ${deptColor}`}>
        {deptLabel}
      </Badge>
    );
  };

  const goService = () => {
    navigate('/service');
    setMenuOpen(false);
  };

  // Shared nav items
  const NavItems = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <Button
        variant={isActive(getHomeRoute(perms)) ? 'default' : 'ghost'}
        size="sm"
        onClick={goHome}
        className={`font-display text-xs tracking-wider gap-1.5 ${mobile ? 'w-full justify-start' : ''}`}
      >
        <Home className="w-4 h-4" />
        Home
      </Button>
      <Button
        variant={isActive('/employee-portal') ? 'default' : 'ghost'}
        size="sm"
        onClick={goMyWork}
        className={`font-display text-xs tracking-wider gap-1.5 ${mobile ? 'w-full justify-start' : ''}`}
      >
        <Briefcase className="w-4 h-4" />
        My Work
      </Button>
      <Button
        variant={location.pathname.startsWith('/service') ? 'default' : 'ghost'}
        size="sm"
        onClick={goService}
        className={`font-display text-xs tracking-wider gap-1.5 ${mobile ? 'w-full justify-start' : ''}`}
      >
        <Monitor className="w-4 h-4" />
        Service
      </Button>
    </>
  );

  return (
    <nav className="sticky top-0 z-40 luxury-glass border-b border-border/40 mb-4">
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between">
        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1">
          <NavItems />
          {deptLabel && (
            <>
              <div className="w-px h-5 bg-border mx-2" />
              <DeptBadge />
            </>
          )}
        </div>

        {/* Mobile nav - Home + department badge */}
        <div className="flex sm:hidden items-center gap-1.5">
          <Button
            variant={isActive(getHomeRoute(perms)) ? 'default' : 'ghost'}
            size="sm"
            onClick={goHome}
            className="font-display text-xs tracking-wider gap-1 px-2"
          >
            <Home className="w-4 h-4" />
          </Button>
          <DeptBadge />
        </div>

        {/* Right side - staff name + toggle + logout (desktop) */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="font-body text-xs text-muted-foreground">{displayName}</span>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="font-display text-xs tracking-wider gap-1 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </Button>
        </div>

        {/* Mobile hamburger menu */}
        <div className="flex sm:hidden items-center">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="px-2">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 bg-background border-border">
              <SheetTitle className="font-display text-sm tracking-wider text-foreground mb-4">
                {displayName}
              </SheetTitle>
              {deptLabel && <div className="mb-3"><DeptBadge /></div>}
              <div className="flex flex-col gap-2">
                <NavItems mobile />
              <div className="flex items-center gap-2 py-1">
                <ThemeToggle />
                <span className="font-body text-xs text-muted-foreground">Theme</span>
              </div>
              <div className="border-t border-border my-2" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { handleLogout(); setMenuOpen(false); }}
                  className="font-display text-xs tracking-wider gap-1.5 w-full justify-start text-destructive hover:text-destructive"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
};

export default StaffNavBar;
