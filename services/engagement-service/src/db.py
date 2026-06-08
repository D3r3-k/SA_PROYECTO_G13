import os
from contextlib import contextmanager
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://engagement_user:engagement_password@engagement-db:5432/engagement_db",
)
MIGRATIONS_DIR = Path(os.getenv("MIGRATIONS_DIR", "/app/migrations"))


def get_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


@contextmanager
def get_cursor():
    connection = get_connection()
    try:
        with connection:
            with connection.cursor() as cursor:
                yield cursor
    finally:
        connection.close()


def apply_migrations() -> None:
    if not MIGRATIONS_DIR.exists():
        raise FileNotFoundError(f"migrations directory not found: {MIGRATIONS_DIR}")

    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        raise FileNotFoundError(f"no migration files found in: {MIGRATIONS_DIR}")

    with get_cursor() as cursor:
        for migration_file in migration_files:
            cursor.execute(migration_file.read_text(encoding="utf-8"))
