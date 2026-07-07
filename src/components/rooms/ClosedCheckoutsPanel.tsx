import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, RotateCcw, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '@/lib/auditLog';
import { format } from 'date-fns';

const from = (table: string) => supabase.from(table as any) as any;

interface ClosedCheckoutsPanelProps {
  isAdmin: boolean;
}

const ClosedCheckoutsPanel = ({ isAdmin }: ClosedCheckoutsPanelProps) => {
  const qc = useQueryClient();
  const [reopening, setReopening] = useState<string | null>(null);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  const { data: closedCheckouts = [] } = useQuery({
    queryKey: ['closed-checkouts-today', today],
    queryFn: async () => {
      const { data } = await from('resort_ops_bookings')
        .select('*, resort_ops_guests(*), resort_ops_units:unit_id(name)')
        .eq('check_out', today)
        .not('checked_out_at', 'is', null)
        .order('checked_out_at', { ascending: false });
      return data || [];
    },
  });

  if (closedCheckouts.length === 0) return null;

  const handleReopen = async (booking: any) => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    setReopening(booking.id);
    try {
      // Clear checked_out_at
      await from('resort_ops_bookings').update({
        checked_out_at: null,
      }).eq('id', booking.id);

      // Set unit back to occupied
      if (booking.unit_id) {
        // Find the units table record matching this resort_ops_unit
        const unitName = booking.resort_ops_units?.name;
        if (unitName) {
          await supabase.from('units').update({ status: 'occupied' } as any).eq('unit_name', unitName);
        }
      }

      const staffName = localStorage.getItem('emp_name') || 'Admin';
      const guestName = booking.resort_ops_guests?.full_name || 'Guest';
      const unitName = booking.resort_ops_units?.name || '';
      await logAudit('updated', 'resort_ops_bookings', booking.id, `Checkout reopened for ${guestName} in ${unitName} by ${staffName}`);

      qc.invalidateQueries({ queryKey: ['closed-checkouts-today'] });
      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      qc.invalidateQueries({ queryKey: ['room-transactions'] });
      qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
      toast.success(`Checkout reopened for ${guestName} — make adjustments then re-checkout`);
    } catch {
      toast.error('Failed to reopen checkout');
    } finally {
      setReopening(null);
    }
  };

  return (
    <Collapsible defaultOpen={false} className="mb-6">
      <CollapsibleTrigger className="flex items-center gap-2 w-full">
        <h2 className="font-display text-xs tracking-wider text-muted-foreground uppercase">
          🔒 Closed Checkouts Today ({closedCheckouts.length})
        </h2>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 mt-2">
        {closedCheckouts.map((b: any) => {
          const guest = b.resort_ops_guests;
          const unitName = b.resort_ops_units?.name || '—';
          const checkoutTime = b.checked_out_at ? format(new Date(b.checked_out_at), 'h:mm a') : '';

          return (
            <div key={b.id} className="border border-border rounded-lg p-3 flex justify-between items-center">
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm text-foreground tracking-wider">{unitName}</p>
                <p className="font-body text-xs text-muted-foreground truncate">
                  {guest?.full_name || 'Guest'} · checked out {checkoutTime}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge className="font-body text-[10px] bg-secondary text-muted-foreground border-border">
                  <Lock className="w-3 h-3 mr-1" /> Closed
                </Badge>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReopen(b)}
                    disabled={reopening === b.id}
                    className="font-display text-[10px] tracking-wider"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {reopening === b.id ? 'Reopening...' : 'Reopen'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {!isAdmin && (
          <p className="font-body text-[10px] text-muted-foreground text-center">Only admins can reopen closed checkouts</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default ClosedCheckoutsPanel;
