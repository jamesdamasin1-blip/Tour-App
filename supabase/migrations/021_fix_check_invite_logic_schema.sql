-- Migration 021: Fix check_invite_logic schema reference
-- This fixes the "relation "trips" does not exist" error that occurs when
-- a user tries to accept a trip invite due to the empty search path used
-- for security hardening.

CREATE OR REPLACE FUNCTION public.check_invite_logic()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  trip_creator_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF LOWER(NEW.from_email) = LOWER(NEW.to_email) THEN
      RAISE EXCEPTION 'Cannot invite yourself';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
      SELECT user_id INTO trip_creator_id FROM public.trips WHERE id = NEW.trip_id;
      IF auth.uid() = trip_creator_id THEN
        RAISE EXCEPTION 'Creator cannot accept an invite to their own trip';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
