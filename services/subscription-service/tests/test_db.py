"""
Pruebas unitarias para src/db.py.
Mockea psycopg2 para no requerir conexión real a PostgreSQL.
"""
import os
from contextlib import contextmanager
from unittest.mock import MagicMock, patch
import pytest

from src.db import get_database_dsn, get_connection, get_cursor


# ─── get_database_dsn ────────────────────────────────────────────────────────

class TestGetDatabaseDsn:
    def test_usa_database_url_si_esta_definida(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://user:pass@host/db"}):
            dsn = get_database_dsn()
        assert dsn == "postgresql://user:pass@host/db"

    def test_construye_dsn_desde_variables_individuales(self):
        env = {
            "POSTGRES_HOST": "myhost",
            "POSTGRES_PORT": "5433",
            "POSTGRES_USER": "myuser",
            "POSTGRES_PASSWORD": "mypass",
            "POSTGRES_DB": "mydb",
        }
        with patch.dict(os.environ, env, clear=False):
            # Remove DATABASE_URL if set
            env_without_url = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
            with patch.dict(os.environ, env_without_url, clear=True):
                dsn = get_database_dsn()
        assert "myhost" in dsn
        assert "myuser" in dsn


# ─── get_connection ───────────────────────────────────────────────────────────

class TestGetConnection:
    def test_yield_connection_y_commit(self):
        mock_conn = MagicMock()
        with patch("src.db.psycopg2.connect", return_value=mock_conn):
            with get_connection() as conn:
                assert conn is mock_conn
        mock_conn.commit.assert_called_once()
        mock_conn.close.assert_called_once()

    def test_rollback_si_hay_excepcion(self):
        mock_conn = MagicMock()
        with patch("src.db.psycopg2.connect", return_value=mock_conn):
            with pytest.raises(ValueError, match="test error"):
                with get_connection():
                    raise ValueError("test error")
        mock_conn.rollback.assert_called_once()
        mock_conn.close.assert_called_once()


# ─── get_cursor ───────────────────────────────────────────────────────────────

class TestGetCursor:
    def test_yields_cursor_con_realdict(self):
        mock_cursor = MagicMock()
        cursor_cm = MagicMock()
        cursor_cm.__enter__.return_value = mock_cursor

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = cursor_cm

        @contextmanager
        def _fake_get_conn():
            yield mock_conn

        with patch("src.db.get_connection", _fake_get_conn):
            with get_cursor() as cursor:
                assert cursor is mock_cursor

    def test_cierra_cursor_al_salir(self):
        mock_cursor = MagicMock()
        cursor_cm = MagicMock()
        cursor_cm.__enter__.return_value = mock_cursor

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = cursor_cm

        @contextmanager
        def _fake_get_conn():
            yield mock_conn

        with patch("src.db.get_connection", _fake_get_conn):
            with get_cursor():
                pass

        cursor_cm.__exit__.assert_called_once()
