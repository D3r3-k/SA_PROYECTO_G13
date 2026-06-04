CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credential_audit (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason TEXT NOT NULL
);

CREATE OR REPLACE VIEW vw_user_profiles AS
SELECT
    p.id AS profile_id,
    p.user_id,
    p.name,
    p.avatar_url,
    p.created_at,
    p.updated_at
FROM profiles p;

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