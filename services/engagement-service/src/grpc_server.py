import asyncio
import logging
from datetime import timezone

import grpc
from google.protobuf.timestamp_pb2 import Timestamp

import engagement_pb2
import engagement_pb2_grpc

from src.db import apply_migrations, get_connection
from src.repository import (
    rating_summary,
    recent_history,
    resume_content,
    save_progress,
    save_rating,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("engagement-service-grpc")


def _timestamp(value):
    ts = Timestamp()
    if value is not None:
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        ts.FromDatetime(value)
    return ts


def _history_item(row):
    return engagement_pb2.HistoryItem(
        profile_id=str(row["profile_id"]),
        content_id=str(row["content_id"]),
        season_number=int(row["season_number"]),
        episode_number=int(row["episode_number"]),
        minute=int(row["minute"]),
        updated_at=_timestamp(row["updated_at"]),
    )


class EngagementServiceServicer(engagement_pb2_grpc.EngagementServiceServicer):
    async def RateContent(self, request, context):
        if not request.profile_id:
            return engagement_pb2.RateContentResponse(success=False, message="profile_id is required")
        if not request.content_id:
            return engagement_pb2.RateContentResponse(success=False, message="content_id is required")
        if request.rating not in (engagement_pb2.THUMBS_DOWN, engagement_pb2.THUMBS_UP):
            return engagement_pb2.RateContentResponse(success=False, message="rating must be THUMBS_UP or THUMBS_DOWN")
        try:
            save_rating(request.profile_id, request.content_id, int(request.rating))
            return engagement_pb2.RateContentResponse(success=True, message="rating saved successfully")
        except Exception:
            logger.exception("failed to save rating")
            return engagement_pb2.RateContentResponse(success=False, message="could not save rating")

    async def GetContentRatingSummary(self, request, context):
        if not request.content_id:
            return engagement_pb2.GetContentRatingSummaryResponse(content_id="")
        try:
            summary = rating_summary(request.content_id)
            return engagement_pb2.GetContentRatingSummaryResponse(**summary)
        except Exception:
            logger.exception("failed to calculate rating summary")
            return engagement_pb2.GetContentRatingSummaryResponse(content_id=request.content_id)

    async def SaveProgress(self, request, context):
        if not request.profile_id:
            return engagement_pb2.SaveProgressResponse(success=False, message="profile_id is required")
        if not request.content_id:
            return engagement_pb2.SaveProgressResponse(success=False, message="content_id is required")
        if request.minute < 0:
            return engagement_pb2.SaveProgressResponse(success=False, message="minute must be zero or positive")
        try:
            save_progress(
                request.profile_id,
                request.content_id,
                request.season_number,
                request.episode_number,
                request.minute,
            )
            return engagement_pb2.SaveProgressResponse(success=True, message="progress saved successfully")
        except Exception:
            logger.exception("failed to save progress")
            return engagement_pb2.SaveProgressResponse(success=False, message="could not save progress")

    async def GetRecentHistory(self, request, context):
        if not request.profile_id:
            return engagement_pb2.GetRecentHistoryResponse(items=[])
        try:
            rows = recent_history(request.profile_id, request.limit)
            return engagement_pb2.GetRecentHistoryResponse(items=[_history_item(row) for row in rows])
        except Exception:
            logger.exception("failed to list recent history")
            return engagement_pb2.GetRecentHistoryResponse(items=[])

    async def ResumeContent(self, request, context):
        if not request.profile_id or not request.content_id:
            return engagement_pb2.ResumeContentResponse(found=False)
        try:
            row = resume_content(request.profile_id, request.content_id)
            if row is None:
                return engagement_pb2.ResumeContentResponse(found=False)
            return engagement_pb2.ResumeContentResponse(
                found=True,
                profile_id=str(row["profile_id"]),
                content_id=str(row["content_id"]),
                season_number=int(row["season_number"]),
                episode_number=int(row["episode_number"]),
                minute=int(row["minute"]),
                updated_at=_timestamp(row["updated_at"]),
            )
        except Exception:
            logger.exception("failed to resume content")
            return engagement_pb2.ResumeContentResponse(found=False)


async def serve() -> None:
    apply_migrations()
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")

    server = grpc.aio.server()
    engagement_pb2_grpc.add_EngagementServiceServicer_to_server(EngagementServiceServicer(), server)
    listen_addr = "[::]:50056"
    server.add_insecure_port(listen_addr)
    logger.info("Engagement Service gRPC running on %s", listen_addr)
    await server.start()
    await server.wait_for_termination()


if __name__ == "__main__":
    asyncio.run(serve())
