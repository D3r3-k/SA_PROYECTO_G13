from datetime import datetime, timezone

from psycopg2 import IntegrityError

from src.db import get_connection, get_cursor




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
