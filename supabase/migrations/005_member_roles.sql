-- 005: Add attribution columns for member roles & change tracking
-- Activities: created_by and last_modified_by (member IDs)
ALTER TABLE activities ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS last_modified_by TEXT;

-- Expenses: created_by and last_modified_by (member IDs)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS last_modified_by TEXT;
