package repository

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"quetxaltv/catalog-service/internal/provider"
)

type Repository struct{ DB *pgxpool.Pool }

type ContentCard struct {
	ContentID, ExternalID, Type, Title, Overview, PosterPath, ReleaseDate string
	MediaURL, MediaMimeType, SourcePageURL                                string
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

func (r Repository) Ping(ctx context.Context) error { return r.DB.Ping(ctx) }

func (r Repository) ClearCatalog(ctx context.Context) error {
	_, err := r.DB.Exec(ctx, "CALL sp_clear_catalog_data();")
	return err
}

func (r Repository) UpsertContent(ctx context.Context, seed provider.ContentSeed) (string, error) {
	genresJSON, err := json.Marshal(seed.Genres)
	if err != nil {
		return "", err
	}

	castPayload := make([]map[string]any, 0, len(seed.Cast))
	for _, item := range seed.Cast {
		castPayload = append(castPayload, map[string]any{
			"actor_name":     item.ActorName,
			"character_name": item.CharacterName,
			"order_index":    item.OrderIndex,
		})
	}
	castJSON, err := json.Marshal(castPayload)
	if err != nil {
		return "", err
	}

	episodePayload := make([]map[string]any, 0, len(seed.Episodes))
	for _, item := range seed.Episodes {
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

func (r Repository) InsertAudit(ctx context.Context, providerName string, success bool, message string, contents int, episodes int) {
	_, _ = r.DB.Exec(ctx, "CALL sp_insert_sync_audit($1,$2,$3,$4,$5);", providerName, success, message, contents, episodes)
}

func (r Repository) List(ctx context.Context, typ string, genre string, query string, limit int, offset int) ([]ContentCard, error) {
	rows, err := r.DB.Query(ctx, `
        SELECT content_id, external_id, type, title, overview, poster_path, release_date, media_url, media_mime_type, source_page_url, genres, seasons_count, episodes_count
        FROM fn_catalog_list($1, $2, $3, $4, $5);`, typ, genre, query, limit, offset)
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
        SELECT content_id, external_id, type, title, overview, poster_path, release_date, media_url, media_mime_type, source_page_url, genres, seasons_count, episodes_count
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
		); err != nil {
			return nil, err
		}
		item.Genres = splitCSV(genres)
		items = append(items, item)
	}
	return items, rows.Err()
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
