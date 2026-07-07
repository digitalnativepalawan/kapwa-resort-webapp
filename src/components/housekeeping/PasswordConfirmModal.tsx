import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';

interface PasswordConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (employee: { id: string; name: string; display_name: string }) => void;
  title?: string;
  description?: string;
}

const PasswordConfirmModal = ({ open, onClose, onConfirm, title = 'Confirm with PIN', description = 'Enter your name and PIN to confirm this action.' }: PasswordConfirmModalProps) => {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!name.trim() || !pin) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('employee-auth', {
        body: { action: 'verify', name: name.trim(), pin },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Verification failed');
        setLoading(false);
        return;
      }
      const emp = data.employee;
      onConfirm({ id: emp.id, name: emp.name, display_name: emp.display_name || emp.name });
      setName('');
      setPin('');
    } catch {
      toast.error('Verification failed');
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setName(''); setPin(''); } }}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider flex items-center gap-2">
            <Lock className="w-4 h-4" /> {title}
          </DialogTitle>
          <DialogDescription className="font-body text-xs text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            className="bg-secondary border-border text-foreground font-body text-center h-12"
            onKeyDown={e => { if (e.key === 'Enter') document.getElementById('hk-pin')?.focus(); }}
            autoFocus
          />
          <Input
            id="hk-pin"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="PIN"
            className="bg-secondary border-border text-foreground font-body text-center text-2xl tracking-[0.5em] h-14"
            onKeyDown={e => { if (e.key === 'Enter') handleVerify(); }}
          />
          <Button
            onClick={handleVerify}
            disabled={loading || !name.trim() || !pin}
            className="w-full font-display tracking-wider min-h-[44px]"
          >
            {loading ? 'Verifying...' : 'Confirm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PasswordConfirmModal;
