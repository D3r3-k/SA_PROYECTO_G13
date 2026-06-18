BEGIN;
CREATE OR REPLACE FUNCTION fn_audit_credential_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
        INSERT INTO credential_audit (id, user_id, reason)
        VALUES (gen_random_uuid(), NEW.id, 'Credential updated');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMIT;