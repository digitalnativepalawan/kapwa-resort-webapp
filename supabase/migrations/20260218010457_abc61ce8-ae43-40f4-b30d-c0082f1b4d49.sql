ALTER TABLE resort_ops_expenses
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON resort_ops_expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();