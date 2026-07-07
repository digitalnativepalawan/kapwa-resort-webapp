import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

const DEPT_LABELS: Record<string, string> = {
  kitchen: '🍳 Kitchen',
  bar: '🍸 Bar',
  gardens: '🌿 Gardens',
  housekeeping: '🏨 Housekeeping',
};

interface RecipeEditorProps {
  menuItemId: string;
  onFoodCostUpdate?: (cost: number) => void;
  hasOverride?: boolean;
}

const RecipeEditor = ({ menuItemId, onFoodCostUpdate, hasOverride }: RecipeEditorProps) => {
  const qc = useQueryClient();

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: async () => {
      const { data } = await supabase.from('ingredients').select('*').order('name');
      return data || [];
    },
  });

  const { data: recipeIngredients = [], isLoading } = useQuery({
    queryKey: ['recipe_ingredients', menuItemId],
    queryFn: async () => {
      const { data } = await supabase
        .from('recipe_ingredients')
        .select('*, ingredients(*)')
        .eq('menu_item_id', menuItemId);
      return data || [];
    },
  });

  const [newIngId, setNewIngId] = useState('');
  const [newQty, setNewQty] = useState('');
  const [qtyError, setQtyError] = useState(false);

  const calculatedCost = useMemo(() => {
    return recipeIngredients.reduce((sum: number, ri: any) => {
      const ing = ri.ingredients;
      if (!ing) return sum;
      return sum + (ri.quantity * ing.cost_per_unit);
    }, 0);
  }, [recipeIngredients]);

  useEffect(() => {
    onFoodCostUpdate?.(calculatedCost);
  }, [calculatedCost, onFoodCostUpdate]);

  const addIngredient = async () => {
    if (!newIngId) {
      toast.error('Select an ingredient');
      return;
    }
    const qty = parseFloat(newQty);
    if (!newQty || isNaN(qty) || qty <= 0) {
      setQtyError(true);
      toast.error('Quantity is required and must be greater than 0');
      return;
    }
    setQtyError(false);
    const { error } = await supabase.from('recipe_ingredients').upsert({
      menu_item_id: menuItemId,
      ingredient_id: newIngId,
      quantity: qty,
    }, { onConflict: 'menu_item_id,ingredient_id' });
    if (error) {
      toast.error('Failed to add ingredient');
      return;
    }
    setNewIngId('');
    setNewQty('');
    qc.invalidateQueries({ queryKey: ['recipe_ingredients', menuItemId] });
    toast.success('Ingredient added');
  };

  const removeIngredient = async (id: string) => {
    await supabase.from('recipe_ingredients').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['recipe_ingredients', menuItemId] });
  };

  const updateQty = async (id: string, qty: number) => {
    if (qty <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }
    await supabase.from('recipe_ingredients').update({ quantity: qty }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['recipe_ingredients', menuItemId] });
  };

  const availableIngredients = ingredients.filter(
    (i: any) => !recipeIngredients.some((ri: any) => ri.ingredient_id === i.id)
  );

  // Group available ingredients by department
  const groupedAvailable = availableIngredients.reduce((acc: Record<string, any[]>, ing: any) => {
    const dept = ing.department || 'kitchen';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(ing);
    return acc;
  }, {});

  const hasRecipe = recipeIngredients.length > 0;

  if (isLoading) return <p className="font-body text-xs text-cream-dim">Loading recipe...</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-xs tracking-wider text-foreground">Recipe Ingredients</h4>
        {calculatedCost > 0 && (
          <span className="font-display text-xs text-gold">
            Cost: ₱{calculatedCost.toFixed(2)}
          </span>
        )}
      </div>

      {/* Warning when override is active but recipe exists */}
      {hasRecipe && hasOverride && (
        <div className="flex items-start gap-2 p-2 rounded bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="font-body text-[11px] text-destructive">
            Food cost override is active — recipe-based auto-calculation is disabled. Clear the override field to use recipe math.
          </p>
        </div>
      )}

      {/* Recipe ingredient table header */}
      {hasRecipe && (
        <div className="grid grid-cols-[1fr_60px_60px_60px_28px] gap-1 text-[10px] font-display text-cream-dim uppercase tracking-wider px-1">
          <span>Ingredient</span>
          <span>Unit</span>
          <span>Cost/Unit</span>
          <span>Qty</span>
          <span></span>
        </div>
      )}

      {/* Existing ingredients */}
      {!hasRecipe && (
        <p className="font-body text-xs text-cream-dim">No ingredients added yet</p>
      )}
      {recipeIngredients.map((ri: any) => {
        const ing = ri.ingredients;
        if (!ing) return null;
        return (
          <div key={ri.id} className="grid grid-cols-[1fr_60px_60px_60px_28px] gap-1 items-center">
            <span className="font-body text-xs text-foreground truncate flex items-center gap-1">
              {ing.name}
              <Badge variant="outline" className="text-[8px] py-0 px-1 border-muted-foreground/30 shrink-0">
                {DEPT_LABELS[ing.department] || ing.department}
              </Badge>
            </span>
            <span className="font-body text-[10px] text-cream-dim">
              {ing.unit}
            </span>
            <span className="font-body text-[10px] text-cream-dim">
              ₱{ing.cost_per_unit}
            </span>
            <Input
              type="number"
              value={ri.quantity}
              onChange={e => updateQty(ri.id, parseFloat(e.target.value) || 0)}
              className="bg-secondary border-border text-foreground font-body h-7 text-xs px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min="0.01"
              step="any"
            />
            <button onClick={() => removeIngredient(ri.id)} className="text-destructive hover:text-destructive/80 flex justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {/* Line cost total */}
      {hasRecipe && (
        <div className="flex justify-between pt-1 border-t border-border/50">
          <span className="font-display text-[11px] text-cream-dim">Total Food Cost</span>
          <span className="font-display text-[11px] text-gold">₱{calculatedCost.toFixed(2)}</span>
        </div>
      )}

      {/* Add new ingredient — grouped by department */}
      {availableIngredients.length > 0 && (
        <div className="flex items-end gap-2 pt-2 border-t border-border">
          <div className="flex-1">
            <Select value={newIngId} onValueChange={setNewIngId}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs h-8">
                <SelectValue placeholder="Ingredient..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border max-h-48">
                {Object.entries(groupedAvailable).map(([dept, ings]) => (
                  <SelectGroup key={dept}>
                    <SelectLabel className="font-display text-[10px] text-cream-dim">{DEPT_LABELS[dept] || dept}</SelectLabel>
                    {(ings as any[]).map((i: any) => (
                      <SelectItem key={i.id} value={i.id} className="font-body text-xs text-foreground">
                        {i.name} ({i.unit}) — ₱{i.cost_per_unit}/{i.unit}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            type="number"
            value={newQty}
            onChange={e => { setNewQty(e.target.value); setQtyError(false); }}
            placeholder="Qty *"
            className={`bg-secondary border-border text-foreground font-body w-20 h-8 text-xs ${qtyError ? 'border-destructive ring-1 ring-destructive' : ''}`}
            min="0.01"
            step="any"
          />
          <Button size="icon" variant="outline" onClick={addIngredient} className="h-8 w-8">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default RecipeEditor;
