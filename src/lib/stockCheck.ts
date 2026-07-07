import { supabase } from '@/integrations/supabase/client';

export interface Shortage {
  itemName: string;
  ingredientName: string;
  needed: number;
  available: number;
  unit: string;
}

export interface StockCheckResult {
  canFulfill: boolean;
  shortages: Shortage[];
}

/**
 * Check if all cart items can be fulfilled based on current ingredient stock.
 * Returns shortages if any ingredient is insufficient.
 */
export async function checkStock(
  cartItems: Array<{ name: string; quantity: number }>
): Promise<StockCheckResult> {
  if (cartItems.length === 0) return { canFulfill: true, shortages: [] };

  const itemNames = cartItems.map(i => i.name);

  // Get menu items matching cart
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name')
    .in('name', itemNames);

  if (!menuItems || menuItems.length === 0) return { canFulfill: true, shortages: [] };

  // Get recipes with ingredient data
  const menuItemIds = menuItems.map(m => m.id);
  const { data: recipes } = await supabase
    .from('recipe_ingredients')
    .select('menu_item_id, ingredient_id, quantity, ingredients(id, name, current_stock, unit)')
    .in('menu_item_id', menuItemIds);

  if (!recipes || recipes.length === 0) return { canFulfill: true, shortages: [] };

  // Build qty map: menu_item_id -> order qty
  const qtyMap: Record<string, number> = {};
  for (const item of cartItems) {
    const match = menuItems.find(m => m.name === item.name);
    if (match) {
      qtyMap[match.id] = (qtyMap[match.id] || 0) + item.quantity;
    }
  }

  // Aggregate ingredient needs across all items
  const ingredientNeeds: Record<string, { name: string; needed: number; available: number; unit: string }> = {};

  for (const ri of recipes) {
    const orderQty = qtyMap[ri.menu_item_id] || 0;
    if (orderQty === 0) continue;

    const ing = ri.ingredients as any;
    if (!ing) continue;

    const needed = ri.quantity * orderQty;
    if (!ingredientNeeds[ri.ingredient_id]) {
      ingredientNeeds[ri.ingredient_id] = {
        name: ing.name,
        needed: 0,
        available: ing.current_stock,
        unit: ing.unit,
      };
    }
    ingredientNeeds[ri.ingredient_id].needed += needed;
  }

  // Check for shortages
  const shortages: Shortage[] = [];
  for (const [, info] of Object.entries(ingredientNeeds)) {
    if (info.needed > info.available) {
      // Find which menu items use this ingredient
      const affectedRecipes = recipes.filter(
        r => (r.ingredients as any)?.name === info.name
      );
      const affectedItemIds = [...new Set(affectedRecipes.map(r => r.menu_item_id))];
      const affectedNames = affectedItemIds
        .map(id => menuItems.find(m => m.id === id)?.name)
        .filter(Boolean);

      for (const itemName of affectedNames) {
        shortages.push({
          itemName: itemName!,
          ingredientName: info.name,
          needed: info.needed,
          available: info.available,
          unit: info.unit,
        });
      }
    }
  }

  return {
    canFulfill: shortages.length === 0,
    shortages,
  };
}

/**
 * Get stock status for all menu items.
 * Returns a map of menu_item_id -> { soldOut: boolean, lowStock: boolean }
 */
export async function getMenuItemStockStatus(): Promise<
  Record<string, { soldOut: boolean; lowStock: boolean }>
> {
  // Get all recipes with ingredient stock
  const { data: recipes } = await supabase
    .from('recipe_ingredients')
    .select('menu_item_id, quantity, ingredients(id, current_stock, low_stock_threshold, unit)');

  if (!recipes) return {};

  const result: Record<string, { soldOut: boolean; lowStock: boolean }> = {};

  // Group by menu_item_id
  const byItem: Record<string, typeof recipes> = {};
  for (const r of recipes) {
    if (!byItem[r.menu_item_id]) byItem[r.menu_item_id] = [];
    byItem[r.menu_item_id].push(r);
  }

  for (const [menuItemId, itemRecipes] of Object.entries(byItem)) {
    let soldOut = false;
    let lowStock = false;

    for (const ri of itemRecipes) {
      const ing = ri.ingredients as any;
      if (!ing) continue;

      // Sold out if any ingredient can't fulfill even 1 order
      if (ing.current_stock < ri.quantity) {
        soldOut = true;
      }

      // Low stock if any ingredient is below threshold
      if (ing.low_stock_threshold > 0 && ing.current_stock < ing.low_stock_threshold) {
        lowStock = true;
      }
    }

    result[menuItemId] = { soldOut, lowStock };
  }

  return result;
}
