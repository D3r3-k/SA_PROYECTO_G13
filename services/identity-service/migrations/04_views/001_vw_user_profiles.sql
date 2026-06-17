BEGIN;
CREATE OR REPLACE VIEW vw_user_profiles AS
SELECT
    p.id AS profile_id,
    p.user_id,
    p.name,
    p.avatar_url,
    p.created_at,
    p.updated_at
FROM profiles p;
COMMIT;