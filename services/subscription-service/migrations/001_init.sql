BEGIN;

-- ─────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plans (
    id        SERIAL PRIMARY KEY,
    name      VARCHAR(50)     NOT NULL UNIQUE,
    price_usd NUMERIC(10, 2)  NOT NULL CHECK (price_usd >= 0),
    is_active BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id         SERIAL PRIMARY KEY,
    user_id    TEXT            NOT NULL,
    plan_id    INTEGER         NOT NULL REFERENCES plans(id),
    status     VARCHAR(20)     NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_audit (
    id               SERIAL PRIMARY KEY,
    subscription_id  INTEGER         NOT NULL,
    old_plan_id      INTEGER,
    new_plan_id      INTEGER,
    old_status       VARCHAR(20),
    new_status       VARCHAR(20),
    changed_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id           BIGSERIAL   PRIMARY KEY,
    actor_user_id TEXT,
    actor_email  TEXT,
    action       TEXT        NOT NULL,
    table_name   TEXT        NOT NULL,
    record_id    TEXT,
    old_state    JSONB,
    new_state    JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- Indices
-- ─────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscriptions_one_active_per_user
    ON subscriptions (user_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_subscription_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_subscription_audit_log_table      ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS ix_subscription_audit_log_actor      ON audit_log(actor_user_id);

-- ─────────────────────────────────────────
-- Alter tables (idempotentes)
-- ─────────────────────────────────────────

ALTER TABLE plans         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE subscriptions ALTER COLUMN user_id TYPE TEXT USING user_id::text;

-- ─────────────────────────────────────────
-- Vistas
-- ─────────────────────────────────────────

DROP VIEW IF EXISTS vw_user_active_subscription;

CREATE OR REPLACE VIEW vw_user_active_subscription AS
SELECT
    s.id         AS subscription_id,
    s.user_id,
    s.plan_id,
    p.name       AS plan_name,
    p.price_usd,
    s.status,
    s.started_at,
    s.updated_at
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
WHERE s.status = 'active';

-- ─────────────────────────────────────────
-- Funciones
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_calculate_monthly_price(plan_price NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
    RETURN ROUND(plan_price, 2);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_audit_subscription_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.plan_id IS DISTINCT FROM NEW.plan_id
       OR OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO subscription_audit (
            subscription_id,
            old_plan_id,
            new_plan_id,
            old_status,
            new_status
        )
        VALUES (
            OLD.id,
            OLD.plan_id,
            NEW.plan_id,
            OLD.status,
            NEW.status
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_standard_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_user_id TEXT;
    v_actor_email   TEXT;
    v_record_id     TEXT;
BEGIN
    v_actor_user_id := NULLIF(current_setting('app.user_id', true), '');
    v_actor_email   := NULLIF(current_setting('app.user_email', true), '');

    IF v_actor_user_id IS NULL THEN
        v_actor_user_id := COALESCE(to_jsonb(NEW)->>'user_id', to_jsonb(OLD)->>'user_id');
    END IF;

    v_record_id := COALESCE(
        to_jsonb(NEW)->>'id', to_jsonb(OLD)->>'id',
        to_jsonb(NEW)->>'user_id', to_jsonb(OLD)->>'user_id'
    );

    INSERT INTO audit_log(actor_user_id, actor_email, action, table_name, record_id, old_state, new_state)
    VALUES (
        v_actor_user_id,
        v_actor_email,
        TG_OP,
        TG_TABLE_NAME,
        v_record_id,
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_subscription_audit_report(
    p_table_name    TEXT         DEFAULT NULL,
    p_actor_user_id TEXT         DEFAULT NULL,
    p_action        TEXT         DEFAULT NULL,
    p_from          TIMESTAMPTZ  DEFAULT NULL,
    p_to            TIMESTAMPTZ  DEFAULT NULL,
    p_limit         INTEGER      DEFAULT 100,
    p_offset        INTEGER      DEFAULT 0
)
RETURNS TABLE(
    id            BIGINT,
    actor_user_id TEXT,
    actor_email   TEXT,
    action        TEXT,
    table_name    TEXT,
    record_id     TEXT,
    old_state     TEXT,
    new_state     TEXT,
    created_at    TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT a.id,
           COALESCE(a.actor_user_id, ''),
           COALESCE(a.actor_email, ''),
           a.action,
           a.table_name,
           COALESCE(a.record_id, ''),
           COALESCE(a.old_state::TEXT, ''),
           COALESCE(a.new_state::TEXT, ''),
           a.created_at::TEXT
    FROM audit_log a
    WHERE (COALESCE(p_table_name, '')    = '' OR a.table_name    = p_table_name)
      AND (COALESCE(p_actor_user_id, '') = '' OR a.actor_user_id = p_actor_user_id)
      AND (COALESCE(p_action, '')        = '' OR a.action        = UPPER(p_action))
      AND (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to   IS NULL OR a.created_at <= p_to)
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT   GREATEST(COALESCE(p_limit,  100), 1)
    OFFSET  GREATEST(COALESCE(p_offset,   0), 0);
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_audit_subscription_change ON subscriptions;
CREATE TRIGGER trg_audit_subscription_change
AFTER UPDATE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION fn_audit_subscription_change();

DROP TRIGGER IF EXISTS trg_audit_plans ON plans;
CREATE TRIGGER trg_audit_plans
AFTER INSERT OR UPDATE ON plans
FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_standard_audit_subscriptions ON subscriptions;
CREATE TRIGGER trg_standard_audit_subscriptions
AFTER INSERT OR UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_standard_audit_subscription_audit ON subscription_audit;
CREATE TRIGGER trg_standard_audit_subscription_audit
AFTER INSERT OR UPDATE ON subscription_audit
FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

-- ─────────────────────────────────────────
-- Seed de datos (idempotente)
-- ─────────────────────────────────────────

INSERT INTO plans (id, name, price_usd, is_active)
VALUES
    (1, 'Básico',    5.0,  TRUE),
    (2, 'Estándar',  8.0,  TRUE),
    (3, 'Premium',   12.0, TRUE)
ON CONFLICT (id) DO NOTHING;

COMMIT;
