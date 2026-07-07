import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Trash2, Copy, Package, ClipboardList, Home, Eye, EyeOff } from 'lucide-react';

const HousekeepingConfig = ({ readOnly = false }: { readOnly?: boolean }) => {
  const qc = useQueryClient();
  const checklistRef = useRef<HTMLDivElement>(null);
  const packageRef = useRef<HTMLDivElement>(null);

  // ── Queries (unchanged) ──
  const { data: roomTypes = [] } = useQuery({
    queryKey: ['room-types'],
    queryFn: async () => {
      const { data } = await supabase.from('room_types').select('*').order('name');
      return data || [];
    },
  });

  const { data: units = [] } = useQuery({
    queryKey: ['units-admin'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').order('unit_name');
      return data || [];
    },
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['housekeeping-checklists'],
    queryFn: async () => {
      const { data } = await supabase.from('housekeeping_checklists').select('*').order('sort_order');
      return data || [];
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['cleaning-packages'],
    queryFn: async () => {
      const { data } = await supabase.from('cleaning_packages').select('*').order('name');
      return data || [];
    },
  });

  const { data: packageItems = [] } = useQuery({
    queryKey: ['cleaning-package-items'],
    queryFn: async () => {
      const { data } = await supabase.from('cleaning_package_items').select('*');
      return data || [];
    },
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const { data } = await supabase.from('ingredients').select('*').order('name');
      return data || [];
    },
  });

  // ── Room Types State (preview only — CRUD moved to RoomSetup) ──
  const [previewRoomTypeId, setPreviewRoomTypeId] = useState<string | null>(null);

  // ── Checklists State ──
  const [selectedChecklistType, setSelectedChecklistType] = useState<string>('');
  const [newItemLabel, setNewItemLabel] = useState('');
  const [newItemRequired, setNewItemRequired] = useState(true);
  const [newItemHasCount, setNewItemHasCount] = useState(false);
  const [newItemCount, setNewItemCount] = useState('');

  const activeChecklistTypeId = selectedChecklistType || (roomTypes.length > 0 ? roomTypes[0].id : '');
  const filteredChecklist = checklists.filter((c: any) => c.room_type_id === activeChecklistTypeId);

  const addChecklistItem = async () => {
    if (!newItemLabel.trim() || !activeChecklistTypeId) return;
    const maxSort = filteredChecklist.reduce((m: number, c: any) => Math.max(m, c.sort_order || 0), 0);
    await supabase.from('housekeeping_checklists').insert({
      room_type_id: activeChecklistTypeId,
      item_label: newItemLabel.trim(),
      is_required: newItemRequired,
      count_expected: newItemHasCount && newItemCount ? parseInt(newItemCount) : null,
      sort_order: maxSort + 1,
    });
    setNewItemLabel('');
    setNewItemCount('');
    setNewItemRequired(true);
    setNewItemHasCount(false);
    qc.invalidateQueries({ queryKey: ['housekeeping-checklists'] });
    toast.success('Checklist item added');
  };

  const toggleChecklistRequired = async (item: any) => {
    await supabase.from('housekeeping_checklists').update({ is_required: !item.is_required }).eq('id', item.id);
    qc.invalidateQueries({ queryKey: ['housekeeping-checklists'] });
  };

  const updateChecklistCount = async (id: string, count: number | null) => {
    await supabase.from('housekeeping_checklists').update({ count_expected: count }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['housekeeping-checklists'] });
  };

  const deleteChecklistItem = async (id: string) => {
    await supabase.from('housekeeping_checklists').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['housekeeping-checklists'] });
    toast.success('Checklist item deleted');
  };

  // ── Cleaning Packages State ──
  const [selectedPackageType, setSelectedPackageType] = useState<string>('');
  const [newPackageName, setNewPackageName] = useState('');
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [addIngredientId, setAddIngredientId] = useState('');
  const [addIngredientQty, setAddIngredientQty] = useState('');

  const activePackageTypeId = selectedPackageType || (roomTypes.length > 0 ? roomTypes[0].id : '');
  const filteredPackages = packages.filter((p: any) => p.room_type_id === activePackageTypeId);

  const addPackage = async () => {
    if (!newPackageName.trim() || !activePackageTypeId) return;
    await supabase.from('cleaning_packages').insert({
      room_type_id: activePackageTypeId,
      name: newPackageName.trim(),
    });
    setNewPackageName('');
    qc.invalidateQueries({ queryKey: ['cleaning-packages'] });
    toast.success('Package created');
  };

  const deletePackage = async (id: string) => {
    await supabase.from('cleaning_packages').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['cleaning-packages'] });
    toast.success('Package deleted');
  };

  const duplicatePackage = async (pkg: any) => {
    const { data: newPkg } = await supabase.from('cleaning_packages').insert({
      room_type_id: pkg.room_type_id,
      name: `${pkg.name} (Copy)`,
    }).select().single();
    if (newPkg) {
      const items = packageItems.filter((pi: any) => pi.package_id === pkg.id);
      for (const item of items) {
        await supabase.from('cleaning_package_items').insert({
          package_id: newPkg.id,
          ingredient_id: item.ingredient_id,
          default_quantity: item.default_quantity,
        });
      }
    }
    qc.invalidateQueries({ queryKey: ['cleaning-packages', 'cleaning-package-items'] });
    toast.success('Package duplicated');
  };

  const addPackageItem = async (packageId: string) => {
    if (!addIngredientId || !addIngredientQty) return;
    await supabase.from('cleaning_package_items').insert({
      package_id: packageId,
      ingredient_id: addIngredientId,
      default_quantity: parseFloat(addIngredientQty) || 0,
    });
    setAddIngredientId('');
    setAddIngredientQty('');
    qc.invalidateQueries({ queryKey: ['cleaning-package-items'] });
    toast.success('Supply added');
  };

  const deletePackageItem = async (id: string) => {
    await supabase.from('cleaning_package_items').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['cleaning-package-items'] });
    toast.success('Supply removed');
  };

  const updatePackageItemQty = async (id: string, qty: number) => {
    await supabase.from('cleaning_package_items').update({ default_quantity: qty }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['cleaning-package-items'] });
  };

  const getIngredientName = (id: string) => {
    const ing = ingredients.find((i: any) => i.id === id);
    return ing ? ing.name : 'Unknown';
  };

  const getIngredientUnit = (id: string) => {
    const ing = ingredients.find((i: any) => i.id === id);
    return ing?.unit || '';
  };

  const getRoomTypeName = (id: string) => {
    const rt = roomTypes.find((r: any) => r.id === id);
    return rt?.name || '';
  };

  const scrollToChecklist = (roomTypeId: string) => {
    setSelectedChecklistType(roomTypeId);
    setTimeout(() => checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const scrollToPackage = (roomTypeId: string) => {
    setSelectedPackageType(roomTypeId);
    setTimeout(() => packageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

   return (
    <section className="space-y-6">
      <h3 className="font-display text-sm tracking-wider text-foreground flex items-center gap-2">
        <Home className="w-4 h-4" /> Housekeeping Configuration
      </h3>

      {/* ═══ SECTION 2: Inspection Checklists ═══ */}
      <div ref={checklistRef} className="border border-border rounded-lg p-4 space-y-4">
        <h4 className="font-display text-xs tracking-widest text-muted-foreground uppercase">Inspection Checklists (per room type)</h4>

        {roomTypes.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">Add room types first.</p>
        ) : (
          <>
            <Select value={activeChecklistTypeId} onValueChange={setSelectedChecklistType}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                <SelectValue placeholder="Select room type" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {roomTypes.map((rt: any) => (
                  <SelectItem key={rt.id} value={rt.id} className="text-foreground font-body text-xs">{rt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <p className="font-display text-sm tracking-wider text-foreground uppercase">
              {getRoomTypeName(activeChecklistTypeId)} Checklist
            </p>

            <div className="space-y-1">
              {filteredChecklist.map((item: any) => (
                <div key={item.id} className="flex items-center gap-2 border border-border rounded p-2">
                  <Checkbox checked disabled className="shrink-0" />
                  <span className="font-body text-sm text-foreground flex-1 min-w-0 truncate">{item.item_label}</span>
                  <Button
                    variant={item.is_required ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-[10px] font-display px-2 shrink-0"
                    onClick={() => toggleChecklistRequired(item)}
                    disabled={readOnly}
                  >
                    {item.is_required ? 'Required' : 'Optional'}
                  </Button>
                  {item.count_expected ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground font-body">Expected:</span>
                      <Input
                        type="number"
                        value={item.count_expected}
                        onChange={e => updateChecklistCount(item.id, parseInt(e.target.value) || null)}
                        className="bg-secondary border-border text-foreground font-body h-7 w-14 text-xs"
                        disabled={readOnly}
                      />
                    </div>
                  ) : (
                    !readOnly && (
                      <Button variant="ghost" size="sm" className="h-7 text-[10px] font-body text-muted-foreground px-2 shrink-0"
                        onClick={() => updateChecklistCount(item.id, 1)}>
                        + Count
                      </Button>
                    )
                  )}
                  {!readOnly && (
                    <Button variant="ghost" size="icon" onClick={() => deleteChecklistItem(item.id)} className="text-destructive h-7 w-7 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {!readOnly && (
              <>
                <div className="space-y-2 border border-border rounded-lg p-3">
                  <p className="font-display text-xs tracking-wider text-muted-foreground">+ Add Checklist Item</p>
                  <Input value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)} placeholder="Item label (e.g. TV - Working)"
                    className="bg-secondary border-border text-foreground font-body" />
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2">
                      <Checkbox checked={newItemRequired} onCheckedChange={v => setNewItemRequired(!!v)} />
                      <span className="font-body text-xs text-muted-foreground">Required</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch checked={newItemHasCount} onCheckedChange={setNewItemHasCount} />
                      <span className="font-body text-xs text-muted-foreground">Count field</span>
                    </label>
                    {newItemHasCount && (
                      <Input value={newItemCount} onChange={e => setNewItemCount(e.target.value)} placeholder="Expected"
                        className="bg-secondary border-border text-foreground font-body h-8 w-20" type="number" />
                    )}
                  </div>
                  <Button onClick={addChecklistItem} variant="outline" className="w-full font-display text-xs tracking-wider">
                    <Plus className="w-3 h-3 mr-1" /> Add Item
                  </Button>
                </div>

                <Button variant="secondary" className="w-full font-display text-xs tracking-wider" onClick={() => toast.success('Checklist saved')}>
                  Save Checklist
                </Button>
              </>
            )}
          </>
        )}
      </div>

      {/* ═══ SECTION 3: Cleaning Packages ═══ */}
      <div ref={packageRef} className="border border-border rounded-lg p-4 space-y-4">
        <h4 className="font-display text-xs tracking-widest text-muted-foreground uppercase">
          Cleaning Packages <span className="normal-case">(per room type — auto-deduct from inventory)</span>
        </h4>

        {roomTypes.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">Add room types first.</p>
        ) : (
          <>
            <Select value={activePackageTypeId} onValueChange={setSelectedPackageType}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                <SelectValue placeholder="Select room type" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {roomTypes.map((rt: any) => (
                  <SelectItem key={rt.id} value={rt.id} className="text-foreground font-body text-xs">{rt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filteredPackages.map((pkg: any) => {
              const items = packageItems.filter((pi: any) => pi.package_id === pkg.id);
              const isEditing = editingPackageId === pkg.id;
              return (
                <div key={pkg.id} className="border border-border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-sm text-foreground tracking-wider">
                      {getRoomTypeName(activePackageTypeId)} — {pkg.name}
                    </p>
                    {!readOnly && (
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-7 text-xs font-display gap-1" onClick={() => setEditingPackageId(isEditing ? null : pkg.id)}>
                          <ClipboardList className="w-3 h-3" /> {isEditing ? 'Done' : 'Edit'}
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs font-display gap-1" onClick={() => duplicatePackage(pkg)}>
                          <Copy className="w-3 h-3" /> Duplicate
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deletePackage(pkg.id)} className="text-destructive h-7 w-7">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {items.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {items.map((pi: any) => (
                        <div key={pi.id} className="flex items-center gap-2 bg-secondary/50 rounded p-2">
                          <span className="font-body text-xs text-foreground flex-1">
                            {getIngredientName(pi.ingredient_id)}
                          </span>
                          {isEditing ? (
                            <>
                              <Input
                                type="number"
                                value={pi.default_quantity}
                                onChange={e => updatePackageItemQty(pi.id, parseFloat(e.target.value) || 0)}
                                className="bg-secondary border-border text-foreground font-body h-7 w-16 text-xs"
                              />
                              <span className="text-[10px] text-muted-foreground font-body">{getIngredientUnit(pi.ingredient_id)}</span>
                              <Button variant="ghost" size="icon" onClick={() => deletePackageItem(pi.id)} className="text-destructive h-6 w-6">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground font-body">
                              {pi.default_quantity} {getIngredientUnit(pi.ingredient_id)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isEditing && (
                    <div className="flex gap-2 pt-2 border-t border-border/50">
                      <Select value={addIngredientId} onValueChange={setAddIngredientId}>
                        <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8 flex-1">
                          <SelectValue placeholder="Select supply" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border max-h-48">
                          {ingredients.map((ing: any) => (
                            <SelectItem key={ing.id} value={ing.id} className="text-foreground font-body text-xs">
                              {ing.name} ({ing.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="number" value={addIngredientQty} onChange={e => setAddIngredientQty(e.target.value)}
                        placeholder="Qty" className="bg-secondary border-border text-foreground font-body h-8 w-20 text-xs" />
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => addPackageItem(pkg.id)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {!readOnly && (
              <div className="flex gap-2">
                <Input value={newPackageName} onChange={e => setNewPackageName(e.target.value)} placeholder="New package name (e.g. Deep Clean)"
                  className="bg-secondary border-border text-foreground font-body" onKeyDown={e => e.key === 'Enter' && addPackage()} />
                <Button onClick={addPackage} size="icon" variant="outline"><Plus className="w-4 h-4" /></Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default HousekeepingConfig;
