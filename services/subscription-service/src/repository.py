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
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                plan_id INTEGER NOT NULL REFERENCES plans(id),
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )

        cursor.execute("SELECT id FROM plans LIMIT 1;")
        if cursor.fetchone() is None:
            cursor.executemany(
                "INSERT INTO plans (id, name, price_usd, is_active) VALUES (%s, %s, %s, %s);",
                PLAN_SEED,
            )


def list_plans() -> list[dict]:
    with get_cursor() as cursor:
        cursor.execute(
            "SELECT id, name, price_usd, is_active FROM plans WHERE is_active = TRUE ORDER BY id;"
        )
        return list(cursor.fetchall())


def create_subscription(user_id: int, plan_id: int) -> dict:
    with get_cursor() as cursor:
        cursor.execute("SELECT id, name, price_usd FROM plans WHERE id = %s AND is_active = TRUE;", (plan_id,))
        plan = cursor.fetchone()
        if plan is None:
            raise ValueError("plan not found")

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


def get_subscriptions_by_user(user_id: int) -> list[dict]:
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
        cursor.execute("DELETE FROM subscriptions WHERE id = %s RETURNING id;", (subscription_id,))
        return cursor.fetchone() is not None
