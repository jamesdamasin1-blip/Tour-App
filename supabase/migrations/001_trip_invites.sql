-- Trip Invites table
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)

CREATE TABLE IF NOT EXISTS trip_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id TEXT NOT NULL,
    trip_title TEXT NOT NULL,
    from_user_id UUID NOT NULL REFERENCES auth.users(id),
    from_display_name TEXT,
    from_email TEXT,
    to_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

-- Index for fast lookup by invitee email (the hot path)
CREATE INDEX idx_trip_invites_to_email ON trip_invites (to_email, status);

-- Index for sender lookups
CREATE INDEX idx_trip_invites_from_user ON trip_invites (from_user_id);

-- Index for trip-scoped queries
CREATE INDEX idx_trip_invites_trip_id ON trip_invites (trip_id);

-- Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION update_trip_invites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trip_invites_updated_at
    BEFORE UPDATE ON trip_invites
    FOR EACH ROW
    EXECUTE FUNCTION update_trip_invites_updated_at();

-- RLS policies: users can only see invites they sent or received
ALTER TABLE trip_invites ENABLE ROW LEVEL SECURITY;

-- Authenticated users can create invites
CREATE POLICY "Users can create invites"
    ON trip_invites FOR INSERT
    TO authenticated
    WITH CHECK (from_user_id = auth.uid());

-- Users can see invites they sent OR invites addressed to their email
CREATE POLICY "Users can view their invites"
    ON trip_invites FOR SELECT
    TO authenticated
    USING (
        from_user_id = auth.uid()
        OR to_email = auth.email()
    );

-- Invitees can update status (accept/decline) on invites addressed to them
CREATE POLICY "Invitees can respond to invites"
    ON trip_invites FOR UPDATE
    TO authenticated
    USING (to_email = auth.email())
    WITH CHECK (to_email = auth.email());

-- Senders can delete their own pending invites
CREATE POLICY "Senders can delete pending invites"
    ON trip_invites FOR DELETE
    TO authenticated
    USING (from_user_id = auth.uid() AND status = 'pending');

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE trip_invites;
