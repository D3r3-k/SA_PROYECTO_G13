"""
Pruebas unitarias para src/db.py.
Mockea psycopg2 para no requerir conexión real a PostgreSQL.
"""
from unittest.mock import MagicMock, patch
import pytest

from src.db import get_connection, get_cursor, apply_migrations


# ─── get_connection ───────────────────────────────────────────────────────────

class TestGetConnection:
    def test_llama_psycopg2_connect(self):
        mock_conn = MagicMock()
        with patch("src.db.psycopg2.connect", return_value=mock_conn) as mock_connect:
            result = get_connection()
        mock_connect.assert_called_once()
        assert result is mock_conn


# ─── get_cursor ───────────────────────────────────────────────────────────────

class TestGetCursor:
    def test_yields_cursor_y_cierra_conexion(self):
        mock_cursor = MagicMock()
        cursor_cm = MagicMock()
        cursor_cm.__enter__.return_value = mock_cursor

        mock_conn = MagicMock()
        mock_conn.__enter__.return_value = mock_conn
        mock_conn.cursor.return_value = cursor_cm

        with patch("src.db.get_connection", return_value=mock_conn):
            with get_cursor() as cursor:
                assert cursor is mock_cursor

        mock_conn.close.assert_called_once()

    def test_cierra_conexion_aunque_haya_excepcion(self):
        mock_conn = MagicMock()
        mock_conn.__enter__.return_value = mock_conn
        mock_conn.cursor.side_effect = Exception("cursor error")

        with patch("src.db.get_connection", return_value=mock_conn):
            with pytest.raises(Exception, match="cursor error"):
                with get_cursor():
                    pass

        mock_conn.close.assert_called_once()


# ─── apply_migrations ─────────────────────────────────────────────────────────

class TestApplyMigrations:
    def test_lanza_error_si_directorio_no_existe(self):
        mock_path = MagicMock()
        mock_path.exists.return_value = False

        with patch("src.db.MIGRATIONS_DIR", mock_path):
            with pytest.raises(FileNotFoundError):
                apply_migrations()

    def test_lanza_error_si_no_hay_archivos_sql(self):
        mock_path = MagicMock()
        mock_path.exists.return_value = True
        mock_path.glob.return_value = []

        with patch("src.db.MIGRATIONS_DIR", mock_path):
            with pytest.raises(FileNotFoundError):
                apply_migrations()

    def test_ejecuta_migraciones_exitosamente(self):
        mock_sql = MagicMock()
        mock_sql.read_text.return_value = "CREATE TABLE test (id INT);"

        mock_path = MagicMock()
        mock_path.exists.return_value = True
        mock_path.glob.return_value = [mock_sql]

        mock_cursor = MagicMock()
        mock_cursor.__enter__.return_value = mock_cursor
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("src.db.MIGRATIONS_DIR", mock_path):
            with patch("src.db.psycopg2.connect", return_value=mock_conn):
                apply_migrations()

        mock_cursor.execute.assert_called_once_with("CREATE TABLE test (id INT);")
        mock_conn.close.assert_called_once()

    def test_lanza_runtime_error_si_falla_ejecucion(self):
        mock_sql = MagicMock()
        mock_sql.read_text.return_value = "INVALID SQL;"

        mock_path = MagicMock()
        mock_path.exists.return_value = True
        mock_path.glob.return_value = [mock_sql]

        mock_cursor = MagicMock()
        mock_cursor.__enter__.return_value = mock_cursor
        mock_cursor.execute.side_effect = Exception("syntax error")

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("src.db.MIGRATIONS_DIR", mock_path):
            with patch("src.db.psycopg2.connect", return_value=mock_conn):
                with pytest.raises(RuntimeError, match="migration"):
                    apply_migrations()

        mock_conn.close.assert_called_once()
