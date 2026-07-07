
-- Add VAT-compliant columns to resort_ops_expenses
-- "name" column will serve as supplier_name in UI
-- "category" column will serve as expense_category in UI
-- "amount" column will serve as total_amount in UI

ALTER TABLE public.resort_ops_expenses
  ADD COLUMN IF NOT EXISTS supplier_tin text,
  ADD COLUMN IF NOT EXISTS vat_status text NOT NULL DEFAULT 'Non-VAT',
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS official_receipt_number text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS vatable_sale numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_exempt_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zero_rated_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withholding_tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS project_unit text;

-- Backfill existing rows: set vatable_sale = amount for Non-VAT default
UPDATE public.resort_ops_expenses
SET vatable_sale = amount
WHERE vatable_sale = 0 AND amount > 0;
