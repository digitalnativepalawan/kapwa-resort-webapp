-- Add department-specific status tracking to orders
ALTER TABLE public.orders
  ADD COLUMN kitchen_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN bar_status TEXT NOT NULL DEFAULT 'pending';

-- For existing orders, set department statuses based on current overall status
-- If an order is already past New, set the department statuses accordingly
UPDATE public.orders SET 
  kitchen_status = CASE 
    WHEN status IN ('Preparing') THEN 'preparing'
    WHEN status IN ('Served', 'Paid', 'Closed') THEN 'ready'
    ELSE 'pending'
  END,
  bar_status = CASE 
    WHEN status IN ('Preparing') THEN 'preparing'
    WHEN status IN ('Served', 'Paid', 'Closed') THEN 'ready'
    ELSE 'pending'
  END;