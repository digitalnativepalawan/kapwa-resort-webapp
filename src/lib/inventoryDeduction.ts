import { supabase } from '@/integrations/supabase/client';

/**
 * Deduct ingredient stock for all items in an order based on their recipes.
 * Called when an order moves to "Preparing" status.
 *
 * @param orderId - The order triggering the deduction
 * @param items - Array of { name, qty } for items being prepared
 * @param forDepartment - Optional: 'kitchen' or 'bar'. When provided, only deducts
 *   ingredients for items belonging to that department (prevents double-deduction
 *   for items with department='both').
 */
export async function deductInventoryForOrder(
  orderId: string,
  items: Array<{ name: string; qty: number }>,
  forDepartment?: 'kitchen' | 'bar'
) {
  // Get all menu items that match the order items by name
  const itemNames = items.map(i => i.name);
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name, department')
    .in('name', itemNames);

  if (!menuItems || menuItems.length === 0) return;

  // Get recipe ingredients for these menu items
  const menuItemIds = menuItems.map(m => m.id);
  const { data: recipes } = await supabase
    .from('recipe_ingredients')
    .select('*, ingredients(*)')
    .in('menu_item_id', menuItemIds);

  if (!recipes || recipes.length === 0) return;

  // Build a map of menu_item_id -> order qty
  const qtyMap: Record<string, number> = {};
  const deptMap: Record<string, string> = {};
  for (const item of items) {
    const match = menuItems.find(m => m.name === item.name);
    if (match) {
      qtyMap[match.id] = (qtyMap[match.id] || 0) + item.qty;
      deptMap[match.id] = match.department || 'kitchen';
    }
  }

  // Check for existing deductions for this order to prevent duplicates
  const { data: existingLogs } = await supabase
    .from('inventory_logs')
    .select('ingredient_id')
    .eq('order_id', orderId)
    .eq('reason', 'order_deduction');

  const alreadyDeducted = new Set(
    (existingLogs || []).map(l => l.ingredient_id)
  );

  // Deduct each ingredient
  for (const ri of recipes) {
    const orderQty = qtyMap[ri.menu_item_id] || 0;
    if (orderQty === 0) continue;

    const ing = ri.ingredients as any;
    if (!ing) continue;

    // Skip if already deducted for this order
    if (alreadyDeducted.has(ri.ingredient_id)) continue;

    // For "both" department items: only deduct once.
    // When forDepartment is specified, "both" items are assigned to 'kitchen' to deduct.
    // Bar skips them to avoid double-counting.
    const itemDept = deptMap[ri.menu_item_id] || 'kitchen';
    if (forDepartment && itemDept === 'both') {
      // Only kitchen deducts "both" items to prevent double-deduction
      if (forDepartment !== 'kitchen') continue;
    }

    const deduction = ri.quantity * orderQty;

    // Atomic stock decrement via DB function (prevents race conditions)
    await supabase.rpc('decrement_stock', {
      p_ingredient_id: ri.ingredient_id,
      p_amount: deduction,
    });

    // Log the deduction with department
    await supabase.from('inventory_logs').insert({
      ingredient_id: ri.ingredient_id,
      change_qty: -deduction,
      reason: 'order_deduction',
      order_id: orderId,
      department: ing.department || deptMap[ri.menu_item_id] || 'kitchen',
    });
  }
}
