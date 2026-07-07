import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import ConflictModal from './ConflictModal';
import { findConflicts, findAvailableRooms, type BookingWithGuest, type ResortUnit } from './calendarUtils';
import { format, parseISO } from 'date-fns';

const from = (table: string) => supabase.from(table as any);

interface AddReservationModalProps {
  open: boolean;
  onClose: () => void;
  rooms: ResortUnit[];
  bookings: BookingWithGuest[];
  canManage: boolean;
  editBooking?: BookingWithGuest | null;
}

const PLATFORMS = ['Direct', 'Airbnb', 'Booking.com', 'Agoda', 'Walk-in', 'Maintenance'];

const AddReservationModal = ({ open, onClose, rooms, bookings, canManage, editBooking }: AddReservationModalProps) => {
  const qc = useQueryClient();
  const isEdit = !!editBooking;
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    guestName: '',
    unitId: '',
    checkIn: '',
    checkOut: '',
    adults: '2',
    children: '0',
    platform: 'Direct',
    roomRate: '0',
    notes: '',
  });

  // Conflict state
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflicts, setConflicts] = useState<BookingWithGuest[]>([]);
  const [availableRooms, setAvailableRooms] = useState<ResortUnit[]>([]);
  const [forceOverride, setForceOverride] = useState(false);

  useEffect(() => {
    if (open) {
      if (editBooking) {
        setForm({
          guestName: editBooking.resort_ops_guests?.full_name || '',
          unitId: editBooking.unit_id || '',
          checkIn: editBooking.check_in,
          checkOut: editBooking.check_out,
          adults: String(editBooking.adults),
          children: String(editBooking.children),
          platform: editBooking.platform,
          roomRate: String(editBooking.room_rate),
          notes: editBooking.notes || '',
        });
      } else {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        setForm({ guestName: '', unitId: '', checkIn: today, checkOut: '', adults: '2', children: '0', platform: 'Direct', roomRate: '0', notes: '' });
      }
      setForceOverride(false);
      setConflictOpen(false);
    }
  }, [open, editBooking]);

  const update = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  // Live conflict detection per room
  const hasDates = form.checkIn && form.checkOut && form.checkIn < form.checkOut;

  const roomConflictMap = useMemo(() => {
    const map = new Map<string, BookingWithGuest[]>();
    if (!hasDates) return map;
    for (const room of rooms) {
      const conflicts = findConflicts(bookings, room.id, form.checkIn, form.checkOut, editBooking?.id);
      if (conflicts.length > 0) {
        map.set(room.id, conflicts);
      }
    }
    return map;
  }, [rooms, bookings, form.checkIn, form.checkOut, hasDates, editBooking?.id]);

  // Live conflicts for currently selected room
  const liveConflicts = useMemo(() => {
    if (!form.unitId || !hasDates) return [];
    return roomConflictMap.get(form.unitId) || [];
  }, [form.unitId, hasDates, roomConflictMap]);

  // Sort rooms: available first, conflicting last
  const sortedRooms = useMemo(() => {
    if (!hasDates) return rooms;
    return [...rooms].sort((a, b) => {
      const aConflict = roomConflictMap.has(a.id) ? 1 : 0;
      const bConflict = roomConflictMap.has(b.id) ? 1 : 0;
      return aConflict - bConflict;
    });
  }, [rooms, hasDates, roomConflictMap]);

  const handleSave = async () => {
    if (!form.unitId || !form.checkIn || !form.checkOut) {
      toast.error('Room, check-in, and check-out are required');
      return;
    }
    if (form.checkIn >= form.checkOut) {
      toast.error('Check-out must be after check-in');
      return;
    }
    if (form.platform !== 'Maintenance' && !form.guestName.trim()) {
      toast.error('Guest name is required');
      return;
    }

    // Block save for non-managers if there are conflicts
    if (liveConflicts.length > 0 && !canManage) {
      toast.error('This room is already booked for these dates. Please choose another room.');
      return;
    }

    // Conflict check (skip if force override)
    if (!forceOverride) {
      const found = findConflicts(bookings, form.unitId, form.checkIn, form.checkOut, editBooking?.id);
      if (found.length > 0) {
        setConflicts(found);
        setAvailableRooms(findAvailableRooms(rooms, bookings, form.checkIn, form.checkOut, editBooking?.id));
        setConflictOpen(true);
        return;
      }
    }

    setSaving(true);
    try {
      // Find or create guest
      let guestId = editBooking?.guest_id || null;
      if (form.platform !== 'Maintenance') {
        if (editBooking?.resort_ops_guests?.full_name === form.guestName && guestId) {
          // Same guest, keep id
        } else {
          // Search existing
          const { data: existing } = await from('resort_ops_guests')
            .select('id')
            .ilike('full_name', form.guestName.trim())
            .limit(1);
          if (existing && existing.length > 0) {
            guestId = (existing[0] as any).id;
          } else {
            const { data: newGuest } = await from('resort_ops_guests')
              .insert({ full_name: form.guestName.trim() } as any)
              .select('id')
              .single();
            guestId = newGuest ? (newGuest as any).id : null;
          }
        }
      }

      const payload = {
        unit_id: form.unitId,
        guest_id: guestId,
        check_in: form.checkIn,
        check_out: form.checkOut,
        adults: Number(form.adults) || 0,
        children: Number(form.children) || 0,
        platform: form.platform,
        room_rate: Number(form.roomRate) || 0,
        notes: form.notes || '',
      };

      if (isEdit) {
        await from('resort_ops_bookings').update(payload as any).eq('id', editBooking!.id);
        toast.success('Reservation updated');
      } else {
        await from('resort_ops_bookings').insert(payload as any);
        toast.success('Reservation created');
      }

      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
      setForceOverride(false);
    }
  };

  const handleDelete = async () => {
    if (!editBooking) return;
    setDeleting(true);
    try {
      // If this was an active booking, reset the unit status
      if (editBooking.unit_id) {
        const room = rooms.find(r => r.id === editBooking.unit_id);
        if (room) {
          const { data: displayUnit } = await supabase.from('units' as any).select('id, status').ilike('unit_name', room.name.trim()).limit(1);
          const dUnit = (displayUnit as any)?.[0];
          if (dUnit && (dUnit.status === 'occupied' || dUnit.status === 'to_clean')) {
            // Check if any OTHER active booking exists for this unit
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
            const otherActive = bookings.find(b => b.id !== editBooking.id && b.unit_id === editBooking.unit_id && b.check_in <= today && b.check_out > today);
            if (!otherActive) {
              await supabase.from('units' as any).update({ status: 'ready' } as any).eq('id', dUnit.id);
            }
          }
        }
      }
      await from('resort_ops_bookings').delete().eq('id', editBooking.id);
      toast.success('Reservation deleted');
      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      setDeleteOpen(false);
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const isMaintenance = form.platform === 'Maintenance';

  const formatConflictLabel = (conflicts: BookingWithGuest[]) => {
    const c = conflicts[0];
    const guestName = c.resort_ops_guests?.full_name || c.platform;
    try {
      const ci = format(parseISO(c.check_in), 'MMM d');
      const co = format(parseISO(c.check_out), 'MMM d');
      return `${guestName} ${ci}–${co}`;
    } catch {
      return guestName;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wider">
              {isEdit ? 'Edit Reservation' : 'New Reservation'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="font-display text-xs tracking-wider">Room</Label>
              <Select value={form.unitId} onValueChange={v => update('unitId', v)}>
                <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent>
                  {sortedRooms.map(r => {
                    const conflicts = roomConflictMap.get(r.id);
                    const hasConflict = !!conflicts && hasDates;
                    return (
                      <SelectItem
                        key={r.id}
                        value={r.id}
                        className={hasConflict ? 'opacity-60' : ''}
                      >
                        <span className="flex items-center gap-2 w-full">
                          {hasDates && (
                            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${hasConflict ? 'bg-destructive' : 'bg-emerald-500'}`} />
                          )}
                          <span className={hasConflict ? 'line-through decoration-destructive/50' : ''}>
                            {r.name} — ₱{r.base_price.toLocaleString()}
                          </span>
                          {hasConflict && (
                            <span className="text-[10px] text-destructive ml-auto truncate max-w-[140px]">
                              {formatConflictLabel(conflicts)}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Inline conflict warning */}
            {liveConflicts.length > 0 && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Double booking!</strong>{' '}
                  {rooms.find(r => r.id === form.unitId)?.name} is booked by{' '}
                  {liveConflicts.map((c, i) => {
                    const name = c.resort_ops_guests?.full_name || c.platform;
                    try {
                      const ci = format(parseISO(c.check_in), 'MMM d');
                      const co = format(parseISO(c.check_out), 'MMM d');
                      return <span key={c.id}>{i > 0 && ', '}<strong>{name}</strong> ({ci}–{co})</span>;
                    } catch {
                      return <span key={c.id}>{i > 0 && ', '}<strong>{name}</strong></span>;
                    }
                  })}.
                  {!canManage && ' Pick another room or change dates.'}
                  {canManage && ' You can override as manager.'}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <Label className="font-display text-xs tracking-wider">Platform</Label>
              <Select value={form.platform} onValueChange={v => update('platform', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {!isMaintenance && (
              <div>
                <Label className="font-display text-xs tracking-wider">Guest Name</Label>
                <Input value={form.guestName} onChange={e => update('guestName', e.target.value)} placeholder="Full name" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="font-display text-xs tracking-wider">Check-in</Label>
                <Input type="date" value={form.checkIn} onChange={e => update('checkIn', e.target.value)} />
              </div>
              <div>
                <Label className="font-display text-xs tracking-wider">Check-out</Label>
                <Input type="date" value={form.checkOut} onChange={e => update('checkOut', e.target.value)} />
              </div>
            </div>

            {!isMaintenance && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="font-display text-xs tracking-wider">Adults</Label>
                    <Input type="number" value={form.adults} onChange={e => update('adults', e.target.value)} min="1" />
                  </div>
                  <div>
                    <Label className="font-display text-xs tracking-wider">Children</Label>
                    <Input type="number" value={form.children} onChange={e => update('children', e.target.value)} min="0" />
                  </div>
                </div>

                <div>
                  <Label className="font-display text-xs tracking-wider">Room Rate (₱)</Label>
                  <Input type="number" value={form.roomRate} onChange={e => update('roomRate', e.target.value)} min="0" />
                </div>
              </>
            )}

            <div>
              <Label className="font-display text-xs tracking-wider">Notes</Label>
              <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            {isEdit && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} className="font-display text-xs tracking-wider sm:mr-auto">
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="font-display text-xs tracking-wider">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || (liveConflicts.length > 0 && !canManage)}
              className="font-display text-xs tracking-wider"
            >
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConflictModal
        open={conflictOpen}
        onClose={() => setConflictOpen(false)}
        conflicts={conflicts}
        availableRooms={availableRooms}
        canOverride={canManage}
        onSelectAlternative={room => {
          update('unitId', room.id);
          setConflictOpen(false);
          toast.info(`Switched to ${room.name}`);
        }}
        onOverride={() => {
          setForceOverride(true);
          setConflictOpen(false);
          // Re-trigger save with override
          setTimeout(() => handleSave(), 100);
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-wider">Delete Reservation</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              This will permanently remove this reservation. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-display text-xs tracking-wider">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="font-display text-xs tracking-wider bg-destructive text-destructive-foreground">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AddReservationModal;
