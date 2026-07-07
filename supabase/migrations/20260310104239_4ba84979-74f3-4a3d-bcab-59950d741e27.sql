
-- Add integration-readiness columns to resort_ops_bookings (all nullable/defaulted)
ALTER TABLE resort_ops_bookings
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'walkin',
  ADD COLUMN IF NOT EXISTS external_reservation_id text NULL,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS external_data jsonb NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_external_res_id
  ON resort_ops_bookings (external_reservation_id) WHERE external_reservation_id IS NOT NULL;

-- Create webhook_events table
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'unknown',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  retry_count int NOT NULL DEFAULT 0,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events (event_id);

-- RLS for webhook_events
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read webhook_events" ON webhook_events
  FOR SELECT TO public USING (true);

CREATE POLICY "Public insert webhook_events" ON webhook_events
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Public update webhook_events" ON webhook_events
  FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Public delete webhook_events" ON webhook_events
  FOR DELETE TO public USING (true);
