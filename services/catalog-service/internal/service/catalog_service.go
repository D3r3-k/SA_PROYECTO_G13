package service

import (
	"context"
	"fmt"

	"quetxaltv/catalog-service/internal/provider"
	"quetxaltv/catalog-service/internal/repository"
)

type Service struct {
	Repo repository.Repository
	Tmdb provider.Client
}

type SyncResult struct {
	Success  bool
	Message  string
	Contents int
	Episodes int
	Provider string
}

func (s Service) SyncMinimum(ctx context.Context, force bool) SyncResult {
	seeds := []provider.ContentSeed{}
	providerName := "tmdb"

	if s.Tmdb.Available() {
		movieIDs := []int{603, 157336}
		for _, id := range movieIDs {
			movie, err := s.Tmdb.GetMovie(id)
			if err != nil {
				return s.fail(ctx, providerName, fmt.Sprintf("tmdb movie %d failed: %v", id, err), 0, 0)
			}
			seeds = append(seeds, provider.MovieToSeed(movie))
		}
		tv, err := s.Tmdb.GetTV(1396)
		if err != nil {
			return s.fail(ctx, providerName, fmt.Sprintf("tmdb tv failed: %v", err), 0, 0)
		}
		season, err := s.Tmdb.GetSeason(1396, 1)
		if err != nil {
			return s.fail(ctx, providerName, fmt.Sprintf("tmdb season failed: %v", err), 0, 0)
		}
		seeds = append(seeds, provider.TVToSeed(tv, season))
	} else {
		providerName = "fallback-local"
		seeds = fallbackSeeds()
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

func (s Service) fail(ctx context.Context, providerName string, msg string, contents int, episodes int) SyncResult {
	s.Repo.InsertAudit(ctx, providerName, false, msg, contents, episodes)
	return SyncResult{Success: false, Message: msg, Contents: contents, Episodes: episodes, Provider: providerName}
}

func fallbackSeeds() []provider.ContentSeed {
	return []provider.ContentSeed{
		{ExternalID: "603", Type: "movie", Title: "The Matrix", Overview: "Un programador descubre que la realidad es una simulacion.", PosterPath: "/matrix.jpg", ReleaseDate: "1999-03-31", Genres: []string{"Accion", "Ciencia ficcion"}, Cast: []provider.CastSeed{{"Keanu Reeves", "Neo", 0}, {"Laurence Fishburne", "Morpheus", 1}, {"Carrie-Anne Moss", "Trinity", 2}}},
		{ExternalID: "157336", Type: "movie", Title: "Interstellar", Overview: "Un equipo viaja por un agujero de gusano para buscar un nuevo hogar para la humanidad.", PosterPath: "/interstellar.jpg", ReleaseDate: "2014-11-05", Genres: []string{"Aventura", "Drama", "Ciencia ficcion"}, Cast: []provider.CastSeed{{"Matthew McConaughey", "Cooper", 0}, {"Anne Hathaway", "Brand", 1}, {"Jessica Chastain", "Murph", 2}}},
		{ExternalID: "1396", Type: "series", Title: "Breaking Bad", Overview: "Un profesor de quimica se involucra en la produccion de metanfetamina.", PosterPath: "/breakingbad.jpg", ReleaseDate: "2008-01-20", Genres: []string{"Drama", "Crimen"}, SeasonsCount: 5, Cast: []provider.CastSeed{{"Bryan Cranston", "Walter White", 0}, {"Aaron Paul", "Jesse Pinkman", 1}, {"Anna Gunn", "Skyler White", 2}}, Episodes: []provider.EpisodeSeed{{1, 1, "Pilot", "Walter White toma una decision extrema.", 58}, {1, 2, "Cat's in the Bag...", "Walter y Jesse enfrentan las consecuencias.", 48}, {1, 3, "...And the Bag's in the River", "Walter debe decidir que hacer con Krazy-8.", 48}, {1, 4, "Cancer Man", "La familia conoce el diagnostico.", 48}, {1, 5, "Gray Matter", "Walter recibe una oferta de ayuda.", 48}}},
	}
}
