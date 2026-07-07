import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface HousekeeperPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (employeeId: string, employeeName: string) => void;
}

const HousekeeperPickerModal = ({ open, onOpenChange, onSelect }: HousekeeperPickerModalProps) => {
  const { data: employees = [] } = useQuery({
    queryKey: ['housekeeping-employees'],
    queryFn: async () => {
      // Get employees with housekeeping permission
      const { data: perms } = await supabase.from('employee_permissions')
        .select('employee_id')
        .like('permission', 'housekeeping%');
      const hkPermIds = new Set((perms || []).map((p: any) => p.employee_id));

      // Also get employees with builtin:housekeeping role
      const { data: roles } = await supabase.from('employee_roles')
        .select('employee_id')
        .eq('role_key', 'builtin:housekeeping');
      const hkRoleIds = new Set((roles || []).map((r: any) => r.employee_id));

      // Combine both sets
      const allHkIds = new Set([...hkPermIds, ...hkRoleIds]);

      if (allHkIds.size === 0) return [];

      const { data: emps } = await supabase.from('employees')
        .select('id, name, display_name')
        .eq('active', true)
        .order('name');

      return ((emps || []) as { id: string; name: string; display_name: string }[])
        .filter(e => allHkIds.has(e.id));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-sm">Assign Housekeeper</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {employees.map(emp => (
            <Button key={emp.id} variant="outline" className="w-full justify-start font-body text-sm h-11"
              onClick={() => { onSelect(emp.id, emp.display_name || emp.name); onOpenChange(false); }}>
              {emp.display_name || emp.name}
            </Button>
          ))}
          {employees.length === 0 && (
            <p className="font-body text-xs text-muted-foreground text-center py-4">No housekeeping staff found. Assign the Housekeeping role to staff first.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HousekeeperPickerModal;
