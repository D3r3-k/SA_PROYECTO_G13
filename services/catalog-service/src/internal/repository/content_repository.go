package repository

import (
	"catalog-service/internal/model"
	"database/sql"
)

type catalogRepository struct {
	db *sql.DB
}

func NewCatalogRepository(db *sql.DB) CatalogRepository {
	return &catalogRepository{db: db}
}

// ─── GetByID ─────────────────────────────────────────────────────────────────

func (r *catalogRepository) GetByID(id string) (*model.Content, error) {

	// SP devuelve 3 result sets: contenido, actores, temporadas+episodios
	rows, err := r.db.Query("CALL sp_get_content_by_id(?)", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Result set 1: detalle del contenido
	var c model.Content
	if rows.Next() {
		err = rows.Scan(
			&c.ContentID,
			&c.Title,
			&c.Description,
			&c.ContentType,
			&c.PosterURL,
			&c.ReleaseDate,
			&c.Genre,
			&c.Category,
		)
		if err != nil {
			return nil, err
		}
	} else {
		return nil, sql.ErrNoRows
	}

	// Result set 2: actores
	if !rows.NextResultSet() {
		return &c, nil
	}
	for rows.Next() {
		var a model.Actor
		if err := rows.Scan(&a.ActorID, &a.FullName, &a.PhotoURL); err != nil {
			return nil, err
		}
		c.Actors = append(c.Actors, a)
	}

	// Result set 3: temporadas y episodios
	if !rows.NextResultSet() {
		return &c, nil
	}
	seasonsMap := map[string]*model.Season{}
	var seasonOrder []string

	for rows.Next() {
		var seasonID, episodeID, episodeTitle string
		var seasonNumber, durationMinutes int32

		if err := rows.Scan(
			&seasonID,
			&seasonNumber,
			&episodeID,
			&episodeTitle,
			&durationMinutes,
		); err != nil {
			return nil, err
		}

		if _, exists := seasonsMap[seasonID]; !exists {
			seasonsMap[seasonID] = &model.Season{
				SeasonID: seasonID,
				Number:   seasonNumber,
			}
			seasonOrder = append(seasonOrder, seasonID)
		}

		seasonsMap[seasonID].Episodes = append(seasonsMap[seasonID].Episodes, model.Episode{
			EpisodeID:       episodeID,
			Title:           episodeTitle,
			DurationMinutes: durationMinutes,
		})
	}

	for _, sid := range seasonOrder {
		c.Seasons = append(c.Seasons, *seasonsMap[sid])
	}

	return &c, nil
}

// ─── Search ──────────────────────────────────────────────────────────────────

func (r *catalogRepository) Search(
	title, genre, category, contentType string,
) ([]model.Content, error) {

	rows, err := r.db.Query(
		"CALL sp_search_content(?, ?, ?, ?)",
		nullableString(title),
		nullableString(genre),
		nullableString(category),
		nullableString(contentType),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanContentSummaries(rows)
}

// ─── GetFeatured ─────────────────────────────────────────────────────────────

func (r *catalogRepository) GetFeatured() ([]model.Content, error) {
	rows, err := r.db.Query("CALL sp_get_featured()")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanContentSummaries(rows)
}

// ─── GetCategories ────────────────────────────────────────────────────────────

func (r *catalogRepository) GetCategories() ([]model.Category, error) {
	rows, err := r.db.Query("CALL sp_get_categories()")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []model.Category
	for rows.Next() {
		var cat model.Category
		if err := rows.Scan(&cat.CategoryID, &cat.Name); err != nil {
			return nil, err
		}
		result = append(result, cat)
	}
	return result, nil
}

// ─── GetGenres ────────────────────────────────────────────────────────────────

func (r *catalogRepository) GetGenres() ([]model.Genre, error) {
	rows, err := r.db.Query("CALL sp_get_genres()")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []model.Genre
	for rows.Next() {
		var g model.Genre
		if err := rows.Scan(&g.GenreID, &g.Name); err != nil {
			return nil, err
		}
		result = append(result, g)
	}
	return result, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Convierte string vacío a nil para que MySQL lo reciba como NULL
func nullableString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// Escanea un result set de resumen de contenido (búsqueda y featured)
func scanContentSummaries(rows *sql.Rows) ([]model.Content, error) {
	var result []model.Content
	for rows.Next() {
		var c model.Content
		if err := rows.Scan(
			&c.ContentID,
			&c.Title,
			&c.PosterURL,
			&c.ContentType,
			&c.Genre,
			&c.Category,
		); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, nil
}
