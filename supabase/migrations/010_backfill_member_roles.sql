-- Migration 010: Backfill 'role' on existing trip members
-- Members added by accept_trip_invite before migration 009 are missing 'role',
-- which causes is_trip_editor RLS to reject them from inserting activities/expenses.

UPDATE trips
SET members = (
    SELECT jsonb_agg(
        CASE
            WHEN elem->>'role' IS NULL
            THEN elem || '{"role": "editor"}'::jsonb
            ELSE elem
        END
    )
    FROM jsonb_array_elements(members) AS elem
)
WHERE jsonb_array_length(COALESCE(members, '[]'::jsonb)) > 0
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(members) AS m
    WHERE m->>'role' IS NULL
  );
