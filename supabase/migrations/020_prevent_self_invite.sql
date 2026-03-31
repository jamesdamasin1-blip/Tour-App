-- Migration 020: Prevent self-invite at the database level
-- Ensures that a trip creator cannot invite themselves, even if the frontend
-- check is bypassed. Complements the existing frontend guard in inviteService.ts.

-- 1. Email-based self-invite: block via trigger that rejects when the to_email
--    matches the from_user's email in auth.users.
CREATE OR REPLACE FUNCTION trip_invites_prevent_self_invite()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    sender_email TEXT;
BEGIN
    -- Look up the sender's email from auth.users
    SELECT email INTO sender_email
    FROM auth.users
    WHERE id = NEW.from_user_id
    LIMIT 1;

    IF sender_email IS NOT NULL
       AND lower(trim(NEW.to_email)) = lower(trim(sender_email))
    THEN
        RAISE EXCEPTION 'You cannot invite yourself to your own trip'
            USING ERRCODE = 'check_violation',
                  HINT = 'The invited email matches the creator''s email.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_invites_self_invite_check ON trip_invites;

CREATE TRIGGER trip_invites_self_invite_check
    BEFORE INSERT OR UPDATE ON trip_invites
    FOR EACH ROW
    EXECUTE FUNCTION trip_invites_prevent_self_invite();

COMMENT ON TRIGGER trip_invites_self_invite_check ON trip_invites IS
    'Prevents a user from inviting themselves via email match against auth.users';
