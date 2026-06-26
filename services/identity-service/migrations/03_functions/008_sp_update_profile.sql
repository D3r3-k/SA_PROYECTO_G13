BEGIN;
CREATE OR REPLACE FUNCTION sp_update_profile(
    p_user_id UUID,
    p_profile_id UUID,
    p_name VARCHAR,
    p_avatar_url TEXT,
    p_is_child BOOLEAN,
    p_parental_pin_hash TEXT,
    p_replace_parental_pin BOOLEAN
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
    UPDATE profiles p
    SET
        name = TRIM(p_name),
        avatar_url = p_avatar_url,
        is_child = COALESCE(p_is_child, FALSE),
        parental_pin_hash = CASE
            WHEN COALESCE(p_is_child, FALSE) = FALSE THEN NULL
            WHEN COALESCE(p_replace_parental_pin, FALSE) = TRUE THEN p_parental_pin_hash
            ELSE p.parental_pin_hash
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE p.user_id = p_user_id
      AND p.id = p_profile_id
    RETURNING
        p.id AS profile_id,
        p.user_id,
        p.name,
        p.avatar_url,
        p.is_child,
        (p.parental_pin_hash IS NOT NULL) AS parental_pin_configured,
        p.created_at,
        p.updated_at;
END;
$$;
COMMIT;
