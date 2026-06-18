BEGIN;
DROP TRIGGER IF EXISTS trg_audit_credential_update ON users;

CREATE TRIGGER trg_audit_credential_update
AFTER UPDATE OF password_hash ON users
FOR EACH ROW
EXECUTE FUNCTION fn_audit_credential_update();
COMMIT;