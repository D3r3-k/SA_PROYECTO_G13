CREATE OR REPLACE FUNCTION fn_standard_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_record_id TEXT;
    v_actor_user_id TEXT;
    v_actor_email TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_new := NULL;
        v_record_id := COALESCE(v_old->>'id', v_old->>'user_id', v_old->>'profile_id');
    ELSE
        v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
        v_new := to_jsonb(NEW);
        v_record_id := COALESCE(v_new->>'id', v_new->>'user_id', v_new->>'profile_id');
    END IF;

    v_actor_user_id := COALESCE(
        NULLIF(current_setting('app.user_id', true), ''),
        v_new->>'user_id',
        v_new->>'id',
        v_old->>'user_id',
        v_old->>'id'
    );
    v_actor_email := COALESCE(
        NULLIF(current_setting('app.user_email', true), ''),
        v_new->>'email',
        v_old->>'email'
    );

    INSERT INTO audit_log(actor_user_id, actor_email, action, table_name, record_id, old_state, new_state)
    VALUES (v_actor_user_id, v_actor_email, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_identity_audit_report(
    p_table_name TEXT,
    p_actor_user_id TEXT,
    p_action TEXT,
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_limit INTEGER,
    p_offset INTEGER
)
RETURNS TABLE (
    audit_id TEXT,
    actor_user_id TEXT,
    actor_email TEXT,
    action TEXT,
    table_name TEXT,
    record_id TEXT,
    old_state_json TEXT,
    new_state_json TEXT,
    created_at TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id::TEXT,
        COALESCE(a.actor_user_id, ''),
        COALESCE(a.actor_email, ''),
        a.action,
        a.table_name,
        COALESCE(a.record_id, ''),
        COALESCE(a.old_state::TEXT, ''),
        COALESCE(a.new_state::TEXT, ''),
        a.created_at::TEXT
    FROM audit_log a
    WHERE (COALESCE(p_table_name, '') = '' OR a.table_name = p_table_name)
      AND (COALESCE(p_actor_user_id, '') = '' OR a.actor_user_id = p_actor_user_id)
      AND (COALESCE(p_action, '') = '' OR a.action = UPPER(p_action))
      AND (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at <= p_to)
    ORDER BY a.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 100), 1), 500)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$ LANGUAGE plpgsql STABLE;
