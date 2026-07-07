import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface EditRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: any;
}

const EditRequestModal = ({ open, onOpenChange, request }: EditRequestModalProps) => {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    request_type: '',
    guest_name: '',
    details: '',
  });

  useEffect(() => {
    if (open && request) {
      setForm({
        request_type: request.request_type || '',
        guest_name: request.guest_name || '',
        details: request.details || '',
      });
    }
  }, [open, request]);

  const handleSave = async () => {
    if (!form.request_type.trim()) { toast.error('Request type is required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('guest_requests').update({
        request_type: form.request_type.trim(),
        guest_name: form.guest_name.trim(),
        details: form.details.trim(),
      }).eq('id', request.id);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ['all-requests-experiences'] });
      qc.invalidateQueries({ queryKey: ['recent-requests-history'] });

      toast.success('Request updated');
      onOpenChange(false);
    } catch {
      toast.error('Failed to update request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-sm">Edit Guest Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="font-body text-xs text-muted-foreground">Request Type</label>
            <Input value={form.request_type} onChange={e => setForm(p => ({ ...p, request_type: e.target.value }))}
              placeholder="e.g. Van Transport, Bike Rental"
              className="bg-secondary border-border text-foreground font-body text-sm mt-1" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Guest Name</label>
            <Input value={form.guest_name} onChange={e => setForm(p => ({ ...p, guest_name: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body text-sm mt-1" />
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Details</label>
            <Textarea value={form.details} onChange={e => setForm(p => ({ ...p, details: e.target.value }))}
              rows={4} className="bg-secondary border-border text-foreground font-body text-xs mt-1" />
          </div>
          {request && (
            <p className="font-body text-[10px] text-muted-foreground">Status: {request.status}</p>
          )}
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

export default EditRequestModal;
