package provider

type ContentSeed struct {
	ExternalID    string
	Provider      string
	Type          string
	Title         string
	Overview      string
	PosterPath    string
	ReleaseDate   string
	MediaURL      string
	MediaMimeType string
	SourcePageURL string
	Genres        []string
	Cast          []CastSeed
	SeasonsCount  int
	Episodes      []EpisodeSeed
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
	MediaURL       string
	MediaMimeType  string
}
