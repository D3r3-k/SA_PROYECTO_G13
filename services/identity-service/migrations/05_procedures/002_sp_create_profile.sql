BEGIN;
CREATE OR REPLACE PROCEDURE sp_create_profile(
    p_id UUID,
    p_user_id UUID,
    p_name VARCHAR,
    p_avatar_url TEXT,
    p_is_child BOOLEAN DEFAULT FALSE,
    p_parental_pin_hash TEXT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT fn_can_create_profile(p_user_id) THEN
        RAISE EXCEPTION 'User cannot have more than 5 profiles';
    END IF;

    IF COALESCE(p_is_child, FALSE) = TRUE AND p_parental_pin_hash IS NULL THEN
        RAISE EXCEPTION 'Child profiles require a parental PIN';
    END IF;

    INSERT INTO profiles (
        id,
        user_id,
        name,
        avatar_url,
        is_child,
        parental_pin_hash
    )
    VALUES (
        p_id,
        p_user_id,
        TRIM(p_name),
        p_avatar_url,
        COALESCE(p_is_child, FALSE),
        CASE WHEN COALESCE(p_is_child, FALSE) THEN p_parental_pin_hash ELSE NULL END
    );
END;
$$;
COMMIT;
