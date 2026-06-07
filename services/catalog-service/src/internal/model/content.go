package model

type Content struct {
	ContentID   string
	Title       string
	Description string
	ContentType string // "MOVIE" | "SERIES"
	PosterURL   string
	ReleaseDate string
	Genre       string
	Category    string
	Actors      []Actor
	Seasons     []Season
}

type Actor struct {
	ActorID  string
	FullName string
	PhotoURL string
}

type Season struct {
	SeasonID string
	Number   int32
	Episodes []Episode
}

type Episode struct {
	EpisodeID       string
	Title           string
	DurationMinutes int32
}

type Category struct {
	CategoryID string
	Name       string
}

type Genre struct {
	GenreID string
	Name    string
}
