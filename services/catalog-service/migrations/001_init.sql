CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'archive.org',
    type TEXT NOT NULL CHECK (type IN ('movie', 'series')),
    title TEXT NOT NULL,
    overview TEXT NOT NULL DEFAULT '',
    poster_path TEXT NOT NULL DEFAULT '',
    release_date TEXT NOT NULL DEFAULT '',
    media_url TEXT NOT NULL DEFAULT '',
    media_mime_type TEXT NOT NULL DEFAULT '',
    source_page_url TEXT NOT NULL DEFAULT '',
    seasons_count INTEGER NOT NULL DEFAULT 0,
    episodes_count INTEGER NOT NULL DEFAULT 0,
    available_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
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
    media_url TEXT NOT NULL DEFAULT '',
    media_mime_type TEXT NOT NULL DEFAULT '',
    deleted_at TIMESTAMPTZ,
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

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id TEXT,
    actor_email TEXT,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT,
    old_state JSONB,
    new_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_audit_log_table_name ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_catalog_audit_log_actor_user_id ON audit_log(actor_user_id);

ALTER TABLE contents ADD COLUMN IF NOT EXISTS media_url TEXT NOT NULL DEFAULT '';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS media_mime_type TEXT NOT NULL DEFAULT '';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS source_page_url TEXT NOT NULL DEFAULT '';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS available_from TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE contents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS media_url TEXT NOT NULL DEFAULT '';
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS media_mime_type TEXT NOT NULL DEFAULT '';
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

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

-- DROP antes de CREATE para evitar ERROR: cannot drop columns from view en bases existentes.
DROP VIEW IF EXISTS vw_content_detail CASCADE;
DROP VIEW IF EXISTS vw_catalog_card CASCADE;

CREATE OR REPLACE VIEW vw_catalog_card AS
SELECT
    c.id::TEXT AS content_id,
    c.external_id,
    c.type,
    c.title,
    c.overview,
    c.poster_path,
    c.release_date,
    c.media_url,
    c.media_mime_type,
    c.source_page_url,
    COALESCE(STRING_AGG(DISTINCT g.name, ', ' ORDER BY g.name), '') AS genres,
    c.seasons_count,
    c.episodes_count,
    c.available_from::TEXT AS available_from,
    COALESCE(c.deleted_at::TEXT, '') AS deleted_at,
    c.updated_at
FROM contents c
LEFT JOIN content_genres cg ON cg.content_id = c.id
LEFT JOIN genres g ON g.id = cg.genre_id
GROUP BY c.id;

CREATE OR REPLACE VIEW vw_content_detail AS
SELECT * FROM vw_catalog_card;

CREATE OR REPLACE PROCEDURE sp_clear_catalog_data()
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM contents;
    DELETE FROM genres
    WHERE NOT EXISTS (SELECT 1 FROM content_genres cg WHERE cg.genre_id = genres.id);
END;
$$;

CREATE OR REPLACE PROCEDURE sp_upsert_content_from_external(
    IN p_external_id TEXT,
    IN p_provider TEXT,
    IN p_type TEXT,
    IN p_title TEXT,
    IN p_overview TEXT,
    IN p_poster_path TEXT,
    IN p_release_date TEXT,
    IN p_media_url TEXT,
    IN p_media_mime_type TEXT,
    IN p_source_page_url TEXT,
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
        release_date, media_url, media_mime_type, source_page_url,
        seasons_count, episodes_count, available_from, deleted_at
    ) VALUES (
        p_external_id,
        COALESCE(NULLIF(p_provider, ''), 'archive.org'),
        p_type,
        p_title,
        COALESCE(p_overview, ''),
        COALESCE(p_poster_path, ''),
        COALESCE(p_release_date, ''),
        COALESCE(p_media_url, ''),
        COALESCE(p_media_mime_type, ''),
        COALESCE(p_source_page_url, ''),
        GREATEST(COALESCE(p_seasons_count, 0), 0),
        GREATEST(COALESCE(p_episodes_count, 0), 0),
        NOW(),
        NULL
    )
    ON CONFLICT (provider, type, external_id)
    DO UPDATE SET
        title = EXCLUDED.title,
        overview = EXCLUDED.overview,
        poster_path = EXCLUDED.poster_path,
        release_date = EXCLUDED.release_date,
        media_url = EXCLUDED.media_url,
        media_mime_type = EXCLUDED.media_mime_type,
        source_page_url = EXCLUDED.source_page_url,
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
            INSERT INTO episodes(content_id, season_number, episode_number, title, overview, runtime_minutes, media_url, media_mime_type)
            VALUES (
                p_content_id,
                GREATEST(COALESCE((v_episode->>'season_number')::INTEGER, 0), 0),
                GREATEST(COALESCE((v_episode->>'episode_number')::INTEGER, 0), 0),
                COALESCE(v_episode->>'title', ''),
                COALESCE(v_episode->>'overview', ''),
                GREATEST(COALESCE((v_episode->>'runtime_minutes')::INTEGER, 0), 0),
                COALESCE(v_episode->>'media_url', ''),
                COALESCE(v_episode->>'media_mime_type', '')
            );
        END LOOP;
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_create_admin_content(
    IN p_type TEXT,
    IN p_title TEXT,
    IN p_overview TEXT,
    IN p_release_date TEXT,
    IN p_available_from TEXT,
    IN p_genres JSONB,
    IN p_cast JSONB,
    IN p_episodes JSONB,
    IN p_actor_user_id TEXT,
    IN p_actor_email TEXT,
    INOUT p_content_id UUID DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_external_id TEXT;
BEGIN
    PERFORM set_config('app.user_id', COALESCE(p_actor_user_id, ''), true);
    PERFORM set_config('app.user_email', COALESCE(p_actor_email, ''), true);

    v_external_id := 'admin-' || gen_random_uuid()::TEXT;
    CALL sp_upsert_content_from_external(
        v_external_id, 'admin', p_type, p_title, p_overview, '', p_release_date,
        '', '', '', 0,
        CASE WHEN p_type = 'series' THEN COALESCE(jsonb_array_length(p_episodes), 0) ELSE 0 END,
        p_genres, p_cast, p_episodes, p_content_id
    );

    UPDATE contents
    SET available_from = COALESCE(NULLIF(p_available_from, '')::TIMESTAMPTZ, NOW())
    WHERE id = p_content_id;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_update_admin_content(
    IN p_content_id UUID,
    IN p_title TEXT,
    IN p_overview TEXT,
    IN p_release_date TEXT,
    IN p_available_from TEXT,
    IN p_genres JSONB,
    IN p_cast JSONB,
    IN p_episodes JSONB,
    IN p_actor_user_id TEXT,
    IN p_actor_email TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_genre_name TEXT;
    v_genre_id UUID;
    v_cast JSONB;
    v_episode JSONB;
BEGIN
    PERFORM set_config('app.user_id', COALESCE(p_actor_user_id, ''), true);
    PERFORM set_config('app.user_email', COALESCE(p_actor_email, ''), true);

    UPDATE contents
    SET title = TRIM(p_title),
        overview = COALESCE(p_overview, ''),
        release_date = COALESCE(p_release_date, ''),
        available_from = COALESCE(NULLIF(p_available_from, '')::TIMESTAMPTZ, available_from),
        updated_at = NOW()
    WHERE id = p_content_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'content not found: %', p_content_id;
    END IF;

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

    IF p_episodes IS NOT NULL THEN
        DELETE FROM episodes WHERE content_id = p_content_id;
    END IF;

    IF p_episodes IS NOT NULL AND jsonb_array_length(p_episodes) > 0 THEN
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
            )
            ON CONFLICT (content_id, season_number, episode_number)
            DO UPDATE SET
                title = EXCLUDED.title,
                overview = EXCLUDED.overview,
                runtime_minutes = EXCLUDED.runtime_minutes;
        END LOOP;

        UPDATE contents c
        SET episodes_count = (SELECT COUNT(*) FROM episodes e WHERE e.content_id = c.id),
            seasons_count = COALESCE((SELECT MAX(season_number) FROM episodes e WHERE e.content_id = c.id), 0)
        WHERE c.id = p_content_id;
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_soft_delete_content(
    IN p_content_id UUID,
    IN p_actor_user_id TEXT,
    IN p_actor_email TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM set_config('app.user_id', COALESCE(p_actor_user_id, ''), true);
    PERFORM set_config('app.user_email', COALESCE(p_actor_email, ''), true);

    UPDATE contents
    SET deleted_at = COALESCE(deleted_at, NOW()),
        updated_at = NOW()
    WHERE id = p_content_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'content not found or already deleted: %', p_content_id;
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_schedule_premiere(
    IN p_content_id UUID,
    IN p_available_from TEXT,
    IN p_actor_user_id TEXT,
    IN p_actor_email TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM set_config('app.user_id', COALESCE(p_actor_user_id, ''), true);
    PERFORM set_config('app.user_email', COALESCE(p_actor_email, ''), true);

    UPDATE contents
    SET available_from = NULLIF(p_available_from, '')::TIMESTAMPTZ,
        updated_at = NOW()
    WHERE id = p_content_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'content not found: %', p_content_id;
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

CREATE OR REPLACE PROCEDURE sp_update_content_media(
    IN p_content_id UUID,
    IN p_media_type TEXT,
    IN p_object_key TEXT,
    IN p_content_type TEXT,
    IN p_actor_user_id TEXT DEFAULT '',
    IN p_actor_email TEXT DEFAULT ''
)
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM set_config('app.user_id', COALESCE(p_actor_user_id, ''), true);
    PERFORM set_config('app.user_email', COALESCE(p_actor_email, ''), true);

    IF COALESCE(p_media_type, '') = 'poster' THEN
        UPDATE contents
        SET poster_path = COALESCE(p_object_key, ''),
            updated_at = NOW()
        WHERE id = p_content_id
          AND deleted_at IS NULL;
    ELSIF COALESCE(p_media_type, '') = 'movie_video' THEN
        UPDATE contents
        SET media_url = COALESCE(p_object_key, ''),
            media_mime_type = COALESCE(p_content_type, ''),
            updated_at = NOW()
        WHERE id = p_content_id
          AND deleted_at IS NULL;
    ELSE
        RAISE EXCEPTION 'invalid media_type: %', p_media_type;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'content not found: %', p_content_id;
    END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_update_episode_media(
    IN p_content_id UUID,
    IN p_episode_id UUID,
    IN p_object_key TEXT,
    IN p_content_type TEXT,
    IN p_actor_user_id TEXT DEFAULT '',
    IN p_actor_email TEXT DEFAULT ''
)
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM set_config('app.user_id', COALESCE(p_actor_user_id, ''), true);
    PERFORM set_config('app.user_email', COALESCE(p_actor_email, ''), true);

    UPDATE episodes
    SET media_url = COALESCE(p_object_key, ''),
        media_mime_type = COALESCE(p_content_type, '')
    WHERE id = p_episode_id
      AND content_id = p_content_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'episode not found: %', p_episode_id;
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS fn_catalog_list(text,text,text,integer,integer);
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
    media_url TEXT,
    media_mime_type TEXT,
    source_page_url TEXT,
    genres TEXT,
    seasons_count INTEGER,
    episodes_count INTEGER,
    available_from TEXT,
    deleted_at TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.content_id, v.external_id, v.type, v.title, v.overview,
        v.poster_path, v.release_date, v.media_url, v.media_mime_type,
        v.source_page_url, v.genres, v.seasons_count, v.episodes_count,
        v.available_from, v.deleted_at
    FROM vw_catalog_card v
    WHERE (COALESCE(p_type, '') = '' OR v.type = p_type)
      AND v.deleted_at = ''
      AND v.available_from::TIMESTAMPTZ <= NOW()
      AND (COALESCE(p_genre, '') = '' OR fn_normalize_search_text(v.genres) LIKE '%' || fn_normalize_search_text(p_genre) || '%')
      AND (
          COALESCE(p_query, '') = ''
          OR fn_normalize_search_text(v.title) LIKE '%' || fn_normalize_search_text(p_query) || '%'
          OR fn_normalize_search_text(v.overview) LIKE '%' || fn_normalize_search_text(p_query) || '%'
      )
    ORDER BY v.title
    LIMIT LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 100), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_catalog_admin_list(
    p_type TEXT,
    p_status TEXT,
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
    media_url TEXT,
    media_mime_type TEXT,
    source_page_url TEXT,
    genres TEXT,
    seasons_count INTEGER,
    episodes_count INTEGER,
    available_from TEXT,
    deleted_at TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.content_id, v.external_id, v.type, v.title, v.overview,
        v.poster_path, v.release_date, v.media_url, v.media_mime_type,
        v.source_page_url, v.genres, v.seasons_count, v.episodes_count,
        v.available_from, v.deleted_at
    FROM vw_catalog_card v
    WHERE (COALESCE(p_type, '') = '' OR v.type = p_type)
      AND (
          COALESCE(p_status, 'all') IN ('', 'all')
          OR (p_status = 'deleted' AND v.deleted_at <> '')
          OR (p_status = 'scheduled' AND v.deleted_at = '' AND v.available_from::TIMESTAMPTZ > NOW())
          OR (p_status = 'visible' AND v.deleted_at = '' AND v.available_from::TIMESTAMPTZ <= NOW())
      )
      AND (
          COALESCE(p_query, '') = ''
          OR fn_normalize_search_text(v.title) LIKE '%' || fn_normalize_search_text(p_query) || '%'
          OR fn_normalize_search_text(v.overview) LIKE '%' || fn_normalize_search_text(p_query) || '%'
      )
    ORDER BY v.updated_at DESC NULLS LAST, v.title
    LIMIT LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 100), 1), 500)
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
    media_url TEXT,
    media_mime_type TEXT,
    source_page_url TEXT,
    genres TEXT,
    seasons_count INTEGER,
    episodes_count INTEGER,
    available_from TEXT,
    deleted_at TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.content_id, v.external_id, v.type, v.title, v.overview,
        v.poster_path, v.release_date, v.media_url, v.media_mime_type,
        v.source_page_url, v.genres, v.seasons_count, v.episodes_count,
        v.available_from, v.deleted_at
    FROM vw_content_detail v
    WHERE v.content_id::UUID = p_content_id
      AND v.deleted_at = ''
      AND v.available_from::TIMESTAMPTZ <= NOW()
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
    runtime_minutes INTEGER,
    media_url TEXT,
    media_mime_type TEXT
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
        e.runtime_minutes,
        e.media_url,
        e.media_mime_type
    FROM episodes e
    JOIN contents c ON c.id = e.content_id
    WHERE e.content_id = p_content_id
      AND c.deleted_at IS NULL
      AND c.available_from <= NOW()
      AND e.season_number = GREATEST(COALESCE(p_season_number, 1), 1)
    ORDER BY e.episode_number;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_standard_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_record_id TEXT;
    v_actor_user_id TEXT;
    v_actor_email TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_new := NULL;
        v_record_id := COALESCE(v_old->>'id', v_old->>'content_id', v_old->>'genre_id');
    ELSE
        v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
        v_new := to_jsonb(NEW);
        v_record_id := COALESCE(v_new->>'id', v_new->>'content_id', v_new->>'genre_id');
    END IF;

    v_actor_user_id := COALESCE(NULLIF(current_setting('app.user_id', true), ''), v_new->>'user_id', v_old->>'user_id');
    v_actor_email := NULLIF(current_setting('app.user_email', true), '');

    INSERT INTO audit_log(actor_user_id, actor_email, action, table_name, record_id, old_state, new_state)
    VALUES (v_actor_user_id, v_actor_email, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_catalog_audit_report(
    p_table_name TEXT,
    p_actor_user_id TEXT,
    p_action TEXT,
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_limit INTEGER,
    p_offset INTEGER
)
RETURNS TABLE (
    audit_id TEXT,
    actor_user_id TEXT,
    actor_email TEXT,
    action TEXT,
    table_name TEXT,
    record_id TEXT,
    old_state_json TEXT,
    new_state_json TEXT,
    created_at TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id::TEXT,
        COALESCE(a.actor_user_id, ''),
        COALESCE(a.actor_email, ''),
        a.action,
        a.table_name,
        COALESCE(a.record_id, ''),
        COALESCE(a.old_state::TEXT, ''),
        COALESCE(a.new_state::TEXT, ''),
        a.created_at::TEXT
    FROM audit_log a
    WHERE (COALESCE(p_table_name, '') = '' OR a.table_name = p_table_name)
      AND (COALESCE(p_actor_user_id, '') = '' OR a.actor_user_id = p_actor_user_id)
      AND (COALESCE(p_action, '') = '' OR a.action = UPPER(p_action))
      AND (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at <= p_to)
    ORDER BY a.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 100), 1), 500)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$ LANGUAGE plpgsql STABLE;

DROP TRIGGER IF EXISTS trg_audit_contents ON contents;
CREATE TRIGGER trg_audit_contents AFTER INSERT OR UPDATE ON contents FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_genres ON genres;
CREATE TRIGGER trg_audit_genres AFTER INSERT OR UPDATE ON genres FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_content_genres ON content_genres;
CREATE TRIGGER trg_audit_content_genres AFTER INSERT OR UPDATE ON content_genres FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_cast_members ON cast_members;
CREATE TRIGGER trg_audit_cast_members AFTER INSERT OR UPDATE ON cast_members FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_episodes ON episodes;
CREATE TRIGGER trg_audit_episodes AFTER INSERT OR UPDATE ON episodes FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();

DROP TRIGGER IF EXISTS trg_audit_sync_audit ON sync_audit;
CREATE TRIGGER trg_audit_sync_audit AFTER INSERT OR UPDATE ON sync_audit FOR EACH ROW EXECUTE FUNCTION fn_standard_audit_log();
