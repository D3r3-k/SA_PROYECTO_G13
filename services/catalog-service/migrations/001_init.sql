CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'tmdb',
    type TEXT NOT NULL CHECK (type IN ('movie', 'series')),
    title TEXT NOT NULL,
    overview TEXT NOT NULL DEFAULT '',
    poster_path TEXT NOT NULL DEFAULT '',
    release_date TEXT NOT NULL DEFAULT '',
    seasons_count INTEGER NOT NULL DEFAULT 0,
    episodes_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, type, external_id)
);

CREATE TABLE IF NOT EXISTS genres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS content_genres (
    content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, genre_id)
);

CREATE TABLE IF NOT EXISTS cast_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    actor_name TEXT NOT NULL,
    character_name TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    season_number INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    overview TEXT NOT NULL DEFAULT '',
    runtime_minutes INTEGER NOT NULL DEFAULT 0,
    UNIQUE(content_id, season_number, episode_number)
);

CREATE TABLE IF NOT EXISTS sync_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    message TEXT NOT NULL,
    contents_synced INTEGER NOT NULL DEFAULT 0,
    episodes_synced INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION fn_normalize_search_text(value TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN LOWER(TRIM(COALESCE(value, '')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_catalog_updated_at ON contents;
CREATE TRIGGER trg_catalog_updated_at
BEFORE UPDATE ON contents
FOR EACH ROW EXECUTE FUNCTION fn_catalog_updated_at();

CREATE OR REPLACE VIEW vw_catalog_card AS
SELECT
    c.id::TEXT AS content_id,
    c.external_id,
    c.type,
    c.title,
    c.overview,
    c.poster_path,
    c.release_date,
    COALESCE(STRING_AGG(DISTINCT g.name, ', ' ORDER BY g.name), '') AS genres,
    c.seasons_count,
    c.episodes_count
FROM contents c
LEFT JOIN content_genres cg ON cg.content_id = c.id
LEFT JOIN genres g ON g.id = cg.genre_id
GROUP BY c.id;

CREATE OR REPLACE VIEW vw_content_detail AS
SELECT * FROM vw_catalog_card;

CREATE OR REPLACE PROCEDURE sp_upsert_content_from_external(
    IN p_external_id TEXT,
    IN p_provider TEXT,
    IN p_type TEXT,
    IN p_title TEXT,
    IN p_overview TEXT,
    IN p_poster_path TEXT,
    IN p_release_date TEXT,
    IN p_seasons_count INTEGER,
    IN p_episodes_count INTEGER,
    IN p_genres JSONB,
    IN p_cast JSONB,
    IN p_episodes JSONB,
    INOUT p_content_id UUID DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_genre_name TEXT;
    v_genre_id UUID;
    v_cast JSONB;
    v_episode JSONB;
BEGIN
    INSERT INTO contents (
        external_id, provider, type, title, overview, poster_path,
        release_date, seasons_count, episodes_count
    ) VALUES (
        p_external_id,
        COALESCE(NULLIF(p_provider, ''), 'tmdb'),
        p_type,
        p_title,
        COALESCE(p_overview, ''),
        COALESCE(p_poster_path, ''),
        COALESCE(p_release_date, ''),
        GREATEST(COALESCE(p_seasons_count, 0), 0),
        GREATEST(COALESCE(p_episodes_count, 0), 0)
    )
    ON CONFLICT (provider, type, external_id)
    DO UPDATE SET
        title = EXCLUDED.title,
        overview = EXCLUDED.overview,
        poster_path = EXCLUDED.poster_path,
        release_date = EXCLUDED.release_date,
        seasons_count = EXCLUDED.seasons_count,
        episodes_count = EXCLUDED.episodes_count,
        updated_at = NOW()
    RETURNING id INTO p_content_id;

    DELETE FROM content_genres WHERE content_id = p_content_id;
    IF p_genres IS NOT NULL THEN
        FOR v_genre_name IN SELECT TRIM(value) FROM jsonb_array_elements_text(p_genres) AS value
        LOOP
            IF COALESCE(TRIM(v_genre_name), '') <> '' THEN
                INSERT INTO genres(name)
                VALUES (TRIM(v_genre_name))
                ON CONFLICT(name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id INTO v_genre_id;

                INSERT INTO content_genres(content_id, genre_id)
                VALUES (p_content_id, v_genre_id)
                ON CONFLICT DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    DELETE FROM cast_members WHERE content_id = p_content_id;
    IF p_cast IS NOT NULL THEN
        FOR v_cast IN SELECT value FROM jsonb_array_elements(p_cast)
        LOOP
            INSERT INTO cast_members(content_id, actor_name, character_name, order_index)
            VALUES (
                p_content_id,
                COALESCE(v_cast->>'actor_name', ''),
                COALESCE(v_cast->>'character_name', ''),
                GREATEST(COALESCE((v_cast->>'order_index')::INTEGER, 0), 0)
            );
        END LOOP;
    END IF;

    DELETE FROM episodes WHERE content_id = p_content_id;
    IF p_episodes IS NOT NULL THEN
        FOR v_episode IN SELECT value FROM jsonb_array_elements(p_episodes)
        LOOP
            INSERT INTO episodes(content_id, season_number, episode_number, title, overview, runtime_minutes)
            VALUES (
                p_content_id,
                GREATEST(COALESCE((v_episode->>'season_number')::INTEGER, 0), 0),
                GREATEST(COALESCE((v_episode->>'episode_number')::INTEGER, 0), 0),
                COALESCE(v_episode->>'title', ''),
                COALESCE(v_episode->>'overview', ''),
                GREATEST(COALESCE((v_episode->>'runtime_minutes')::INTEGER, 0), 0)
            );
        END LOOP;
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_insert_sync_audit(
    IN p_provider TEXT,
    IN p_success BOOLEAN,
    IN p_message TEXT,
    IN p_contents_synced INTEGER,
    IN p_episodes_synced INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO sync_audit(provider, success, message, contents_synced, episodes_synced)
    VALUES (
        COALESCE(p_provider, ''),
        COALESCE(p_success, false),
        COALESCE(p_message, ''),
        GREATEST(COALESCE(p_contents_synced, 0), 0),
        GREATEST(COALESCE(p_episodes_synced, 0), 0)
    );
END;
$$;

CREATE OR REPLACE FUNCTION fn_catalog_list(
    p_type TEXT,
    p_genre TEXT,
    p_query TEXT,
    p_limit INTEGER,
    p_offset INTEGER
)
RETURNS TABLE (
    content_id TEXT,
    external_id TEXT,
    type TEXT,
    title TEXT,
    overview TEXT,
    poster_path TEXT,
    release_date TEXT,
    genres TEXT,
    seasons_count INTEGER,
    episodes_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.content_id,
        v.external_id,
        v.type,
        v.title,
        v.overview,
        v.poster_path,
        v.release_date,
        v.genres,
        v.seasons_count,
        v.episodes_count
    FROM vw_catalog_card v
    WHERE (COALESCE(p_type, '') = '' OR v.type = p_type)
      AND (COALESCE(p_genre, '') = '' OR fn_normalize_search_text(v.genres) LIKE '%' || fn_normalize_search_text(p_genre) || '%')
      AND (
          COALESCE(p_query, '') = ''
          OR fn_normalize_search_text(v.title) LIKE '%' || fn_normalize_search_text(p_query) || '%'
          OR fn_normalize_search_text(v.overview) LIKE '%' || fn_normalize_search_text(p_query) || '%'
      )
    ORDER BY v.title
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_catalog_detail(p_content_id UUID)
RETURNS TABLE (
    content_id TEXT,
    external_id TEXT,
    type TEXT,
    title TEXT,
    overview TEXT,
    poster_path TEXT,
    release_date TEXT,
    genres TEXT,
    seasons_count INTEGER,
    episodes_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.content_id,
        v.external_id,
        v.type,
        v.title,
        v.overview,
        v.poster_path,
        v.release_date,
        v.genres,
        v.seasons_count,
        v.episodes_count
    FROM vw_content_detail v
    WHERE v.content_id::UUID = p_content_id
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_catalog_cast(p_content_id UUID)
RETURNS TABLE (
    actor_name TEXT,
    character_name TEXT,
    order_index INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT c.actor_name, c.character_name, c.order_index
    FROM cast_members c
    WHERE c.content_id = p_content_id
    ORDER BY c.order_index
    LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_catalog_episodes(p_content_id UUID, p_season_number INTEGER)
RETURNS TABLE (
    episode_id TEXT,
    content_id TEXT,
    season_number INTEGER,
    episode_number INTEGER,
    title TEXT,
    overview TEXT,
    runtime_minutes INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id::TEXT,
        e.content_id::TEXT,
        e.season_number,
        e.episode_number,
        e.title,
        e.overview,
        e.runtime_minutes
    FROM episodes e
    WHERE e.content_id = p_content_id
      AND e.season_number = GREATEST(COALESCE(p_season_number, 1), 1)
    ORDER BY e.episode_number;
END;
$$ LANGUAGE plpgsql STABLE;
