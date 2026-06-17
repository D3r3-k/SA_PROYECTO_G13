BEGIN;
DROP TRIGGER IF EXISTS trg_audit_users ON users;
CREATE TRIGGER trg_audit_users
AFTER INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_profiles ON profiles;
CREATE TRIGGER trg_audit_profiles
AFTER INSERT OR UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_credential_audit ON credential_audit;
CREATE TRIGGER trg_audit_credential_audit
AFTER INSERT OR UPDATE ON credential_audit
FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_roles ON roles;
CREATE TRIGGER trg_audit_roles
AFTER INSERT OR UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_permissions ON permissions;
CREATE TRIGGER trg_audit_permissions
AFTER INSERT OR UPDATE ON permissions
FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_user_roles ON user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE ON user_roles
FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_role_permissions ON role_permissions;
CREATE TRIGGER trg_audit_role_permissions
AFTER INSERT OR UPDATE ON role_permissions
FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();
COMMIT;