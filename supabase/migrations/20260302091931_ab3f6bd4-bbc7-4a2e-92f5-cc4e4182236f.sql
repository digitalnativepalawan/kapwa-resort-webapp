
-- Add department column to ingredients table
ALTER TABLE public.ingredients 
ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen';

-- Add department column to inventory_logs table
ALTER TABLE public.inventory_logs 
ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen';
