import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface EditGuestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guest: any;
  booking: any;
}

const GUEST_TYPES = [
  { value: 'Hotel Guest', label: 'Hotel Guest', color: 'border-primary text-primary bg-primary/10' },
  { value: 'Walk-In Guest', label: 'Walk-In', color: 'border-accent text-accent bg-accent/10' },
  { value: 'Friends & Family', label: '👨‍👩‍👧 Friends & Family', color: 'border-emerald-500 text-emerald-400 bg-emerald-500/10' },
  { value: 'Direct', label: 'Direct', color: 'border-border text-muted-foreground' },
  { value: 'Airbnb', label: 'Airbnb', color: 'border-border text-muted-foreground' },
  { value: 'Booking.com', label: 'Booking.com', color: 'border-border text-muted-foreground' },
  { value: 'Agoda', label: 'Agoda', color: 'border-border text-muted-foreground' },
];

const EditGuestModal = ({ open, onOpenChange, guest, booking }: EditGuestModalProps) => {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [isVip, setIsVip] = useState(false);

  const stripVipTag = (notes: string) => (notes || '').replace('[VIP]', '').trim();

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    check_in: '',
    check_out: '',
    adults: '1',
    children: '0',
    platform: 'Hotel Guest',
    room_rate: '0',
    notes: '',
    special_requests: '',
  });

  useEffect(() => {
    if (open && booking && guest) {
      const rawNotes = booking.notes || '';
      setIsVip(rawNotes.includes('[VIP]'));
      setForm({
        full_name: guest.full_name || '',
        phone: guest.phone || '',
        email: guest.email || '',
        check_in: booking.check_in || '',
        check_out: booking.check_out || '',
        adults: String(booking.adults || 1),
        children: String(booking.children || 0),
        platform: booking.platform || 'Hotel Guest',
        room_rate: String(booking.room_rate || 0),
        notes: stripVipTag(rawNotes),
        special_requests: booking.special_requests || '',
      });
    }
  }, [open, booking, guest]);

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error('Guest name is required'); return; }
    setSaving(true);
    try {
      // Build notes with optional [VIP] tag
      const finalNotes = isVip ? `[VIP] ${form.notes}`.trim() : form.notes;

      await Promise.all([
        supabase.from('resort_ops_guests' as any).update({
          full_name: form.full_name.trim(),
          phone: form.phone || null,
          email: form.email || null,
        }).eq('id', guest.id),
        supabase.from('resort_ops_bookings' as any).update({
          check_in: form.check_in,
          check_out: form.check_out,
          adults: parseInt(form.adults) || 1,
          children: parseInt(form.children) || 0,
          platform: form.platform,
          room_rate: parseFloat(form.room_rate) || 0,
          notes: finalNotes,
          special_requests: form.special_requests,
        }).eq('id', booking.id),
      ]);

      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['all-guests'] });
      toast.success('Guest info updated');
      onOpenChange(false);
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const currentType = GUEST_TYPES.find(t => t.value === form.platform) || GUEST_TYPES[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-sm">Edit Guest Info</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Guest Type */}
          <div>
            <label className="font-body text-xs text-muted-foreground">Guest Type</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {GUEST_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm(p => ({ ...p, platform: t.value }))}
                  className={`px-3 py-1.5 border rounded-full font-body text-xs transition-colors ${form.platform === t.value ? t.color : 'border-border text-muted-foreground'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* VIP toggle */}
          <div className="flex items-center gap-2">
          <button
              onClick={() => setIsVip(v => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative border ${isVip ? 'bg-primary border-primary' : 'bg-secondary border-border'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-card rounded-full transition-transform shadow ${isVip ? 'left-5' : 'left-0.5'}`} />
            </button>
            <span className="font-body text-xs text-muted-foreground">Mark as VIP ⭐</span>
          </div>

          {/* Guest details */}
          <div>
            <label className="font-body text-xs text-muted-foreground">Guest Name</label>
            <Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body text-sm mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-body text-xs text-muted-foreground">Phone</label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Email</label>
              <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
          </div>

          {/* Stay dates */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-body text-xs text-muted-foreground">Check-in</label>
              <Input type="date" value={form.check_in} onChange={e => setForm(p => ({ ...p, check_in: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Check-out</label>
              <Input type="date" value={form.check_out} onChange={e => setForm(p => ({ ...p, check_out: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
          </div>

          {/* Pax + Rate */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-body text-xs text-muted-foreground">Adults</label>
              <Input type="number" min="1" value={form.adults} onChange={e => setForm(p => ({ ...p, adults: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Children</label>
              <Input type="number" min="0" value={form.children} onChange={e => setForm(p => ({ ...p, children: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Room Rate</label>
              <Input type="number" value={form.room_rate} onChange={e => setForm(p => ({ ...p, room_rate: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="font-body text-xs text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2} className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Special Requests</label>
            <Textarea value={form.special_requests} onChange={e => setForm(p => ({ ...p, special_requests: e.target.value }))}
              rows={2} className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-display text-xs tracking-wider">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="font-display text-xs tracking-wider">
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditGuestModal;
