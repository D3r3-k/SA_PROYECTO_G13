CREATE OR REPLACE PROCEDURE sp_create_profile(
    p_id UUID,
    p_user_id UUID,
    p_name VARCHAR,
    p_avatar_url TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT fn_can_create_profile(p_user_id) THEN
        RAISE EXCEPTION 'User cannot have more than 5 profiles';
    END IF;

    INSERT INTO profiles (
        id,
        user_id,
        name,
        avatar_url
    )
    VALUES (
        p_id,
        p_user_id,
        TRIM(p_name),
        p_avatar_url
    );
END;
$$;