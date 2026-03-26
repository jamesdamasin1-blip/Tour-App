-- Add CRDT-lite JSONB field tracking and origin trackers across all user tables
ALTER TABLE trips ADD COLUMN IF NOT EXISTS field_updates JSONB DEFAULT '{}';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS last_device_id TEXT;

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS field_updates JSONB DEFAULT '{}';
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS last_device_id TEXT;

ALTER TABLE funding_lots ADD COLUMN IF NOT EXISTS field_updates JSONB DEFAULT '{}';
ALTER TABLE funding_lots ADD COLUMN IF NOT EXISTS last_device_id TEXT;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS field_updates JSONB DEFAULT '{}';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS last_device_id TEXT;

ALTER TABLE activities ADD COLUMN IF NOT EXISTS field_updates JSONB DEFAULT '{}';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS last_device_id TEXT;

-- Reload schema caches to ensure realtime and API layers recognize columns immediately
NOTIFY pgrst, 'reload schema';
