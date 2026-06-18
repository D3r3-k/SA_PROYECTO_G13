"""
Pruebas unitarias para src/repository.py.
Mockea get_cursor para no requerir PostgreSQL real.
"""
from contextlib import contextmanager
from unittest.mock import MagicMock, patch
import pytest

from src.repository import (
    save_rating,
    rating_summary,
    save_progress,
    recent_history,
    resume_content,
    list_audit_logs,
)


def _cursor_ctx(mock_cursor):
    @contextmanager
    def _ctx():
        yield mock_cursor
    return _ctx


# ─── save_rating ──────────────────────────────────────────────────────────────

class TestSaveRating:
    def test_thumbs_up_llama_execute(self):
        mock_cursor = MagicMock()
        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            save_rating("prof-1", "cont-1", 2)
        mock_cursor.execute.assert_called_once()
        params = mock_cursor.execute.call_args[0][1]
        assert params[2] == "THUMBS_UP"

    def test_thumbs_down_llama_execute(self):
        mock_cursor = MagicMock()
        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            save_rating("prof-1", "cont-1", 1)
        params = mock_cursor.execute.call_args[0][1]
        assert params[2] == "THUMBS_DOWN"

    def test_rating_string_thumbs_up(self):
        mock_cursor = MagicMock()
        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            save_rating("prof-1", "cont-1", "THUMBS_UP")
        mock_cursor.execute.assert_called_once()

    def test_rating_string_thumbs_down(self):
        mock_cursor = MagicMock()
        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            save_rating("prof-1", "cont-1", "THUMBS_DOWN")
        mock_cursor.execute.assert_called_once()

    def test_rating_invalido_lanza_valueerror(self):
        with pytest.raises(ValueError, match="THUMBS_UP or THUMBS_DOWN"):
            save_rating("prof-1", "cont-1", 99)

    def test_rating_none_lanza_valueerror(self):
        with pytest.raises(ValueError):
            save_rating("prof-1", "cont-1", None)


# ─── rating_summary ───────────────────────────────────────────────────────────

class TestRatingSummary:
    def test_retorna_resumen_cuando_hay_datos(self):
        row = {
            "content_id": "cont-1",
            "total_ratings": 10,
            "thumbs_up_count": 8,
            "thumbs_down_count": 2,
            "recommendation_percentage": 80.0,
        }
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = row

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = rating_summary("cont-1")

        assert result["content_id"] == "cont-1"
        assert result["total_ratings"] == 10
        assert result["thumbs_up_count"] == 8
        assert result["recommendation_percentage"] == 80.0

    def test_retorna_defaults_cuando_no_hay_fila(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = rating_summary("cont-X")

        assert result["content_id"] == "cont-X"
        assert result["total_ratings"] == 0
        assert result["thumbs_up_count"] == 0
        assert result["thumbs_down_count"] == 0
        assert result["recommendation_percentage"] == 0.0

    def test_campos_none_en_row_retornan_cero(self):
        row = {
            "content_id": "cont-2",
            "total_ratings": None,
            "thumbs_up_count": None,
            "thumbs_down_count": None,
            "recommendation_percentage": None,
        }
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = row

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = rating_summary("cont-2")

        assert result["total_ratings"] == 0
        assert result["recommendation_percentage"] == 0.0


# ─── save_progress ────────────────────────────────────────────────────────────

class TestSaveProgress:
    def test_llama_execute_con_parametros_correctos(self):
        mock_cursor = MagicMock()
        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            save_progress("prof-1", "cont-1", 2, 3, 45)

        mock_cursor.execute.assert_called_once()
        params = mock_cursor.execute.call_args[0][1]
        assert params == ("prof-1", "cont-1", 2, 3, 45)

    def test_minuto_cero_es_valido(self):
        mock_cursor = MagicMock()
        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            save_progress("prof-1", "cont-1", 1, 1, 0)
        mock_cursor.execute.assert_called_once()


# ─── recent_history ───────────────────────────────────────────────────────────

class TestRecentHistory:
    def test_retorna_lista_de_filas(self):
        rows = [{"content_id": "c1", "minute": 10}, {"content_id": "c2", "minute": 20}]
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = rows

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = recent_history("prof-1", 10)

        assert len(result) == 2
        assert result[0]["content_id"] == "c1"

    def test_retorna_lista_vacia_sin_historial(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = recent_history("prof-1", 5)

        assert result == []


# ─── resume_content ───────────────────────────────────────────────────────────

class TestResumeContent:
    def test_retorna_fila_cuando_existe(self):
        row = {"profile_id": "prof-1", "content_id": "cont-1", "minute": 42}
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = row

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = resume_content("prof-1", "cont-1")

        assert result is not None
        assert result["minute"] == 42

    def test_retorna_none_cuando_no_existe(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = resume_content("prof-1", "cont-X")

        assert result is None


# ─── list_audit_logs ──────────────────────────────────────────────────────────

class TestListAuditLogs:
    def test_agrega_campo_service_a_cada_fila(self):
        rows = [
            {"id": "1", "actor_user_id": "u1", "action": "INSERT"},
            {"id": "2", "actor_user_id": "u2", "action": "UPDATE"},
        ]
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = rows

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = list_audit_logs()

        assert len(result) == 2
        assert all(r["service"] == "engagement" for r in result)

    def test_retorna_lista_vacia(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = list_audit_logs()

        assert result == []

    def test_pasa_parametros_al_cursor(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            list_audit_logs(
                table_name="ratings",
                actor_user_id="user-1",
                action="INSERT",
                from_ts="2024-01-01",
                to_ts="2024-12-31",
                limit=50,
                offset=10,
            )

        mock_cursor.execute.assert_called_once()
        params = mock_cursor.execute.call_args[0][1]
        assert params[0] == "ratings"
        assert params[1] == "user-1"
        assert params[5] == 50
        assert params[6] == 10
