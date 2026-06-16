CREATE OR REPLACE FUNCTION fn_list_user_roles(p_user_id UUID)
RETURNS TABLE (role_name TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT r.name::TEXT
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
    ORDER BY r.name;
END;
$$;

CREATE OR REPLACE FUNCTION fn_list_user_permissions(p_user_id UUID)
RETURNS TABLE (permission_code TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT p.code::TEXT
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
    ORDER BY p.code;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_assign_role_to_user(p_user_id UUID, p_role_name VARCHAR)
LANGUAGE plpgsql
AS $$
DECLARE
    v_role_id UUID;
BEGIN
    SELECT id INTO v_role_id
    FROM roles
    WHERE name = LOWER(TRIM(p_role_name))
    LIMIT 1;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'role not found: %', p_role_name;
    END IF;

    INSERT INTO user_roles(user_id, role_id)
    VALUES (p_user_id, v_role_id)
    ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_assign_default_user_role(p_user_id UUID)
LANGUAGE plpgsql
AS $$
BEGIN
    CALL sp_assign_role_to_user(p_user_id, 'user');
END;
$$;
