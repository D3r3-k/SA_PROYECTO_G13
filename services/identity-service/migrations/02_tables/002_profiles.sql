BEGIN;
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    is_child BOOLEAN NOT NULL DEFAULT FALSE,
    parental_pin_hash TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_profiles_parental_pin_child CHECK (
        is_child = FALSE OR parental_pin_hash IS NOT NULL
    )
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_child BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parental_pin_hash TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_profiles_parental_pin_child'
    ) THEN
        ALTER TABLE profiles
        ADD CONSTRAINT chk_profiles_parental_pin_child CHECK (
            is_child = FALSE OR parental_pin_hash IS NOT NULL
        );
    END IF;
END $$;
COMMIT;
