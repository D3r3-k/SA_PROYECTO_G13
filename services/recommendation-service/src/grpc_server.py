import asyncio
import logging
import os
from contextlib import contextmanager

import grpc
import psycopg2
from psycopg2.extras import RealDictCursor

import recommendation_pb2
import recommendation_pb2_grpc

from src.recommender import get_recommendations

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("recommendation-service-grpc")


def _engagement_dsn() -> str:
    return (
        f"host={os.getenv('ENGAGEMENT_DB_HOST', 'engagement-db')} "
        f"port={os.getenv('ENGAGEMENT_DB_PORT', '5432')} "
        f"dbname={os.getenv('ENGAGEMENT_DB_NAME', 'engagement_db')} "
        f"user={os.getenv('ENGAGEMENT_DB_USER', 'engagement_user')} "
        f"password={os.getenv('ENGAGEMENT_DB_PASSWORD', 'engagement_password')}"
    )


def _catalog_dsn() -> str:
    return (
        f"host={os.getenv('CATALOG_DB_HOST', 'catalog-db')} "
        f"port={os.getenv('CATALOG_DB_PORT', '5432')} "
        f"dbname={os.getenv('CATALOG_DB_NAME', 'catalog_db')} "
        f"user={os.getenv('CATALOG_DB_USER', 'catalog_user')} "
        f"password={os.getenv('CATALOG_DB_PASSWORD', 'catalog_password')}"
    )


@contextmanager
def _cursor(dsn: str):
    conn = psycopg2.connect(dsn, cursor_factory=RealDictCursor)
    try:
        with conn:
            with conn.cursor() as cur:
                yield cur
    finally:
        conn.close()


def _fetch_watch_history(profile_id: str) -> list[dict]:
    with _cursor(_engagement_dsn()) as cur:
        cur.execute(
            """
            SELECT wp.content_id, r.rating
            FROM watch_progress wp
            LEFT JOIN ratings r
                ON r.profile_id = wp.profile_id
               AND r.content_id = wp.content_id
            WHERE wp.profile_id = %s
            """,
            (profile_id,),
        )
        return list(cur.fetchall())


def _fetch_catalog() -> list[dict]:
    with _cursor(_catalog_dsn()) as cur:
        cur.execute(
            """
            SELECT
                c.id::TEXT AS content_id,
                c.title,
                COALESCE(
                    ARRAY_AGG(DISTINCT g.name ORDER BY g.name)
                    FILTER (WHERE g.name IS NOT NULL),
                    ARRAY[]::TEXT[]
                ) AS genres
            FROM contents c
            LEFT JOIN content_genres cg ON cg.content_id = c.id
            LEFT JOIN genres g ON g.id = cg.genre_id
            WHERE c.deleted_at IS NULL
              AND c.available_from <= NOW()
            GROUP BY c.id, c.title
            """
        )
        return list(cur.fetchall())


def _build_watch_history(
    engagement_rows: list[dict],
    catalog_genres: dict[str, list[str]],
) -> list[dict]:
    """Enriches engagement rows with genre data from the catalog."""
    result = []
    for row in engagement_rows:
        cid = str(row["content_id"])
        genres = catalog_genres.get(cid, [])
        rating_str = row.get("rating")
        # Watched but not rated is treated as a positive signal.
        liked = (rating_str != "THUMBS_DOWN") if rating_str else True
        result.append({"content_id": cid, "genres": genres, "rating": liked})
    return result


class RecommendationServiceServicer(recommendation_pb2_grpc.RecommendationServiceServicer):
    async def Health(self, request, context):
        return recommendation_pb2.RecommendationHealthResponse(success=True, status="ok")

    async def GetRecommendations(self, request, context):
        if not request.profile_id:
            return recommendation_pb2.GetRecommendationsResponse(
                success=False,
                message="profile_id is required",
                items=[],
            )

        limit = request.limit if request.limit > 0 else 10

        try:
            catalog_rows = _fetch_catalog()
        except Exception:
            logger.exception("failed to fetch catalog")
            return recommendation_pb2.GetRecommendationsResponse(
                success=False, message="could not fetch catalog", items=[]
            )

        try:
            engagement_rows = _fetch_watch_history(request.profile_id)
        except Exception:
            logger.exception("failed to fetch watch history for profile %s", request.profile_id)
            return recommendation_pb2.GetRecommendationsResponse(
                success=False, message="could not fetch watch history", items=[]
            )

        catalog_genres: dict[str, list[str]] = {
            row["content_id"]: list(row["genres"] or []) for row in catalog_rows
        }
        watch_history = _build_watch_history(engagement_rows, catalog_genres)

        catalog = [
            {
                "content_id": row["content_id"],
                "title": row["title"],
                "genres": list(row["genres"] or []),
            }
            for row in catalog_rows
        ]

        recommended = get_recommendations(watch_history, catalog, limit)

        items = [
            recommendation_pb2.RecommendedContent(
                content_id=item["content_id"],
                title=item["title"],
                genres=item["genres"],
            )
            for item in recommended
        ]

        return recommendation_pb2.GetRecommendationsResponse(
            success=True,
            message=f"{len(items)} recommendations found",
            items=items,
        )


async def serve() -> None:
    server = grpc.aio.server()
    recommendation_pb2_grpc.add_RecommendationServiceServicer_to_server(
        RecommendationServiceServicer(), server
    )
    listen_addr = "[::]:50058"
    server.add_insecure_port(listen_addr)
    logger.info("Recommendation Service gRPC running on %s", listen_addr)
    await server.start()
    await server.wait_for_termination()


if __name__ == "__main__":
    asyncio.run(serve())
