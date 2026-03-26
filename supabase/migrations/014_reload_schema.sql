-- Force PostgREST to reload schema cache so newly added columns like is_spontaneous are broadcast correctly
NOTIFY pgrst, 'reload schema';

-- Extra safety measure, explicit publication of activities to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE activities;
