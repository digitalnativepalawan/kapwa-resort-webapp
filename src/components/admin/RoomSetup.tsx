import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Check, X, BedDouble } from 'lucide-react';

const RoomSetup = () => {
  const qc = useQueryClient();

  const { data: roomTypes = [] } = useQuery({
    queryKey: ['room-types'],
    queryFn: async () => {
      const { data } = await supabase.from('room_types').select('*').order('name');
      return (data || []) as any[];
    },
  });

  const { data: units = [] } = useQuery({
    queryKey: ['units-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').order('unit_name');
      return data || [];
    },
  });

  const [newRoomType, setNewRoomType] = useState('');
  const [editingRoomTypeId, setEditingRoomTypeId] = useState<string | null>(null);
  const [editingRoomTypeName, setEditingRoomTypeName] = useState('');

  const addRoomType = async () => {
    if (!newRoomType.trim()) return;
    await supabase.from('room_types').insert({ name: newRoomType.trim() });
    setNewRoomType('');
    qc.invalidateQueries({ queryKey: ['room-types'] });
    toast.success('Room type added');
  };

  const deleteRoomType = async (id: string) => {
    await supabase.from('room_types').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['room-types'] });
    toast.success('Room type deleted');
  };

  const saveRoomTypeName = async () => {
    if (!editingRoomTypeId || !editingRoomTypeName.trim()) return;
    await supabase.from('room_types').update({ name: editingRoomTypeName.trim() }).eq('id', editingRoomTypeId);
    setEditingRoomTypeId(null);
    setEditingRoomTypeName('');
    qc.invalidateQueries({ queryKey: ['room-types'] });
    toast.success('Room type updated');
  };

  const assignRoomType = async (unitId: string, roomTypeId: string | null) => {
    await supabase.from('units').update({ room_type_id: roomTypeId } as any).eq('id', unitId);
    qc.invalidateQueries({ queryKey: ['units-admin'] });
    toast.success('Room type assigned');
  };

  return (
    <section className="space-y-6">
      <h3 className="font-display text-sm tracking-wider text-foreground flex items-center gap-2">
        <BedDouble className="w-4 h-4" /> Room Setup
      </h3>

      {/* Room Types */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <h4 className="font-display text-xs tracking-widest text-muted-foreground uppercase">Room Types & Rates</h4>

        <div className="space-y-2">
          {roomTypes.map((rt: any) => (
            <div key={rt.id} className="flex items-center gap-2 border border-border rounded-lg p-3">
              {editingRoomTypeId === rt.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editingRoomTypeName}
                    onChange={e => setEditingRoomTypeName(e.target.value)}
                    className="bg-secondary border-border text-foreground font-body h-8 flex-1"
                    onKeyDown={e => e.key === 'Enter' && saveRoomTypeName()}
                    autoFocus
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-500" onClick={saveRoomTypeName}>
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRoomTypeId(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="font-body text-sm text-foreground flex-1">{rt.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="font-body text-xs text-muted-foreground">₱</span>
                    <Input
                      type="number"
                      defaultValue={rt.base_rate || 0}
                      onBlur={async (e) => {
                        const val = parseFloat(e.target.value) || 0;
                        if (val !== (rt.base_rate || 0)) {
                          await supabase.from('room_types').update({ base_rate: val } as any).eq('id', rt.id);
                          qc.invalidateQueries({ queryKey: ['room-types'] });
                          toast.success('Rate updated');
                        }
                      }}
                      className="bg-secondary border-border text-foreground font-body h-7 w-24 text-xs"
                      placeholder="Rate/night"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs font-display gap-1" onClick={() => { setEditingRoomTypeId(rt.id); setEditingRoomTypeName(rt.name); }}>
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteRoomType(rt.id)} className="text-destructive h-7 w-7">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newRoomType} onChange={e => setNewRoomType(e.target.value)} placeholder="New room type (e.g. Suite)"
              className="bg-secondary border-border text-foreground font-body" onKeyDown={e => e.key === 'Enter' && addRoomType()} />
            <Button onClick={addRoomType} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Assign Room Types to Units */}
        {roomTypes.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-border">
            <h4 className="font-display text-xs tracking-wider text-muted-foreground">Assign Room Types to Units</h4>
            {units.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between gap-2">
                <span className="font-body text-sm text-foreground truncate flex-1">{u.unit_name}</span>
                <Select value={(u as any).room_type_id || 'none'} onValueChange={v => assignRoomType(u.id, v === 'none' ? null : v)}>
                  <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8 w-40">
                    <SelectValue placeholder="No type" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="none" className="text-muted-foreground font-body text-xs">No type</SelectItem>
                    {roomTypes.map((rt: any) => (
                      <SelectItem key={rt.id} value={rt.id} className="text-foreground font-body text-xs">
                        {rt.name} {rt.base_rate ? `(₱${Number(rt.base_rate).toLocaleString()})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default RoomSetup;
