CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('THUMBS_UP', 'THUMBS_DOWN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(profile_id, content_id)
);

CREATE TABLE IF NOT EXISTS rating_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rating_id UUID NOT NULL,
    profile_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    old_rating TEXT,
    new_rating TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watch_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    season_number INTEGER NOT NULL DEFAULT 0,
    episode_number INTEGER NOT NULL DEFAULT 0,
    minute INTEGER NOT NULL DEFAULT 0 CHECK (minute >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(profile_id, content_id)
);

CREATE OR REPLACE FUNCTION fn_recommendation_percentage(p_content_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
    total_count NUMERIC;
    up_count NUMERIC;
BEGIN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE rating = 'THUMBS_UP')
    INTO total_count, up_count
    FROM ratings
    WHERE content_id = p_content_id;

    IF total_count = 0 THEN
        RETURN 0;
    END IF;

    RETURN ROUND((up_count / total_count) * 100, 2);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_rating_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rating_updated_at ON ratings;
CREATE TRIGGER trg_rating_updated_at
BEFORE UPDATE ON ratings
FOR EACH ROW EXECUTE FUNCTION fn_rating_updated_at();

CREATE OR REPLACE FUNCTION fn_watch_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_watch_progress_updated_at ON watch_progress;
CREATE TRIGGER trg_watch_progress_updated_at
BEFORE UPDATE ON watch_progress
FOR EACH ROW EXECUTE FUNCTION fn_watch_progress_updated_at();

CREATE OR REPLACE VIEW vw_recent_profile_history AS
SELECT
    profile_id,
    content_id,
    season_number,
    episode_number,
    minute,
    updated_at
FROM watch_progress
ORDER BY updated_at DESC;

CREATE OR REPLACE PROCEDURE sp_rate_content(
    IN p_profile_id TEXT,
    IN p_content_id TEXT,
    IN p_rating TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(p_profile_id, '') = '' THEN
        RAISE EXCEPTION 'profile_id is required';
    END IF;

    IF COALESCE(p_content_id, '') = '' THEN
        RAISE EXCEPTION 'content_id is required';
    END IF;

    IF p_rating NOT IN ('THUMBS_UP', 'THUMBS_DOWN') THEN
        RAISE EXCEPTION 'rating must be THUMBS_UP or THUMBS_DOWN';
    END IF;

    INSERT INTO ratings (profile_id, content_id, rating)
    VALUES (p_profile_id, p_content_id, p_rating)
    ON CONFLICT (profile_id, content_id)
    DO UPDATE SET rating = EXCLUDED.rating;
END;
$$;

CREATE OR REPLACE FUNCTION fn_get_rating_summary(p_content_id TEXT)
RETURNS TABLE (
    content_id TEXT,
    total_ratings INTEGER,
    thumbs_up_count INTEGER,
    thumbs_down_count INTEGER,
    recommendation_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p_content_id AS content_id,
        COUNT(*)::INTEGER AS total_ratings,
        COUNT(*) FILTER (WHERE rating = 'THUMBS_UP')::INTEGER AS thumbs_up_count,
        COUNT(*) FILTER (WHERE rating = 'THUMBS_DOWN')::INTEGER AS thumbs_down_count,
        fn_recommendation_percentage(p_content_id) AS recommendation_percentage
    FROM ratings
    WHERE ratings.content_id = p_content_id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE PROCEDURE sp_save_watch_progress(
    IN p_profile_id TEXT,
    IN p_content_id TEXT,
    IN p_season_number INTEGER,
    IN p_episode_number INTEGER,
    IN p_minute INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(p_profile_id, '') = '' THEN
        RAISE EXCEPTION 'profile_id is required';
    END IF;

    IF COALESCE(p_content_id, '') = '' THEN
        RAISE EXCEPTION 'content_id is required';
    END IF;

    INSERT INTO watch_progress (
        profile_id, content_id, season_number, episode_number, minute
    ) VALUES (
        p_profile_id,
        p_content_id,
        GREATEST(COALESCE(p_season_number, 0), 0),
        GREATEST(COALESCE(p_episode_number, 0), 0),
        GREATEST(COALESCE(p_minute, 0), 0)
    )
    ON CONFLICT (profile_id, content_id)
    DO UPDATE SET
        season_number = EXCLUDED.season_number,
        episode_number = EXCLUDED.episode_number,
        minute = EXCLUDED.minute;
END;
$$;

CREATE OR REPLACE FUNCTION fn_get_recent_history(p_profile_id TEXT, p_limit INTEGER)
RETURNS TABLE (
    profile_id TEXT,
    content_id TEXT,
    season_number INTEGER,
    episode_number INTEGER,
    minute INTEGER,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.profile_id,
        v.content_id,
        v.season_number,
        v.episode_number,
        v.minute,
        v.updated_at
    FROM vw_recent_profile_history v
    WHERE v.profile_id = p_profile_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_resume_content(p_profile_id TEXT, p_content_id TEXT)
RETURNS TABLE (
    profile_id TEXT,
    content_id TEXT,
    season_number INTEGER,
    episode_number INTEGER,
    minute INTEGER,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.profile_id,
        w.content_id,
        w.season_number,
        w.episode_number,
        w.minute,
        w.updated_at
    FROM watch_progress w
    WHERE w.profile_id = p_profile_id
      AND w.content_id = p_content_id
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_audit_rating_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO rating_audit (rating_id, profile_id, content_id, old_rating, new_rating)
        VALUES (NEW.id, NEW.profile_id, NEW.content_id, NULL, NEW.rating);
        RETURN NEW;
    END IF;

    IF OLD.rating IS DISTINCT FROM NEW.rating THEN
        INSERT INTO rating_audit (rating_id, profile_id, content_id, old_rating, new_rating)
        VALUES (NEW.id, NEW.profile_id, NEW.content_id, OLD.rating, NEW.rating);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_rating_changes ON ratings;
CREATE TRIGGER trg_audit_rating_changes
AFTER INSERT OR UPDATE ON ratings
FOR EACH ROW EXECUTE FUNCTION fn_audit_rating_changes();
