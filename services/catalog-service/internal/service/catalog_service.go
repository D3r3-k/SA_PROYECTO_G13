package service

import (
	"context"
	"fmt"
	"strings"

	"quetxaltv/catalog-service/internal/provider"
	"quetxaltv/catalog-service/internal/repository"
)

type Service struct {
	Repo                     repository.Repository
	Archive                  provider.ArchiveClient
	ArchiveMovieIdentifiers  []string
	ArchiveSeriesIdentifier  string
	ArchiveSeriesIdentifiers []string
	ArchiveSeriesTitle       string
	ArchiveSeriesEpisodes    []string
	ArchiveEpisodeLimit      int
	ArchiveMovieTarget       int
	ArchiveSeriesTarget      int
	AllowFallback            bool
}

type SyncResult struct {
	Success  bool
	Message  string
	Contents int
	Episodes int
	Provider string
}

func (s Service) SyncMinimum(ctx context.Context, force bool) SyncResult {
	providerName := "archive.org"
	seeds, err := s.archiveSeeds()
	if err != nil {
		if !s.AllowFallback {
			return s.fail(ctx, providerName, fmt.Sprintf("archive.org sync failed: %v", err), 0, 0)
		}
		providerName = "fallback-local-archive-direct-urls"
		seeds = fallbackSeeds(s.movieTarget(), s.seriesTarget(), s.episodeLimit())
	}

	if force {
		if err := s.Repo.ClearCatalog(ctx); err != nil {
			return s.fail(ctx, providerName, fmt.Sprintf("catalog cleanup failed: %v", err), 0, 0)
		}
	}

	contents := 0
	episodes := 0
	for _, seed := range seeds {
		if _, err := s.Repo.UpsertContent(ctx, seed); err != nil {
			return s.fail(ctx, providerName, fmt.Sprintf("catalog persistence failed: %v", err), contents, episodes)
		}
		contents++
		episodes += len(seed.Episodes)
	}
	msg := fmt.Sprintf("catalog synced with %s: %d contents and %d episodes", providerName, contents, episodes)
	s.Repo.InsertAudit(ctx, providerName, true, msg, contents, episodes)
	return SyncResult{Success: true, Message: msg, Contents: contents, Episodes: episodes, Provider: providerName}
}

func (s Service) archiveSeeds() ([]provider.ContentSeed, error) {
	movieTarget := s.movieTarget()
	seriesTarget := s.seriesTarget()
	episodeLimit := s.episodeLimit()

	seeds := make([]provider.ContentSeed, 0, movieTarget+seriesTarget)
	movieIDs := mergeIdentifiers(s.ArchiveMovieIdentifiers, defaultMovieIdentifiers())
	seriesIDs := mergeIdentifiers(seriesIdentifiersFromConfig(s.ArchiveSeriesIdentifier, s.ArchiveSeriesIdentifiers), defaultSeriesIdentifiers())

	movieErrors := []string{}
	for i := 0; len(seedsOfType(seeds, "movie")) < movieTarget && i < len(movieIDs); i++ {
		id := movieIDs[i]
		seed, err := s.Archive.ItemToMovieSeed(id)
		if err != nil {
			movieErrors = append(movieErrors, fmt.Sprintf("%s: %v", id, err))
			if s.AllowFallback {
				seeds = append(seeds, fallbackMovieSeed(len(seedsOfType(seeds, "movie"))+1, id))
			}
			continue
		}
		seeds = append(seeds, seed)
	}

	// Compatible con la configuracion anterior: una serie armada con 3-5 identifiers de episodios.
	if len(s.ArchiveSeriesEpisodes) >= 3 && len(seedsOfType(seeds, "series")) < seriesTarget {
		ids := s.ArchiveSeriesEpisodes
		if len(ids) > episodeLimit {
			ids = ids[:episodeLimit]
		}
		seriesTitle := s.ArchiveSeriesTitle
		if strings.TrimSpace(seriesTitle) == "" {
			seriesTitle = "Serie Internet Archive"
		}
		seed, err := s.Archive.EpisodeItemsToSeriesSeed(seriesTitle, ids)
		if err != nil {
			if s.AllowFallback {
				seeds = append(seeds, fallbackSeriesSeed(len(seedsOfType(seeds, "series"))+1, seriesTitle, episodeLimit))
			}
		} else {
			seeds = append(seeds, seed)
		}
	}

	seriesErrors := []string{}
	for i := 0; len(seedsOfType(seeds, "series")) < seriesTarget && i < len(seriesIDs); i++ {
		id := seriesIDs[i]
		seed, err := s.Archive.ItemToSeriesSeed(id, episodeLimit)
		if err != nil {
			seriesErrors = append(seriesErrors, fmt.Sprintf("%s: %v", id, err))
			if s.AllowFallback {
				seeds = append(seeds, fallbackSeriesSeed(len(seedsOfType(seeds, "series"))+1, id, episodeLimit))
			}
			continue
		}
		seeds = append(seeds, seed)
	}

	moviesLoaded := len(seedsOfType(seeds, "movie"))
	seriesLoaded := len(seedsOfType(seeds, "series"))
	if moviesLoaded < movieTarget || seriesLoaded < seriesTarget {
		return nil, fmt.Errorf("insufficient archive catalog: movies=%d/%d series=%d/%d movie_errors=[%s] series_errors=[%s]", moviesLoaded, movieTarget, seriesLoaded, seriesTarget, strings.Join(movieErrors, " | "), strings.Join(seriesErrors, " | "))
	}
	return seeds, nil
}

func (s Service) fail(ctx context.Context, providerName string, msg string, contents int, episodes int) SyncResult {
	s.Repo.InsertAudit(ctx, providerName, false, msg, contents, episodes)
	return SyncResult{Success: false, Message: msg, Contents: contents, Episodes: episodes, Provider: providerName}
}

func (s Service) movieTarget() int {
	if s.ArchiveMovieTarget <= 0 {
		return 5
	}
	if s.ArchiveMovieTarget > 50 {
		return 50
	}
	return s.ArchiveMovieTarget
}

func (s Service) seriesTarget() int {
	if s.ArchiveSeriesTarget <= 0 {
		return 10
	}
	if s.ArchiveSeriesTarget > 50 {
		return 50
	}
	return s.ArchiveSeriesTarget
}

func (s Service) episodeLimit() int {
	if s.ArchiveEpisodeLimit <= 0 {
		return 5
	}
	if s.ArchiveEpisodeLimit > 5 {
		return 5
	}
	return s.ArchiveEpisodeLimit
}

func mergeIdentifiers(primary []string, defaults []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, id := range append(primary, defaults...) {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

func seriesIdentifiersFromConfig(single string, many []string) []string {
	out := []string{}
	if strings.TrimSpace(single) != "" {
		out = append(out, single)
	}
	out = append(out, many...)
	return out
}

func seedsOfType(seeds []provider.ContentSeed, typ string) []provider.ContentSeed {
	out := []provider.ContentSeed{}
	for _, seed := range seeds {
		if seed.Type == typ {
			out = append(out, seed)
		}
	}
	return out
}

func defaultMovieIdentifiers() []string {
	return []string{
		"charlie-chaplin-the-champion-1915",
		"charliechaplin_theimmigrant_20190819",
		"night_of_the_living_dead",
		"TheGeneral",
		"Nosferatu1922",
		"TheKid",
		"SherlockJr",
	}
}

func defaultSeriesIdentifiers() []string {
	return []string{
		"BarbecueForTwo1960",
		"Popeye_forPresident",
		"popeye-meets-ali-baba-1937",
		"PopeyePopeyeTheSailorMeetsSindbadTheSailor1936",
		"PopeyeAncientFistory",
		"popeye-private-eye-popeye-1954",
		"popeye-little-sweepea-1936",
		"popeye-greek-mirthology-1954",
		"popeye-i-dont-scare-1956",
		"popeye-spree-lunch-1957",
		"popeye-shuteye-popeye-1952",
		"popeye-floor-flusher-1954",
	}
}

func fallbackSeeds(movieTarget int, seriesTarget int, episodeLimit int) []provider.ContentSeed {
	out := make([]provider.ContentSeed, 0, movieTarget+seriesTarget)
	for i := 1; i <= movieTarget; i++ {
		out = append(out, fallbackMovieSeed(i, fmt.Sprintf("fallback-movie-%02d", i)))
	}
	for i := 1; i <= seriesTarget; i++ {
		out = append(out, fallbackSeriesSeed(i, fmt.Sprintf("Serie Demo %02d", i), episodeLimit))
	}
	return out
}

func fallbackMovieSeed(index int, externalID string) provider.ContentSeed {
	return provider.ContentSeed{
		ExternalID:    fmt.Sprintf("%s-movie-%02d", sanitizeExternalID(externalID), index),
		Provider:      "archive.org",
		Type:          "movie",
		Title:         fmt.Sprintf("Pelicula Archivo %02d", index),
		Overview:      "Pelicula de respaldo con URL directa a un archivo multimedia alojado en archive.org/download.",
		PosterPath:    "",
		ReleaseDate:   "",
		MediaURL:      fallbackVideoURL(),
		MediaMimeType: "video/mp4",
		SourcePageURL: "https://archive.org/details/MPEG4_File",
		Genres:        []string{"Archivo", "Dominio publico", "Pelicula"},
		Cast:          []provider.CastSeed{{ActorName: "Internet Archive", CharacterName: "Fuente", OrderIndex: 0}},
		SeasonsCount:  0,
		Episodes:      []provider.EpisodeSeed{},
	}
}

func fallbackSeriesSeed(index int, title string, episodeLimit int) provider.ContentSeed {
	if episodeLimit <= 0 || episodeLimit > 5 {
		episodeLimit = 5
	}
	episodes := make([]provider.EpisodeSeed, 0, episodeLimit)
	for i := 1; i <= episodeLimit; i++ {
		episodes = append(episodes, provider.EpisodeSeed{
			SeasonNumber:   1,
			EpisodeNumber:  i,
			Title:          fmt.Sprintf("Capitulo %d", i),
			Overview:       "Capitulo de respaldo con URL directa a archivo multimedia de Internet Archive.",
			RuntimeMinutes: 0,
			MediaURL:       fallbackVideoURL(),
			MediaMimeType:  "video/mp4",
		})
	}
	seriesTitle := strings.TrimSpace(title)
	if seriesTitle == "" {
		seriesTitle = fmt.Sprintf("Serie Archivo %02d", index)
	}
	return provider.ContentSeed{
		ExternalID:    fmt.Sprintf("%s-series-%02d", sanitizeExternalID(seriesTitle), index),
		Provider:      "archive.org",
		Type:          "series",
		Title:         fmt.Sprintf("%s", seriesTitle),
		Overview:      "Serie de respaldo con capitulos que apuntan directamente a archivos multimedia alojados en archive.org/download.",
		PosterPath:    "",
		ReleaseDate:   "",
		MediaURL:      fallbackVideoURL(),
		MediaMimeType: "video/mp4",
		SourcePageURL: "https://archive.org/details/MPEG4_File",
		Genres:        []string{"Archivo", "Dominio publico", "Serie"},
		Cast:          []provider.CastSeed{{ActorName: "Internet Archive", CharacterName: "Fuente", OrderIndex: 0}},
		SeasonsCount:  1,
		Episodes:      episodes,
	}
}

func fallbackVideoURL() string {
	return "https://archive.org/download/MPEG4_File/videotest.mp4"
}

func sanitizeExternalID(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, " ", "-")
	if value == "" {
		return "archive"
	}
	return value
}
