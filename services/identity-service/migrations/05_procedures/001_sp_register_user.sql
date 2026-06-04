CREATE OR REPLACE PROCEDURE sp_register_user(
    p_id UUID,
    p_email VARCHAR,
    p_password_hash TEXT,
    p_full_name VARCHAR
)
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO users (
        id,
        email,
        password_hash,
        full_name
    )
    VALUES (
        p_id,
        LOWER(TRIM(p_email)),
        p_password_hash,
        TRIM(p_full_name)
    );
END;
$$;