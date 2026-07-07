import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Save, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { sendMessengerMessage } from '@/lib/messenger';
import { useResortProfile } from '@/hooks/useResortProfile';

interface EmployeeRow {
  id: string;
  name: string;
  display_name: string;
  messenger_link: string;
  preferred_contact_method: string;
  active: boolean;
  rate_type: string;
}

const EmployeeContactConfig = () => {
  const qc = useQueryClient();
  const { data: resortProfile } = useResortProfile();
  const [edits, setEdits] = useState<Record<string, Partial<EmployeeRow>>>({});

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-contact-config'],
    queryFn: async () => {
      const { data } = await (supabase.from('employees' as any) as any)
        .select('id, name, display_name, messenger_link, preferred_contact_method, active, rate_type')
        .order('name');
      return (data || []) as EmployeeRow[];
    },
  });

  const getField = (emp: EmployeeRow, field: keyof EmployeeRow) => {
    return edits[emp.id]?.[field] ?? emp[field];
  };

  const setField = (id: string, field: string, value: any) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const saveRow = async (emp: EmployeeRow) => {
    const changes = edits[emp.id];
    if (!changes) return;
    const { error } = await (supabase.from('employees' as any) as any)
      .update(changes)
      .eq('id', emp.id);
    if (error) { toast.error('Failed to save'); return; }
    setEdits(prev => { const n = { ...prev }; delete n[emp.id]; return n; });
    qc.invalidateQueries({ queryKey: ['employees-contact-config'] });
    toast.success(`${emp.display_name || emp.name} updated`);
  };

  const testMessenger = (emp: EmployeeRow) => {
    const link = (edits[emp.id]?.messenger_link ?? emp.messenger_link);
    const active = (edits[emp.id]?.active ?? emp.active);
    sendMessengerMessage(
      { ...emp, messenger_link: link, active },
      'This is a test message.',
      resortProfile?.resort_name || 'Resort'
    );
  };

  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg tracking-wider text-foreground">Employee Contact Configuration</h2>
      <p className="font-body text-xs text-muted-foreground">Configure Facebook Messenger links and preferred contact methods for each employee.</p>

      <div className="space-y-3">
        {employees.map(emp => {
          const hasChanges = !!edits[emp.id];
          return (
            <div key={emp.id} className={`border rounded-lg p-3 space-y-2 ${getField(emp, 'active') ? 'border-border' : 'border-border/50 opacity-60'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-body text-sm font-medium text-foreground">{emp.display_name || emp.name}</p>
                  <p className="font-body text-xs text-muted-foreground capitalize">{emp.rate_type} rate</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-body text-xs text-muted-foreground">Active</span>
                  <Switch
                    checked={getField(emp, 'active') as boolean}
                    onCheckedChange={v => setField(emp.id, 'active', v)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-body text-xs text-muted-foreground">Facebook Profile URL / Username</label>
                <Input
                  value={getField(emp, 'messenger_link') as string}
                  onChange={e => setField(emp.id, 'messenger_link', e.target.value)}
                  placeholder="e.g. john.doe.123 or profile URL"
                  className="bg-secondary border-border text-foreground font-body text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="font-body text-xs text-muted-foreground">Preferred Contact Method</label>
                <Select
                  value={getField(emp, 'preferred_contact_method') as string}
                  onValueChange={v => setField(emp.id, 'preferred_contact_method', v)}
                >
                  <SelectTrigger className="bg-secondary border-border text-foreground font-body text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="messenger">Messenger</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button size="default" onClick={() => saveRow(emp)} disabled={!hasChanges}
                  className="font-display text-xs tracking-wider flex-1 gap-1 min-h-[44px]">
                  <Save className="w-5 h-5" /> Save
                </Button>
                <Button size="default" variant="outline" onClick={() => testMessenger(emp)}
                  disabled={!(getField(emp, 'messenger_link') as string)?.trim()}
                  className="font-display text-xs tracking-wider gap-1 min-h-[44px]">
                  <MessageCircle className="w-5 h-5" /> Test
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default EmployeeContactConfig;
