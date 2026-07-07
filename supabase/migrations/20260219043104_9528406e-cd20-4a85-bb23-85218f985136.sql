
CREATE TABLE public.invoice_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thank_you_message text NOT NULL DEFAULT 'Thank you for dining with us!',
  business_hours text NOT NULL DEFAULT 'Open daily: 7AM - 10PM',
  footer_text text NOT NULL DEFAULT '',
  tin_number text NOT NULL DEFAULT '',
  service_charge_pct numeric NOT NULL DEFAULT 10,
  show_service_charge boolean NOT NULL DEFAULT true,
  show_payment_method boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read invoice_settings" ON public.invoice_settings FOR SELECT USING (true);
CREATE POLICY "Public insert invoice_settings" ON public.invoice_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update invoice_settings" ON public.invoice_settings FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER update_invoice_settings_updated_at
  BEFORE UPDATE ON public.invoice_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
