"""
Pruebas unitarias e integración para EngagementServiceServicer.
Mockea src.repository (DB) y src.db para no requerir PostgreSQL.
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

import engagement_pb2  # MagicMock de conftest.py

from src.grpc_server import EngagementServiceServicer


@pytest.fixture
def servicer():
    return EngagementServiceServicer()


@pytest.fixture
def ctx():
    return MagicMock()


def _fake_row(**kwargs):
    defaults = dict(
        profile_id="prof-1",
        content_id="cont-1",
        season_number=1,
        episode_number=1,
        minute=30,
        updated_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )
    defaults.update(kwargs)
    return defaults


# ─── RateContent ──────────────────────────────────────────────────────────────

class TestRateContent:
    async def test_voto_thumbs_up_exitoso(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="cont-1", rating=2)  # THUMBS_UP=2

        with patch("src.grpc_server.save_rating") as mock_save:
            await servicer.RateContent(req, ctx)

        mock_save.assert_called_once_with("prof-1", "cont-1", 2)
        kw = engagement_pb2.RateContentResponse.call_args.kwargs
        assert kw["success"] is True

    async def test_voto_thumbs_down_exitoso(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="cont-1", rating=1)  # THUMBS_DOWN=1

        with patch("src.grpc_server.save_rating"):
            await servicer.RateContent(req, ctx)

        kw = engagement_pb2.RateContentResponse.call_args.kwargs
        assert kw["success"] is True

    async def test_profile_id_vacio_retorna_error(self, servicer, ctx):
        req = MagicMock(profile_id="", content_id="cont-1", rating=2)
        await servicer.RateContent(req, ctx)

        kw = engagement_pb2.RateContentResponse.call_args.kwargs
        assert kw["success"] is False
        assert "profile_id" in kw["message"]

    async def test_content_id_vacio_retorna_error(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="", rating=2)
        await servicer.RateContent(req, ctx)

        kw = engagement_pb2.RateContentResponse.call_args.kwargs
        assert kw["success"] is False
        assert "content_id" in kw["message"]

    async def test_rating_invalido_retorna_error(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="cont-1", rating=99)
        await servicer.RateContent(req, ctx)

        kw = engagement_pb2.RateContentResponse.call_args.kwargs
        assert kw["success"] is False
        assert "rating" in kw["message"]

    async def test_error_de_db_retorna_failure(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="cont-1", rating=2)

        with patch("src.grpc_server.save_rating", side_effect=Exception("DB error")):
            await servicer.RateContent(req, ctx)

        kw = engagement_pb2.RateContentResponse.call_args.kwargs
        assert kw["success"] is False


# ─── GetContentRatingSummary ──────────────────────────────────────────────────

class TestGetContentRatingSummary:
    async def test_resumen_exitoso(self, servicer, ctx):
        summary = {
            "content_id": "cont-1",
            "total_ratings": 10,
            "thumbs_up_count": 8,
            "thumbs_down_count": 2,
            "recommendation_percentage": 80.0,
        }
        req = MagicMock(content_id="cont-1")

        with patch("src.grpc_server.rating_summary", return_value=summary):
            await servicer.GetContentRatingSummary(req, ctx)

        engagement_pb2.GetContentRatingSummaryResponse.assert_called_once_with(**summary)

    async def test_content_id_vacio_retorna_respuesta_vacia(self, servicer, ctx):
        req = MagicMock(content_id="")
        await servicer.GetContentRatingSummary(req, ctx)

        kw = engagement_pb2.GetContentRatingSummaryResponse.call_args.kwargs
        assert kw["content_id"] == ""

    async def test_error_de_db_retorna_respuesta_parcial(self, servicer, ctx):
        req = MagicMock(content_id="cont-1")

        with patch("src.grpc_server.rating_summary", side_effect=Exception("DB error")):
            await servicer.GetContentRatingSummary(req, ctx)

        kw = engagement_pb2.GetContentRatingSummaryResponse.call_args.kwargs
        assert kw["content_id"] == "cont-1"


# ─── SaveProgress ─────────────────────────────────────────────────────────────

class TestSaveProgress:
    async def test_progreso_guardado_exitosamente(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="cont-1",
                        season_number=1, episode_number=3, minute=45)

        with patch("src.grpc_server.save_progress") as mock_save:
            await servicer.SaveProgress(req, ctx)

        mock_save.assert_called_once_with("prof-1", "cont-1", 1, 3, 45)
        kw = engagement_pb2.SaveProgressResponse.call_args.kwargs
        assert kw["success"] is True

    async def test_profile_id_vacio_retorna_error(self, servicer, ctx):
        req = MagicMock(profile_id="", content_id="cont-1", minute=10)
        await servicer.SaveProgress(req, ctx)

        kw = engagement_pb2.SaveProgressResponse.call_args.kwargs
        assert kw["success"] is False
        assert "profile_id" in kw["message"]

    async def test_content_id_vacio_retorna_error(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="", minute=10)
        await servicer.SaveProgress(req, ctx)

        kw = engagement_pb2.SaveProgressResponse.call_args.kwargs
        assert kw["success"] is False

    async def test_minuto_negativo_retorna_error(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="cont-1", minute=-1)
        await servicer.SaveProgress(req, ctx)

        kw = engagement_pb2.SaveProgressResponse.call_args.kwargs
        assert kw["success"] is False
        assert "minute" in kw["message"]

    async def test_minuto_cero_es_valido(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="cont-1",
                        season_number=1, episode_number=1, minute=0)

        with patch("src.grpc_server.save_progress"):
            await servicer.SaveProgress(req, ctx)

        kw = engagement_pb2.SaveProgressResponse.call_args.kwargs
        assert kw["success"] is True

    async def test_error_de_db_retorna_failure(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="cont-1",
                        season_number=1, episode_number=1, minute=10)

        with patch("src.grpc_server.save_progress", side_effect=Exception("DB error")):
            await servicer.SaveProgress(req, ctx)

        kw = engagement_pb2.SaveProgressResponse.call_args.kwargs
        assert kw["success"] is False


# ─── GetRecentHistory ─────────────────────────────────────────────────────────

class TestGetRecentHistory:
    async def test_historial_retornado_correctamente(self, servicer, ctx):
        rows = [_fake_row(), _fake_row(content_id="cont-2")]
        req = MagicMock(profile_id="prof-1", limit=10)

        with patch("src.grpc_server.recent_history", return_value=rows):
            await servicer.GetRecentHistory(req, ctx)

        kw = engagement_pb2.GetRecentHistoryResponse.call_args.kwargs
        assert len(kw["items"]) == 2

    async def test_profile_id_vacio_retorna_lista_vacia(self, servicer, ctx):
        req = MagicMock(profile_id="")
        await servicer.GetRecentHistory(req, ctx)

        kw = engagement_pb2.GetRecentHistoryResponse.call_args.kwargs
        assert kw["items"] == []

    async def test_error_de_db_retorna_lista_vacia(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", limit=10)

        with patch("src.grpc_server.recent_history", side_effect=Exception("DB error")):
            await servicer.GetRecentHistory(req, ctx)

        kw = engagement_pb2.GetRecentHistoryResponse.call_args.kwargs
        assert kw["items"] == []


# ─── ResumeContent ────────────────────────────────────────────────────────────

class TestResumeContent:
    async def test_contenido_encontrado(self, servicer, ctx):
        row = _fake_row(minute=42)
        req = MagicMock(profile_id="prof-1", content_id="cont-1")

        with patch("src.grpc_server.resume_content", return_value=row):
            await servicer.ResumeContent(req, ctx)

        kw = engagement_pb2.ResumeContentResponse.call_args.kwargs
        assert kw["found"] is True
        assert kw["minute"] == 42

    async def test_contenido_no_encontrado_retorna_found_false(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="cont-1")

        with patch("src.grpc_server.resume_content", return_value=None):
            await servicer.ResumeContent(req, ctx)

        kw = engagement_pb2.ResumeContentResponse.call_args.kwargs
        assert kw["found"] is False

    async def test_profile_id_o_content_id_vacios(self, servicer, ctx):
        req = MagicMock(profile_id="", content_id="")
        await servicer.ResumeContent(req, ctx)

        kw = engagement_pb2.ResumeContentResponse.call_args.kwargs
        assert kw["found"] is False

    async def test_error_de_db_retorna_found_false(self, servicer, ctx):
        req = MagicMock(profile_id="prof-1", content_id="cont-1")

        with patch("src.grpc_server.resume_content", side_effect=Exception("DB error")):
            await servicer.ResumeContent(req, ctx)

        kw = engagement_pb2.ResumeContentResponse.call_args.kwargs
        assert kw["found"] is False
