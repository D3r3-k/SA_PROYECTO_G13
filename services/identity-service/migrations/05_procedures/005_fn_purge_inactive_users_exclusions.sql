BEGIN;

-- Version usada por el cronjob cuando existen usuarios protegidos de pruebas de carga.
-- No elimina usuarios admin ni usuarios cuyo correo venga en p_excluded_emails.
-- Se mantiene la funcion anterior de 1 parametro para no romper llamadas existentes.
--
CREATE OR REPLACE FUNCTION fn_purge_inactive_users(
    p_threshold_interval TEXT,
    p_excluded_emails TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH protected_emails AS (
        SELECT LOWER(TRIM(email)) AS email
        FROM UNNEST(COALESCE(p_excluded_emails, ARRAY[]::TEXT[])) AS email
        WHERE TRIM(email) <> ''
    )
    UPDATE users u
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE u.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM protected_emails pe
          WHERE pe.email = LOWER(TRIM(u.email))
      )
      AND u.id NOT IN (
          SELECT ur.user_id
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.name = 'admin'
      )
      AND (
          (u.last_login_at IS NULL     AND u.created_at    < NOW() - p_threshold_interval::INTERVAL)
          OR
          (u.last_login_at IS NOT NULL AND u.last_login_at < NOW() - p_threshold_interval::INTERVAL)
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMIT;
