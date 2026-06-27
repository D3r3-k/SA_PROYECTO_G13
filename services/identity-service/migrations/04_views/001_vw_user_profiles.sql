BEGIN;

DROP VIEW IF EXISTS vw_user_profiles;

CREATE OR REPLACE VIEW vw_user_profiles AS
SELECT
    p.id AS profile_id,
    p.user_id,
    p.name,
    p.avatar_url,
    p.is_child,
    (p.parental_pin_hash IS NOT NULL) AS parental_pin_configured,
    p.created_at,
    p.updated_at
FROM profiles p;
COMMIT;