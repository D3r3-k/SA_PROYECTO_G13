BEGIN;
CREATE OR REPLACE FUNCTION sp_delete_profile(
    p_user_id UUID,
    p_profile_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM profiles p
    WHERE p.user_id = p_user_id
      AND p.id = p_profile_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count = 0 THEN
        RETURN QUERY
        SELECT
            FALSE AS success,
            'Profile not found for this user'::TEXT AS message;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        TRUE AS success,
        'Profile deleted'::TEXT AS message;
END;
$$;
COMMIT;