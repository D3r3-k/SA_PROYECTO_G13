BEGIN;

DROP FUNCTION IF EXISTS sp_list_profiles_by_user(UUID);

CREATE OR REPLACE FUNCTION sp_list_profiles_by_user(
    p_user_id UUID
)
RETURNS TABLE (
    profile_id UUID,
    user_id UUID,
    name VARCHAR,
    avatar_url TEXT,
    is_child BOOLEAN,
    parental_pin_configured BOOLEAN,
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
        v.is_child,
        v.parental_pin_configured,
        v.created_at,
        v.updated_at
    FROM vw_user_profiles v
    WHERE v.user_id = p_user_id
    ORDER BY v.created_at ASC;
END;
$$;

COMMIT;