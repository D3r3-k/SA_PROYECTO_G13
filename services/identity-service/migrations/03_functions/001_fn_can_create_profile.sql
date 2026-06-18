BEGIN;
CREATE OR REPLACE FUNCTION fn_can_create_profile(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    profile_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO profile_count
    FROM profiles
    WHERE user_id = p_user_id;

    RETURN profile_count < 5;
END;
$$ LANGUAGE plpgsql;
COMMIT;