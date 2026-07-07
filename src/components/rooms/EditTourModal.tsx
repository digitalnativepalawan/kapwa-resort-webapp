import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface EditTourModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tour: any;
  unitName: string;
  bookingId?: string | null;
  sourceTable?: 'guest_tours' | 'tour_bookings';
}

const EditTourModal = ({ open, onOpenChange, tour, unitName, bookingId, sourceTable = 'guest_tours' }: EditTourModalProps) => {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tour_name: '',
    tour_date: '',
    pickup_time: '',
    pax: '1',
    price: '0',
    provider: '',
    notes: '',
  });

  useEffect(() => {
    if (open && tour) {
      setForm({
        tour_name: tour.tour_name || '',
        tour_date: tour.tour_date || '',
        pickup_time: tour.pickup_time || '',
        pax: String(tour.pax || 1),
        price: String(tour.price || 0),
        provider: tour.provider || '',
        notes: tour.notes || '',
      });
    }
  }, [open, tour]);

  const handleSave = async () => {
    if (!form.tour_name.trim() || !form.tour_date) { toast.error('Tour name and date are required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        tour_name: form.tour_name.trim(),
        tour_date: form.tour_date,
        pickup_time: form.pickup_time.trim(),
        pax: parseInt(form.pax) || 1,
        price: parseFloat(form.price) || 0,
        notes: form.notes.trim(),
      };
      // guest_tours has provider, tour_bookings may not
      if (sourceTable === 'guest_tours') {
        payload.provider = form.provider.trim();
      }

      const { error } = await (supabase.from(sourceTable as any) as any).update(payload).eq('id', tour.id);
      if (error) throw error;

      // Invalidate ALL relevant query keys so changes reflect everywhere
      qc.invalidateQueries({ queryKey: ['all-tours-experiences'] });
      qc.invalidateQueries({ queryKey: ['tour-bookings-experiences'] });
      qc.invalidateQueries({ queryKey: ['reception-tours-today'] });
      qc.invalidateQueries({ queryKey: ['reception-tour-bookings'] });
      qc.invalidateQueries({ queryKey: ['recent-tours-history'] });
      qc.invalidateQueries({ queryKey: ['guest-tours', unitName, bookingId] });

      toast.success('Tour updated');
      onOpenChange(false);
    } catch {
      toast.error('Failed to update tour');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-sm">Edit Tour / Experience</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="font-body text-xs text-muted-foreground">Tour Name</label>
            <Input value={form.tour_name} onChange={e => setForm(p => ({ ...p, tour_name: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body text-sm mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-body text-xs text-muted-foreground">Date</label>
              <Input type="date" value={form.tour_date} onChange={e => setForm(p => ({ ...p, tour_date: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Pickup Time</label>
              <Input value={form.pickup_time} onChange={e => setForm(p => ({ ...p, pickup_time: e.target.value }))}
                placeholder="e.g. 7:00 AM" className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
          </div>
          <div className={`grid gap-2 ${sourceTable === 'guest_tours' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div>
              <label className="font-body text-xs text-muted-foreground">Pax</label>
              <Input type="number" min="1" value={form.pax} onChange={e => setForm(p => ({ ...p, pax: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
            <div>
              <label className="font-body text-xs text-muted-foreground">Price (₱)</label>
              <Input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
            </div>
            {sourceTable === 'guest_tours' && (
              <div>
                <label className="font-body text-xs text-muted-foreground">Provider</label>
                <Input value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))}
                  className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
              </div>
            )}
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={3} className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
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

export default EditTourModal;
