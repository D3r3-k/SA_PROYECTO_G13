package repository

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"quetxaltv/catalog-service/internal/provider"
)

type Repository struct{ DB *pgxpool.Pool }

type ContentCard struct {
	ContentID, ExternalID, Type, Title, Overview, PosterPath, ReleaseDate string
	MediaURL, MediaMimeType, SourcePageURL                                string
	AvailableFrom, DeletedAt                                              string
	Genres                                                                []string
	SeasonsCount, EpisodesCount                                           int
}

type CastMember struct {
	ActorName, CharacterName string
	OrderIndex               int
}

type Episode struct {
	EpisodeID, ContentID        string
	SeasonNumber, EpisodeNumber int
	Title, Overview             string
	MediaURL, MediaMimeType     string
	RuntimeMinutes              int
}

type Detail struct {
	Content ContentCard
	Cast    []CastMember
}

type DeletedContentMedia struct {
	ObjectKeys []string
}

type AdminContentWrite struct {
	ContentID     string
	ExternalID    string
	Type          string
	Title         string
	Overview      string
	PosterPath    string
	ReleaseDate   string
	AvailableFrom string
	Genres        []string
	Cast          []provider.CastSeed
	Episodes      []provider.EpisodeSeed
	ActorUserID   string
	ActorEmail    string
}

type AuditLog struct {
	ID          string
	ActorUserID string
	ActorEmail  string
	Action      string
	TableName   string
	RecordID    string
	OldState    string
	NewState    string
	CreatedAt   string
}

func (r Repository) Ping(ctx context.Context) error { return r.DB.Ping(ctx) }

func (r Repository) ClearCatalog(ctx context.Context) error {
	_, err := r.DB.Exec(ctx, "CALL sp_clear_catalog_data();")
	return err
}

func (r Repository) UpsertContent(ctx context.Context, seed provider.ContentSeed) (string, error) {
	genresJSON, castJSON, episodesJSON, err := marshalSeedPayloads(seed.Genres, seed.Cast, seed.Episodes)
	if err != nil {
		return "", err
	}

	var contentID string
	err = r.DB.QueryRow(ctx, `
        CALL sp_upsert_content_from_external(
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, NULL::uuid
        );`,
		seed.ExternalID,
		providerName(seed.Provider),
		seed.Type,
		seed.Title,
		seed.Overview,
		seed.PosterPath,
		seed.ReleaseDate,
		seed.MediaURL,
		seed.MediaMimeType,
		seed.SourcePageURL,
		seed.SeasonsCount,
		len(seed.Episodes),
		string(genresJSON),
		string(castJSON),
		string(episodesJSON),
	).Scan(&contentID)
	if err != nil {
		return "", err
	}
	return contentID, nil
}

func (r Repository) CreateAdminContent(ctx context.Context, input AdminContentWrite) (string, []Episode, error) {
	genresJSON, castJSON, episodesJSON, err := marshalSeedPayloads(input.Genres, input.Cast, input.Episodes)
	if err != nil {
		return "", nil, err
	}
	var contentID string
	err = r.DB.QueryRow(ctx, `
        CALL sp_create_admin_content(
            $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, NULL::uuid
        );`,
		input.Type,
		input.Title,
		input.Overview,
		input.ReleaseDate,
		input.AvailableFrom,
		string(genresJSON),
		string(castJSON),
		string(episodesJSON),
		nullString(input.ActorUserID),
		nullString(input.ActorEmail),
	).Scan(&contentID)
	if err != nil {
		return "", nil, err
	}
	episodes, err := r.AllEpisodes(ctx, contentID)
	if err != nil {
		return "", nil, err
	}
	return contentID, episodes, nil
}

func (r Repository) UpdateAdminContent(ctx context.Context, input AdminContentWrite) error {
	genresJSON, castJSON, episodesJSON, err := marshalSeedPayloads(input.Genres, input.Cast, input.Episodes)
	if err != nil {
		return err
	}
	_, err = r.DB.Exec(ctx, `
        CALL sp_update_admin_content(
            $1::uuid, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10
        );`,
		input.ContentID,
		input.Title,
		input.Overview,
		input.ReleaseDate,
		input.AvailableFrom,
		string(genresJSON),
		string(castJSON),
		string(episodesJSON),
		nullString(input.ActorUserID),
		nullString(input.ActorEmail),
	)
	return err
}

func (r Repository) SoftDeleteContent(ctx context.Context, contentID string, actorUserID string, actorEmail string) error {
	_, err := r.DB.Exec(ctx, "CALL sp_soft_delete_content($1::uuid,$2,$3);", contentID, nullString(actorUserID), nullString(actorEmail))
	return err
}

func (r Repository) SchedulePremiere(ctx context.Context, contentID string, availableFrom string, actorUserID string, actorEmail string) error {
	_, err := r.DB.Exec(ctx, "CALL sp_schedule_premiere($1::uuid,$2,$3,$4);", contentID, availableFrom, nullString(actorUserID), nullString(actorEmail))
	return err
}

func (r Repository) UpdateContentMedia(ctx context.Context, contentID string, mediaType string, objectKey string, contentType string, actorUserID string, actorEmail string) error {
	_, err := r.DB.Exec(ctx, "CALL sp_update_content_media($1::uuid,$2,$3,$4,$5,$6);", contentID, mediaType, objectKey, contentType, nullString(actorUserID), nullString(actorEmail))
	return err
}

func (r Repository) UpdateEpisodeMedia(ctx context.Context, contentID string, episodeID string, objectKey string, contentType string, actorUserID string, actorEmail string) error {
	_, err := r.DB.Exec(ctx, "CALL sp_update_episode_media($1::uuid,$2::uuid,$3,$4,$5,$6);", contentID, episodeID, objectKey, contentType, nullString(actorUserID), nullString(actorEmail))
	return err
}

func (r Repository) ContentMediaKeys(ctx context.Context, contentID string) (DeletedContentMedia, bool, error) {
	rows, err := r.DB.Query(ctx, `
        SELECT object_key
        FROM (
            SELECT poster_path AS object_key
            FROM contents
            WHERE id = $1::uuid
            UNION ALL
            SELECT media_url AS object_key
            FROM contents
            WHERE id = $1::uuid
            UNION ALL
            SELECT media_url AS object_key
            FROM episodes
            WHERE content_id = $1::uuid
        ) media
        WHERE object_key LIKE 'covers/%'
           OR object_key LIKE 'videos/%';`, contentID)
	if err != nil {
		return DeletedContentMedia{}, false, err
	}
	defer rows.Close()

	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return DeletedContentMedia{}, false, err
		}
		if strings.TrimSpace(key) != "" {
			keys = append(keys, key)
		}
	}
	if err := rows.Err(); err != nil {
		return DeletedContentMedia{}, false, err
	}

	var exists bool
	if err := r.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM contents WHERE id = $1::uuid);", contentID).Scan(&exists); err != nil {
		return DeletedContentMedia{}, false, err
	}
	return DeletedContentMedia{ObjectKeys: keys}, exists, nil
}

func (r Repository) DeleteContent(ctx context.Context, contentID string) error {
	tag, err := r.DB.Exec(ctx, "DELETE FROM contents WHERE id = $1::uuid;", contentID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r Repository) InsertAudit(ctx context.Context, providerName string, success bool, message string, contents int, episodes int) {
	_, _ = r.DB.Exec(ctx, "CALL sp_insert_sync_audit($1,$2,$3,$4,$5);", providerName, success, message, contents, episodes)
}

func (r Repository) List(ctx context.Context, typ string, genre string, query string, limit int, offset int) ([]ContentCard, error) {
	rows, err := r.DB.Query(ctx, `
        SELECT content_id, external_id, type, title, overview, poster_path, release_date, media_url, media_mime_type, source_page_url, genres, seasons_count, episodes_count, available_from, deleted_at
        FROM fn_catalog_list($1, $2, $3, $4, $5);`, typ, genre, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanContentRows(rows)
}

func (r Repository) ListAdmin(ctx context.Context, typ string, status string, query string, limit int, offset int) ([]ContentCard, error) {
	rows, err := r.DB.Query(ctx, `
        SELECT content_id, external_id, type, title, overview, poster_path, release_date, media_url, media_mime_type, source_page_url, genres, seasons_count, episodes_count, available_from, deleted_at
        FROM fn_catalog_admin_list($1, $2, $3, $4, $5);`, typ, status, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanContentRows(rows)
}

func (r Repository) Detail(ctx context.Context, id string) (Detail, bool, error) {
	var card ContentCard
	var genres string
	err := r.DB.QueryRow(ctx, `
        SELECT content_id, external_id, type, title, overview, poster_path, release_date, media_url, media_mime_type, source_page_url, genres, seasons_count, episodes_count, available_from, deleted_at
        FROM fn_catalog_detail($1::uuid);`, id).Scan(
		&card.ContentID,
		&card.ExternalID,
		&card.Type,
		&card.Title,
		&card.Overview,
		&card.PosterPath,
		&card.ReleaseDate,
		&card.MediaURL,
		&card.MediaMimeType,
		&card.SourcePageURL,
		&genres,
		&card.SeasonsCount,
		&card.EpisodesCount,
		&card.AvailableFrom,
		&card.DeletedAt,
	)
	if err == pgx.ErrNoRows {
		return Detail{}, false, nil
	}
	if err != nil {
		return Detail{}, false, err
	}
	card.Genres = splitCSV(genres)

	castRows, err := r.DB.Query(ctx, "SELECT actor_name, character_name, order_index FROM fn_catalog_cast($1::uuid);", id)
	if err != nil {
		return Detail{}, false, err
	}
	defer castRows.Close()
	cast := []CastMember{}
	for castRows.Next() {
		var item CastMember
		if err := castRows.Scan(&item.ActorName, &item.CharacterName, &item.OrderIndex); err != nil {
			return Detail{}, false, err
		}
		cast = append(cast, item)
	}
	if err := castRows.Err(); err != nil {
		return Detail{}, false, err
	}
	return Detail{Content: card, Cast: cast}, true, nil
}

func (r Repository) Episodes(ctx context.Context, id string, season int) ([]Episode, error) {
	rows, err := r.DB.Query(ctx, `
        SELECT episode_id, content_id, season_number, episode_number, title, overview, runtime_minutes, media_url, media_mime_type
        FROM fn_catalog_episodes($1::uuid, $2);`, id, season)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Episode{}
	for rows.Next() {
		var item Episode
		if err := rows.Scan(&item.EpisodeID, &item.ContentID, &item.SeasonNumber, &item.EpisodeNumber, &item.Title, &item.Overview, &item.RuntimeMinutes, &item.MediaURL, &item.MediaMimeType); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r Repository) AllEpisodes(ctx context.Context, id string) ([]Episode, error) {
	rows, err := r.DB.Query(ctx, `
        SELECT id::TEXT, content_id::TEXT, season_number, episode_number, title, overview, runtime_minutes, media_url, media_mime_type
        FROM episodes
        WHERE content_id = $1::uuid AND deleted_at IS NULL
        ORDER BY season_number, episode_number;`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Episode{}
	for rows.Next() {
		var item Episode
		if err := rows.Scan(&item.EpisodeID, &item.ContentID, &item.SeasonNumber, &item.EpisodeNumber, &item.Title, &item.Overview, &item.RuntimeMinutes, &item.MediaURL, &item.MediaMimeType); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r Repository) ListAuditLogs(ctx context.Context, tableName string, actorUserID string, action string, from string, to string, limit int, offset int) ([]AuditLog, error) {
	rows, err := r.DB.Query(ctx, `
        SELECT audit_id, actor_user_id, actor_email, action, table_name, record_id, old_state_json, new_state_json, created_at
        FROM fn_catalog_audit_report($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7);`,
		nullString(tableName),
		nullString(actorUserID),
		nullString(action),
		nullString(from),
		nullString(to),
		limit,
		offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []AuditLog{}
	for rows.Next() {
		var item AuditLog
		if err := rows.Scan(
			&item.ID,
			&item.ActorUserID,
			&item.ActorEmail,
			&item.Action,
			&item.TableName,
			&item.RecordID,
			&item.OldState,
			&item.NewState,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanContentRows(rows pgx.Rows) ([]ContentCard, error) {
	items := []ContentCard{}
	for rows.Next() {
		var item ContentCard
		var genres string
		if err := rows.Scan(
			&item.ContentID,
			&item.ExternalID,
			&item.Type,
			&item.Title,
			&item.Overview,
			&item.PosterPath,
			&item.ReleaseDate,
			&item.MediaURL,
			&item.MediaMimeType,
			&item.SourcePageURL,
			&genres,
			&item.SeasonsCount,
			&item.EpisodesCount,
			&item.AvailableFrom,
			&item.DeletedAt,
		); err != nil {
			return nil, err
		}
		item.Genres = splitCSV(genres)
		items = append(items, item)
	}
	return items, rows.Err()
}

func marshalSeedPayloads(genres []string, cast []provider.CastSeed, episodes []provider.EpisodeSeed) ([]byte, []byte, []byte, error) {
	genresJSON, err := json.Marshal(genres)
	if err != nil {
		return nil, nil, nil, err
	}
	castPayload := make([]map[string]any, 0, len(cast))
	for _, item := range cast {
		castPayload = append(castPayload, map[string]any{
			"actor_name":     item.ActorName,
			"character_name": item.CharacterName,
			"order_index":    item.OrderIndex,
		})
	}
	castJSON, err := json.Marshal(castPayload)
	if err != nil {
		return nil, nil, nil, err
	}
	episodePayload := make([]map[string]any, 0, len(episodes))
	for _, item := range episodes {
		episodePayload = append(episodePayload, map[string]any{
			"season_number":   item.SeasonNumber,
			"episode_number":  item.EpisodeNumber,
			"title":           item.Title,
			"overview":        item.Overview,
			"runtime_minutes": item.RuntimeMinutes,
			"media_url":       item.MediaURL,
			"media_mime_type": item.MediaMimeType,
		})
	}
	episodesJSON, err := json.Marshal(episodePayload)
	if err != nil {
		return nil, nil, nil, err
	}
	return genresJSON, castJSON, episodesJSON, nil
}

func maxSeason(episodes []provider.EpisodeSeed) int {
	max := 0
	for _, item := range episodes {
		if item.SeasonNumber > max {
			max = item.SeasonNumber
		}
	}
	return max
}

func nullString(value string) any {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return value
}

func splitCSV(value string) []string {
	if strings.TrimSpace(value) == "" {
		return []string{}
	}
	parts := strings.Split(value, ",")
	out := []string{}
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func providerName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "archive.org"
	}
	return value
}

func NormalizeTimestamp(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UTC().Format(time.RFC3339)
	}
	return value
}
