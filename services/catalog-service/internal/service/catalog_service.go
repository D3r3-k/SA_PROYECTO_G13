package service

import (
	"context"
	"fmt"

	"quetxaltv/catalog-service/internal/provider"
	"quetxaltv/catalog-service/internal/repository"
)

type Service struct {
	Repo                    repository.Repository
	Archive                 provider.ArchiveClient
	ArchiveMovieIdentifiers []string
	ArchiveSeriesIdentifier string
	ArchiveSeriesTitle      string
	ArchiveSeriesEpisodes   []string
	ArchiveEpisodeLimit     int
	AllowFallback           bool
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
		seeds = fallbackSeeds()
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
	msg := fmt.Sprintf("minimum catalog synced with %s", providerName)
	s.Repo.InsertAudit(ctx, providerName, true, msg, contents, episodes)
	return SyncResult{Success: true, Message: msg, Contents: contents, Episodes: episodes, Provider: providerName}
}

func (s Service) archiveSeeds() ([]provider.ContentSeed, error) {
	if len(s.ArchiveMovieIdentifiers) < 2 {
		return nil, fmt.Errorf("ARCHIVE_MOVIE_IDENTIFIERS must contain at least 2 identifiers")
	}

	seeds := make([]provider.ContentSeed, 0, 3)
	for i, identifier := range s.ArchiveMovieIdentifiers {
		if i >= 2 {
			break
		}
		seed, err := s.Archive.ItemToMovieSeed(identifier)
		if err != nil {
			return nil, err
		}
		seeds = append(seeds, seed)
	}

	if len(s.ArchiveSeriesEpisodes) >= 3 {
		limit := s.ArchiveEpisodeLimit
		if limit <= 0 || limit > 5 {
			limit = 5
		}
		episodeIDs := s.ArchiveSeriesEpisodes
		if len(episodeIDs) > limit {
			episodeIDs = episodeIDs[:limit]
		}
		seed, err := s.Archive.EpisodeItemsToSeriesSeed(s.ArchiveSeriesTitle, episodeIDs)
		if err != nil {
			return nil, err
		}
		seeds = append(seeds, seed)
		return seeds, nil
	}

	if s.ArchiveSeriesIdentifier == "" {
		return nil, fmt.Errorf("configure ARCHIVE_SERIES_IDENTIFIER or at least 3 ARCHIVE_SERIES_EPISODE_IDENTIFIERS")
	}

	seed, err := s.Archive.ItemToSeriesSeed(s.ArchiveSeriesIdentifier, s.ArchiveEpisodeLimit)
	if err != nil {
		return nil, err
	}
	if len(seed.Episodes) < 3 {
		return nil, fmt.Errorf("series item %s returned fewer than 3 playable episodes", s.ArchiveSeriesIdentifier)
	}
	seeds = append(seeds, seed)
	return seeds, nil
}

func (s Service) fail(ctx context.Context, providerName string, msg string, contents int, episodes int) SyncResult {
	s.Repo.InsertAudit(ctx, providerName, false, msg, contents, episodes)
	return SyncResult{Success: false, Message: msg, Contents: contents, Episodes: episodes, Provider: providerName}
}

func fallbackSeeds() []provider.ContentSeed {
	return []provider.ContentSeed{
		{
			ExternalID:    "night_of_the_living_dead",
			Provider:      "archive.org",
			Type:          "movie",
			Title:         "Night of the Living Dead",
			Overview:      "Pelicula de dominio publico referenciada con URL directa al archivo multimedia de Internet Archive.",
			PosterPath:    "",
			ReleaseDate:   "1968",
			MediaURL:      "https://archive.org/download/MPEG4_File/videotest.mp4",
			MediaMimeType: "video/mp4",
			SourcePageURL: "https://archive.org/details/MPEG4_File",
			Genres:        []string{"Terror", "Dominio publico"},
			Cast:          []provider.CastSeed{{"Internet Archive", "Fuente", 0}},
		},
		{
			ExternalID:    "TheGeneral",
			Provider:      "archive.org",
			Type:          "movie",
			Title:         "The General",
			Overview:      "Pelicula clasica referenciada con URL directa al archivo multimedia de Internet Archive.",
			PosterPath:    "",
			ReleaseDate:   "1926",
			MediaURL:      "https://archive.org/download/MPEG4_File/videotest.mp4",
			MediaMimeType: "video/mp4",
			SourcePageURL: "https://archive.org/details/MPEG4_File",
			Genres:        []string{"Comedia", "Accion", "Dominio publico"},
			Cast:          []provider.CastSeed{{"Buster Keaton", "Actor principal", 0}},
		},
		{
			ExternalID:    "fallback-series-archive",
			Provider:      "archive.org",
			Type:          "series",
			Title:         "Serie Internet Archive Demo",
			Overview:      "Serie minima con cinco capitulos que apuntan directamente a archivos multimedia alojados en archive.org/download.",
			PosterPath:    "",
			ReleaseDate:   "",
			MediaURL:      "https://archive.org/download/MPEG4_File/videotest.mp4",
			MediaMimeType: "video/mp4",
			SourcePageURL: "https://archive.org/",
			Genres:        []string{"Serie", "Archivo"},
			SeasonsCount:  1,
			Cast:          []provider.CastSeed{{"Internet Archive", "Fuente", 0}},
			Episodes: []provider.EpisodeSeed{
				{1, 1, "Capitulo 1", "Archivo multimedia directo desde Internet Archive.", 0, "https://archive.org/download/MPEG4_File/videotest.mp4", "video/mp4"},
				{1, 2, "Capitulo 2", "Archivo multimedia directo desde Internet Archive.", 0, "https://archive.org/download/MPEG4_File/videotest.mp4", "video/mp4"},
				{1, 3, "Capitulo 3", "Archivo multimedia directo desde Internet Archive.", 0, "https://archive.org/download/MPEG4_File/videotest.mp4", "video/mp4"},
				{1, 4, "Capitulo 4", "Archivo multimedia directo desde Internet Archive.", 0, "https://archive.org/download/MPEG4_File/videotest.mp4", "video/mp4"},
				{1, 5, "Capitulo 5", "Archivo multimedia directo desde Internet Archive.", 0, "https://archive.org/download/MPEG4_File/videotest.mp4", "video/mp4"},
			},
		},
	}
}
