from src.db import get_cursor

RATING_MAP = {
    1: "THUMBS_DOWN",
    2: "THUMBS_UP",
    "THUMBS_DOWN": "THUMBS_DOWN",
    "THUMBS_UP": "THUMBS_UP",
}


def save_rating(profile_id: str, content_id: str, rating: int | str) -> None:
    normalized = RATING_MAP.get(rating)
    if not normalized:
        raise ValueError("rating must be THUMBS_UP or THUMBS_DOWN")

    with get_cursor() as cursor:
        cursor.execute(
            "CALL sp_rate_content(%s, %s, %s);",
            (profile_id, content_id, normalized),
        )


def rating_summary(content_id: str) -> dict:
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT
                content_id,
                total_ratings,
                thumbs_up_count,
                thumbs_down_count,
                recommendation_percentage
            FROM fn_get_rating_summary(%s);
            """,
            (content_id,),
        )
        row = cursor.fetchone()
        if row is None:
            return {
                "content_id": content_id,
                "total_ratings": 0,
                "thumbs_up_count": 0,
                "thumbs_down_count": 0,
                "recommendation_percentage": 0.0,
            }
        return {
            "content_id": str(row["content_id"]),
            "total_ratings": int(row["total_ratings"] or 0),
            "thumbs_up_count": int(row["thumbs_up_count"] or 0),
            "thumbs_down_count": int(row["thumbs_down_count"] or 0),
            "recommendation_percentage": float(row["recommendation_percentage"] or 0),
        }


def save_progress(profile_id: str, content_id: str, season_number: int, episode_number: int, minute: int) -> None:
    with get_cursor() as cursor:
        cursor.execute(
            "CALL sp_save_watch_progress(%s, %s, %s, %s, %s);",
            (profile_id, content_id, season_number, episode_number, minute),
        )


def recent_history(profile_id: str, limit: int) -> list[dict]:
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT profile_id, content_id, season_number, episode_number, minute, updated_at
            FROM fn_get_recent_history(%s, %s);
            """,
            (profile_id, limit),
        )
        return list(cursor.fetchall())


def resume_content(profile_id: str, content_id: str) -> dict | None:
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT profile_id, content_id, season_number, episode_number, minute, updated_at
            FROM fn_resume_content(%s, %s);
            """,
            (profile_id, content_id),
        )
        return cursor.fetchone()


def list_audit_logs(table_name: str = "", actor_user_id: str = "", action: str = "", from_ts: str = "", to_ts: str = "", limit: int = 100, offset: int = 0) -> list[dict]:
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT *
            FROM fn_engagement_audit_report(
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
            item["service"] = "engagement"
            rows.append(item)
        return rows
