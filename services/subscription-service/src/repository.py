from datetime import datetime, timezone

from psycopg2 import IntegrityError

from src.db import get_connection, get_cursor


PLAN_SEED = [
    (1, "Básico", 5.0, True),
    (2, "Estándar", 8.0, True),
    (3, "Premium", 12.0, True),
]


def initialize_database() -> None:
    with get_cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS plans (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                price_usd NUMERIC(10, 2) NOT NULL CHECK (price_usd >= 0),
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                plan_id INTEGER NOT NULL REFERENCES plans(id),
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )

        cursor.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS ux_subscriptions_one_active_per_user
            ON subscriptions (user_id)
            WHERE status = 'active';
            """
        )

        cursor.execute("DROP VIEW IF EXISTS vw_user_active_subscription;")
        cursor.execute("ALTER TABLE subscriptions ALTER COLUMN user_id TYPE TEXT USING user_id::text;")

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS subscription_audit (
                id SERIAL PRIMARY KEY,
                subscription_id INTEGER NOT NULL,
                old_plan_id INTEGER,
                new_plan_id INTEGER,
                old_status VARCHAR(20),
                new_status VARCHAR(20),
                changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE OR REPLACE VIEW vw_user_active_subscription AS
            SELECT
                s.id AS subscription_id,
                s.user_id,
                s.plan_id,
                p.name AS plan_name,
                p.price_usd,
                s.status,
                s.started_at,
                s.updated_at
            FROM subscriptions s
            JOIN plans p ON p.id = s.plan_id
            WHERE s.status = 'active';

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

            DROP TRIGGER IF EXISTS trg_audit_subscription_change ON subscriptions;

            CREATE TRIGGER trg_audit_subscription_change
            AFTER UPDATE ON subscriptions
            FOR EACH ROW
            EXECUTE FUNCTION fn_audit_subscription_change();
            """
        )

        cursor.execute(
            """
            ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

            CREATE TABLE IF NOT EXISTS audit_log (
                id BIGSERIAL PRIMARY KEY,
                actor_user_id TEXT,
                actor_email TEXT,
                action TEXT NOT NULL,
                table_name TEXT NOT NULL,
                record_id TEXT,
                old_state JSONB,
                new_state JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS ix_subscription_audit_log_created_at ON audit_log(created_at DESC);
            CREATE INDEX IF NOT EXISTS ix_subscription_audit_log_table ON audit_log(table_name);
            CREATE INDEX IF NOT EXISTS ix_subscription_audit_log_actor ON audit_log(actor_user_id);

            CREATE OR REPLACE FUNCTION fn_standard_audit_log()
            RETURNS TRIGGER AS $$
            DECLARE
                v_actor_user_id TEXT;
                v_actor_email TEXT;
                v_record_id TEXT;
            BEGIN
                v_actor_user_id := NULLIF(current_setting('app.user_id', true), '');
                v_actor_email := NULLIF(current_setting('app.user_email', true), '');

                IF v_actor_user_id IS NULL THEN
                    v_actor_user_id := COALESCE(to_jsonb(NEW)->>'user_id', to_jsonb(OLD)->>'user_id');
                END IF;

                v_record_id := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(OLD)->>'id', to_jsonb(NEW)->>'user_id', to_jsonb(OLD)->>'user_id');

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
                p_table_name TEXT DEFAULT NULL,
                p_actor_user_id TEXT DEFAULT NULL,
                p_action TEXT DEFAULT NULL,
                p_from TIMESTAMPTZ DEFAULT NULL,
                p_to TIMESTAMPTZ DEFAULT NULL,
                p_limit INTEGER DEFAULT 100,
                p_offset INTEGER DEFAULT 0
            )
            RETURNS TABLE(
                id BIGINT,
                actor_user_id TEXT,
                actor_email TEXT,
                action TEXT,
                table_name TEXT,
                record_id TEXT,
                old_state TEXT,
                new_state TEXT,
                created_at TEXT
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
                WHERE (COALESCE(p_table_name, '') = '' OR a.table_name = p_table_name)
                  AND (COALESCE(p_actor_user_id, '') = '' OR a.actor_user_id = p_actor_user_id)
                  AND (COALESCE(p_action, '') = '' OR a.action = UPPER(p_action))
                  AND (p_from IS NULL OR a.created_at >= p_from)
                  AND (p_to IS NULL OR a.created_at <= p_to)
                ORDER BY a.created_at DESC, a.id DESC
                LIMIT GREATEST(COALESCE(p_limit, 100), 1)
                OFFSET GREATEST(COALESCE(p_offset, 0), 0);
            END;
            $$ LANGUAGE plpgsql;

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
            """
        )

        cursor.execute("SELECT id FROM plans LIMIT 1;")
        if cursor.fetchone() is None:
            cursor.executemany(
                "INSERT INTO plans (id, name, price_usd, is_active) VALUES (%s, %s, %s, %s);",
                PLAN_SEED,
            )
        


def update_plan(plan_id: int, name: str, price_usd: float, actor_user_id: str = "", actor_email: str = "") -> dict:
    with get_cursor() as cursor:
        cursor.execute("SELECT set_config('app.user_id', %s, true);", (actor_user_id or "",))
        cursor.execute("SELECT set_config('app.user_email', %s, true);", (actor_email or "",))
        cursor.execute(
            """
            UPDATE plans
            SET name = %s, price_usd = %s, updated_at = NOW()
            WHERE id = %s AND is_active = TRUE
            RETURNING id, name, price_usd, is_active;
            """,
            (name, price_usd, plan_id),
        )
        plan = cursor.fetchone()
        if plan is None:
            raise ValueError("plan not found")
        return dict(plan)


def list_plans() -> list[dict]:
    with get_cursor() as cursor:
        cursor.execute(
            "SELECT id, name, price_usd, is_active FROM plans WHERE is_active = TRUE ORDER BY id;"
        )
        return list(cursor.fetchall())


def create_subscription(user_id: str, plan_id: int) -> dict:
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT id, name, price_usd
            FROM plans
            WHERE id = %s
              AND is_active = TRUE;
            """,
            (plan_id,),
        )
        plan = cursor.fetchone()

        if plan is None:
            raise ValueError("plan not found")

        cursor.execute(
            """
            SELECT 
                s.id,
                s.user_id,
                s.plan_id,
                s.status,
                s.started_at,
                s.updated_at,
                p.name AS plan_name,
                p.price_usd
            FROM subscriptions s
            INNER JOIN plans p ON p.id = s.plan_id
            WHERE s.user_id = %s
              AND s.status = 'active'
            LIMIT 1;
            """,
            (user_id,),
        )
        active_subscription = cursor.fetchone()

        if active_subscription is not None:
            raise ValueError("user already has an active subscription")

        cursor.execute(
            """
            INSERT INTO subscriptions (user_id, plan_id, status)
            VALUES (%s, %s, 'active')
            RETURNING id, user_id, plan_id, status, started_at, updated_at;
            """,
            (user_id, plan_id),
        )

        subscription = cursor.fetchone()

        return {
            "id": subscription["id"],
            "user_id": subscription["user_id"],
            "plan_id": subscription["plan_id"],
            "plan_name": plan["name"],
            "price_usd": float(plan["price_usd"]),
            "status": subscription["status"],
            "started_at": subscription["started_at"],
            "updated_at": subscription["updated_at"],
        }


def update_subscription_plan(subscription_id: int, plan_id: int, user_id: str) -> dict:
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT id, name, price_usd
            FROM plans
            WHERE id = %s
              AND is_active = TRUE;
            """,
            (plan_id,),
        )
        plan = cursor.fetchone()

        if plan is None:
            raise ValueError("plan not found")

        cursor.execute(
            """
            UPDATE subscriptions
            SET plan_id = %s,
                updated_at = NOW()
            WHERE id = %s
              AND user_id = %s
              AND status = 'active'
            RETURNING id, user_id, plan_id, status, started_at, updated_at;
            """,
            (plan_id, subscription_id, user_id),
        )

        subscription = cursor.fetchone()

        if subscription is None:
            raise ValueError("active subscription not found")

        return {
            "id": subscription["id"],
            "user_id": subscription["user_id"],
            "plan_id": subscription["plan_id"],
            "plan_name": plan["name"],
            "price_usd": float(plan["price_usd"]),
            "status": subscription["status"],
            "started_at": subscription["started_at"],
            "updated_at": subscription["updated_at"],
        }


def get_subscriptions_by_user(user_id: str) -> list[dict]:
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT s.id, s.user_id, s.plan_id, p.name AS plan_name, p.price_usd, s.status, s.started_at, s.updated_at
            FROM subscriptions s
            JOIN plans p ON p.id = s.plan_id
            WHERE s.user_id = %s
            ORDER BY s.started_at DESC;
            """,
            (user_id,),
        )
        rows = list(cursor.fetchall())
        for row in rows:
            row["price_usd"] = float(row["price_usd"])
        return rows


def delete_subscription(subscription_id: int) -> bool:
    with get_cursor() as cursor:
        cursor.execute(
            """
            UPDATE subscriptions
            SET status = 'cancelled',
                updated_at = NOW()
            WHERE id = %s
              AND status <> 'cancelled'
            RETURNING id;
            """,
            (subscription_id,),
        )
        return cursor.fetchone() is not None



def list_audit_logs(table_name: str = "", actor_user_id: str = "", action: str = "", from_ts: str = "", to_ts: str = "", limit: int = 100, offset: int = 0) -> list[dict]:
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT *
            FROM fn_subscription_audit_report(
                %s::text,
                %s::text,
                %s::text,
                NULLIF(%s::text, '')::timestamptz,
                NULLIF(%s::text, '')::timestamptz,
                %s::integer,
                %s::integer
            );
            """,
            (table_name, actor_user_id, action, from_ts, to_ts, limit, offset),
        )
        rows = []
        for row in cursor.fetchall():
            item = dict(row)
            item["service"] = "subscription"
            rows.append(item)
        return rows
