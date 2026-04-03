-- Migration 034: release hardening follow-up
-- 1. Re-pin search_path on the self-invite trigger function.
-- 2. Keep invite acceptance aligned with the cloud-first client flow.

CREATE OR REPLACE FUNCTION public.trip_invites_prevent_self_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    sender_email TEXT;
BEGIN
    SELECT email
    INTO sender_email
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

COMMENT ON FUNCTION public.trip_invites_prevent_self_invite() IS
    'Prevents self-invites while keeping search_path pinned for SECURITY DEFINER safety.';
