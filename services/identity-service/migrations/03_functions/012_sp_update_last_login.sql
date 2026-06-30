BEGIN;

CREATE OR REPLACE PROCEDURE sp_update_last_login(p_user_id UUID)
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE users
    SET last_login_at = CURRENT_TIMESTAMP
    WHERE id = p_user_id
      AND deleted_at IS NULL;
END;
$$;

COMMIT;
