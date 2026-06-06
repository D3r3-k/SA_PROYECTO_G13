import os
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv


load_dotenv()


def get_database_dsn() -> str:
    dsn = os.getenv("DATABASE_URL")
    if dsn:
        return dsn

    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USER", "sa_user")
    password = os.getenv("POSTGRES_PASSWORD", "sa_pass")
    database = os.getenv("POSTGRES_DB", "sa_db")
    return f"dbname={database} user={user} password={password} host={host} port={port}"


@contextmanager
def get_connection():
    connection = psycopg2.connect(get_database_dsn())
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


@contextmanager
def get_cursor():
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            yield cursor
