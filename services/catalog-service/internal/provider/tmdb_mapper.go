package provider

import "fmt"

type ContentSeed struct {
	ExternalID   string
	Type         string
	Title        string
	Overview     string
	PosterPath   string
	ReleaseDate  string
	Genres       []string
	Cast         []CastSeed
	SeasonsCount int
	Episodes     []EpisodeSeed
}

type CastSeed struct {
	ActorName     string
	CharacterName string
	OrderIndex    int
}
type EpisodeSeed struct {
	SeasonNumber   int
	EpisodeNumber  int
	Title          string
	Overview       string
	RuntimeMinutes int
}

func MovieToSeed(movie TmdbMovie) ContentSeed {
	genres := make([]string, 0, len(movie.Genres))
	for _, g := range movie.Genres {
		genres = append(genres, g.Name)
	}
	cast := make([]CastSeed, 0, min(5, len(movie.Credits.Cast)))
	for i, c := range movie.Credits.Cast {
		if i >= 5 {
			break
		}
		cast = append(cast, CastSeed{c.Name, c.Character, c.Order})
	}
	return ContentSeed{ExternalID: intToString(movie.ID), Type: "movie", Title: movie.Title, Overview: movie.Overview, PosterPath: movie.PosterPath, ReleaseDate: movie.ReleaseDate, Genres: genres, Cast: cast}
}

func TVToSeed(tv TmdbTV, season TmdbSeason) ContentSeed {
	genres := make([]string, 0, len(tv.Genres))
	for _, g := range tv.Genres {
		genres = append(genres, g.Name)
	}
	cast := make([]CastSeed, 0, min(5, len(tv.Credits.Cast)))
	for i, c := range tv.Credits.Cast {
		if i >= 5 {
			break
		}
		cast = append(cast, CastSeed{c.Name, c.Character, c.Order})
	}
	episodes := make([]EpisodeSeed, 0, 5)
	for i, e := range season.Episodes {
		if i >= 5 {
			break
		}
		episodes = append(episodes, EpisodeSeed{SeasonNumber: e.SeasonNumber, EpisodeNumber: e.EpisodeNumber, Title: e.Name, Overview: e.Overview, RuntimeMinutes: e.Runtime})
	}
	return ContentSeed{ExternalID: intToString(tv.ID), Type: "series", Title: tv.Name, Overview: tv.Overview, PosterPath: tv.PosterPath, ReleaseDate: tv.FirstAirDate, Genres: genres, Cast: cast, SeasonsCount: tv.NumberOfSeasons, Episodes: episodes}
}

func intToString(value int) string { return fmt.Sprintf("%d", value) }
