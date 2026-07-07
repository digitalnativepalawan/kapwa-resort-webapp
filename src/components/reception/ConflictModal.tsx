import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { BookingWithGuest, ResortUnit } from './calendarUtils';

interface ConflictModalProps {
  open: boolean;
  onClose: () => void;
  conflicts: BookingWithGuest[];
  availableRooms: ResortUnit[];
  onSelectAlternative: (room: ResortUnit) => void;
  onOverride: () => void;
  canOverride: boolean;
}

const ConflictModal = ({ open, onClose, conflicts, availableRooms, onSelectAlternative, onOverride, canOverride }: ConflictModalProps) => {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display tracking-wider text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Booking Conflict
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground font-body">
            This room is already booked for the selected dates:
          </p>

          {conflicts.map(c => (
            <div key={c.id} className="border border-border rounded-lg p-3 bg-secondary space-y-1">
              <p className="font-display text-sm tracking-wider text-foreground">
                {c.resort_ops_guests?.full_name || 'Unknown Guest'}
              </p>
              <p className="font-body text-xs text-muted-foreground">
                {format(parseISO(c.check_in), 'MMM d')} → {format(parseISO(c.check_out), 'MMM d, yyyy')}
              </p>
              <Badge variant="outline" className="text-[10px]">{c.platform}</Badge>
            </div>
          ))}

          {availableRooms.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-display tracking-wider text-foreground">Alternative Rooms</p>
              <div className="grid grid-cols-2 gap-2">
                {availableRooms.slice(0, 6).map(room => (
                  <Button
                    key={room.id}
                    variant="outline"
                    size="sm"
                    className="font-body text-xs justify-start"
                    onClick={() => onSelectAlternative(room)}
                  >
                    {room.name}
                    <span className="text-muted-foreground ml-auto">₱{room.base_price.toLocaleString()}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {availableRooms.length === 0 && (
            <p className="text-sm text-destructive font-body">No alternative rooms available for these dates.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="font-display text-xs tracking-wider">
            Cancel
          </Button>
          {canOverride && (
            <Button variant="destructive" onClick={onOverride} className="font-display text-xs tracking-wider">
              Override & Book
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConflictModal;
