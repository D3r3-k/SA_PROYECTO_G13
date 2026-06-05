CREATE OR REPLACE FUNCTION sp_find_profile_by_user_and_profile(
    p_user_id UUID,
    p_profile_id UUID
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
    SELECT
        v.profile_id,
        v.user_id,
        v.name,
        v.avatar_url,
        v.created_at,
        v.updated_at
    FROM vw_user_profiles v
    WHERE v.user_id = p_user_id
      AND v.profile_id = p_profile_id
    LIMIT 1;
END;
$$;