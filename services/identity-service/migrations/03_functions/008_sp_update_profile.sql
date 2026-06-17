BEGIN;
CREATE OR REPLACE FUNCTION sp_update_profile(
    p_user_id UUID,
    p_profile_id UUID,
    p_name VARCHAR,
    p_avatar_url TEXT
)
RETURNS TABLE (
    profile_id UUID,
    user_id UUID,
    name VARCHAR,
    avatar_url TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    UPDATE profiles p
    SET
        name = TRIM(p_name),
        avatar_url = p_avatar_url,
        updated_at = CURRENT_TIMESTAMP
    WHERE p.user_id = p_user_id
      AND p.id = p_profile_id
    RETURNING
        p.id AS profile_id,
        p.user_id,
        p.name,
        p.avatar_url,
        p.created_at,
        p.updated_at;
END;
$$;
COMMIT;