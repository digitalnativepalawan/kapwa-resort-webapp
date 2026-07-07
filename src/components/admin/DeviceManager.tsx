import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Tablet, Edit2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const DEPARTMENTS = ['kitchen', 'bar', 'reception', 'admin'] as const;

const DeviceManager = () => {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDept, setNewDept] = useState<string>('kitchen');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ device_name: '', device_id: '', department: '' });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('devices').select('*').order('created_at', { ascending: false });
      return data || [];
    },
  });

  const addDevice = async () => {
    if (!newName.trim() || !newDeviceId.trim()) {
      toast.error('Name and Device ID are required');
      return;
    }
    const { error } = await supabase.from('devices').insert({
      device_name: newName.trim(),
      device_id: newDeviceId.trim(),
      department: newDept,
    });
    if (error) {
      toast.error(error.message.includes('duplicate') ? 'Device ID already exists' : error.message);
      return;
    }
    setNewName('');
    setNewDeviceId('');
    setNewDept('kitchen');
    qc.invalidateQueries({ queryKey: ['devices-admin'] });
    toast.success('Device added');
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from('devices').update({ is_active: active }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['devices-admin'] });
  };

  const deleteDevice = async (id: string) => {
    await supabase.from('devices').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['devices-admin'] });
    toast.success('Device deleted');
  };

  const startEdit = (device: any) => {
    setEditingId(device.id);
    setEditForm({ device_name: device.device_name, device_id: device.device_id, department: device.department });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await supabase.from('devices').update({
      device_name: editForm.device_name,
      device_id: editForm.device_id,
      department: editForm.department,
    }).eq('id', editingId);
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ['devices-admin'] });
    toast.success('Device updated');
  };

  return (
    <section>
      <h3 className="font-display text-sm tracking-wider text-foreground mb-4 flex items-center gap-2">
        <Tablet className="w-4 h-4" /> Device Management
      </h3>

      {/* Device list */}
      <div className="space-y-2 mb-4">
        {devices.map((d: any) => (
          <div key={d.id} className="border border-border rounded-lg p-3 space-y-2">
            {editingId === d.id ? (
              <div className="space-y-2">
                <Input value={editForm.device_name} onChange={e => setEditForm({ ...editForm, device_name: e.target.value })}
                  className="bg-secondary border-border text-foreground font-body text-sm" placeholder="Device name" />
                <Input value={editForm.device_id} onChange={e => setEditForm({ ...editForm, device_id: e.target.value })}
                  className="bg-secondary border-border text-foreground font-body text-sm" placeholder="Device ID" />
                <Select value={editForm.department} onValueChange={v => setEditForm({ ...editForm, department: v })}>
                  <SelectTrigger className="bg-secondary border-border text-foreground font-body text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {DEPARTMENTS.map(d => (
                      <SelectItem key={d} value={d} className="text-foreground font-body text-sm capitalize">{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit} className="font-body text-xs gap-1"><Check className="w-3 h-3" /> Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="font-body text-xs gap-1"><X className="w-3 h-3" /> Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-display text-sm text-foreground">{d.device_name}</p>
                  <p className="font-body text-xs text-cream-dim">
                    ID: {d.device_id} · <span className="capitalize">{d.department}</span>
                    {d.last_login_at && (
                      <> · Last login {formatDistanceToNow(new Date(d.last_login_at), { addSuffix: true })}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={d.is_active} onCheckedChange={v => toggleActive(d.id, v)} />
                  <Button size="icon" variant="ghost" onClick={() => startEdit(d)} className="w-8 h-8 text-cream-dim hover:text-foreground">
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteDevice(d.id)} className="w-8 h-8 text-cream-dim hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {devices.length === 0 && (
          <p className="font-body text-sm text-cream-dim text-center py-4">No devices registered yet</p>
        )}
      </div>

      {/* Add new device */}
      <div className="border border-dashed border-border rounded-lg p-3 space-y-2">
        <p className="font-body text-xs text-cream-dim">Add New Device</p>
        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Device name (e.g. Kitchen Tablet #1)"
          className="bg-secondary border-border text-foreground font-body text-sm" />
        <Input value={newDeviceId} onChange={e => setNewDeviceId(e.target.value)} placeholder="Device ID (unique identifier)"
          className="bg-secondary border-border text-foreground font-body text-sm" />
        <Select value={newDept} onValueChange={setNewDept}>
          <SelectTrigger className="bg-secondary border-border text-foreground font-body text-sm h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {DEPARTMENTS.map(d => (
              <SelectItem key={d} value={d} className="text-foreground font-body text-sm capitalize">{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={addDevice} className="w-full font-display text-xs tracking-wider gap-1">
          <Plus className="w-4 h-4" /> Add Device
        </Button>
      </div>
    </section>
  );
};

export default DeviceManager;
