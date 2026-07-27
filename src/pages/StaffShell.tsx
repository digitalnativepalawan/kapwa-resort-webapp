import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStaffSession } from '@/lib/session';
import { resolveIdentity } from '@/lib/staffAuth';
import { availableDepartments } from '@/lib/getHomeRoute';
import ReceptionHome from '@/components/staff/ReceptionHome';
import HousekeepingHome from '@/components/staff/HousekeepingHome';
import MaintenanceHome from '@/components/staff/MaintenanceHome';
import KitchenHome from '@/components/staff/KitchenHome';
import BarHome from '@/components/staff/BarHome';
import ExperiencesHome from '@/components/staff/ExperiencesHome';
import StaffOrderHome from '@/components/staff/StaffOrderHome';
import ActionRequiredPanel from '@/components/staff/ActionRequiredPanel';
import StaffNavBar from '@/components/StaffNavBar';
import MorningBriefing from '@/components/MorningBriefing';
import { useDepartmentAlerts } from '@/hooks/useDepartmentAlerts';

// The department list lives in lib/getHomeRoute.ts so this shell, the nav bar
// and the route table share one definition. Maintenance was missing from the
// old local copy, so maintenance-only staff matched no department and silently
// landed on Reception.

const StaffShell = () => {
  const navigate = useNavigate();
  const session = getStaffSession();
  const { permissions: perms, isAdmin } = resolveIdentity(session);

  const availableRoles = useMemo(
    () => availableDepartments(perms, isAdmin),
    [perms, isAdmin],
  );

  const [activeRole, setActiveRole] = useState(() => availableRoles[0]?.key ?? 'reception');
  const alerts = useDepartmentAlerts();

  if (!session) {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-navy-texture overflow-x-hidden">
      {/* Global navigation bar */}
      <StaffNavBar activeDepartment={activeRole} />

      <div className="max-w-2xl mx-auto px-4 pb-4">

        {/* Role switcher — only show if multiple roles */}
        {availableRoles.length > 1 && (
          <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide pb-1">
            {availableRoles.map(r => (
              <button
                key={r.key}
                onClick={() => setActiveRole(r.key)}
                className={`font-display text-xs tracking-wider whitespace-nowrap min-h-[40px] px-4 py-2 rounded-md border transition-colors ${
                  activeRole === r.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                } ${alerts[r.key as keyof typeof alerts] && activeRole !== r.key ? 'tab-pulse' : ''}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* Morning Briefing — top-level operational summary */}
        <MorningBriefing />

        {/* Action Required — always visible, sorted by urgency */}
        <ActionRequiredPanel />

        {/* Role-specific home screen */}
        {activeRole === 'reception' && <ReceptionHome />}
        {activeRole === 'housekeeping' && <HousekeepingHome />}
        {activeRole === 'maintenance' && <MaintenanceHome />}
        {activeRole === 'kitchen' && <KitchenHome />}
        {activeRole === 'bar' && <BarHome />}
        {activeRole === 'experiences' && <ExperiencesHome />}
        {activeRole === 'orders' && <StaffOrderHome />}
      </div>
    </div>
  );
};

export default StaffShell;
