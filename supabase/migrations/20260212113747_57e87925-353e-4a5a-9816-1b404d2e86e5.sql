
-- Create tabs table
CREATE TABLE public.tabs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_type TEXT NOT NULL DEFAULT 'WalkIn',
  location_detail TEXT NOT NULL DEFAULT '',
  guest_name TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  payment_method TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on tabs
ALTER TABLE public.tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read tabs" ON public.tabs FOR SELECT USING (true);
CREATE POLICY "Public insert tabs" ON public.tabs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update tabs" ON public.tabs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete tabs" ON public.tabs FOR DELETE USING (true);

-- Add tab_id and service_charge to orders
ALTER TABLE public.orders ADD COLUMN tab_id UUID REFERENCES public.tabs(id);
ALTER TABLE public.orders ADD COLUMN service_charge NUMERIC NOT NULL DEFAULT 0;

-- Enable realtime on tabs
ALTER PUBLICATION supabase_realtime ADD TABLE public.tabs;
