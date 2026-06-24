BEGIN;

CREATE OR REPLACE FUNCTION sp_find_user_by_email(
    p_email VARCHAR
)
RETURNS TABLE (
    id UUID,
    email VARCHAR,
    password_hash TEXT,
    full_name VARCHAR,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.email,
        u.password_hash,
        u.full_name,
        u.created_at,
        u.updated_at
    FROM users u
    WHERE u.email = LOWER(TRIM(p_email))
      AND u.deleted_at IS NULL
    LIMIT 1;
END;
$$;

COMMIT;
