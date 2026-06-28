BEGIN;

CREATE OR REPLACE FUNCTION fn_purge_inactive_users(p_threshold_interval TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE users
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE deleted_at IS NULL
      AND id NOT IN (
          SELECT ur.user_id
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.name = 'admin'
      )
      AND (
          (last_login_at IS NULL     AND created_at    < NOW() - p_threshold_interval::INTERVAL)
          OR
          (last_login_at IS NOT NULL AND last_login_at < NOW() - p_threshold_interval::INTERVAL)
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMIT;
