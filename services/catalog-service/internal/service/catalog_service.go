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
	MediaStore               *MediaStore
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

type AdminContentInput struct {
	ContentID     string
	ExternalID    string
	Type          string
	Title         string
	Overview      string
	PosterPath    string
	ReleaseDate   string
	AvailableFrom string
	Genres        []string
	Cast          []AdminCastInput
	Episodes      []AdminEpisodeInput
	ActorUserID   string
	ActorEmail    string
}

type AdminCastInput struct {
	ActorName     string
	CharacterName string
	OrderIndex    int
}

type AdminEpisodeInput struct {
	SeasonNumber   int
	EpisodeNumber  int
	Title          string
	Overview       string
	RuntimeMinutes int
}

type AdminContentResult struct {
	Success   bool
	Message   string
	ContentID string
	Episodes  []repository.Episode
}

type ConfirmMediaInput struct {
	ContentID   string
	EpisodeID   string
	MediaType   string
	ObjectKey   string
	ContentType string
	ActorUserID string
	ActorEmail  string
}

func (s Service) SyncMinimum(ctx context.Context, force bool) SyncResult {
	providerName := "archive.org"
	seeds, err := s.archiveSeeds()
	if err != nil {
		return s.fail(ctx, providerName, fmt.Sprintf("archive.org sync failed: %v", err), 0, 0)
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

func (s Service) CreateAdminContent(ctx context.Context, input AdminContentInput) AdminContentResult {
	write, err := adminInputToWrite(input, false)
	if err != nil {
		return AdminContentResult{Success: false, Message: err.Error()}
	}
	contentID, episodes, err := s.Repo.CreateAdminContent(ctx, write)
	if err != nil {
		return AdminContentResult{Success: false, Message: fmt.Sprintf("catalog persistence failed: %v", err)}
	}
	return AdminContentResult{
		Success:   true,
		Message:   "content created",
		ContentID: contentID,
		Episodes:  episodes,
	}
}

func (s Service) UpdateAdminContent(ctx context.Context, input AdminContentInput) AdminContentResult {
	write, err := adminInputToWrite(input, true)
	if err != nil {
		return AdminContentResult{Success: false, Message: err.Error()}
	}
	if err := s.Repo.UpdateAdminContent(ctx, write); err != nil {
		return AdminContentResult{Success: false, Message: fmt.Sprintf("catalog update failed: %v", err)}
	}
	episodes, err := s.Repo.AllEpisodes(ctx, input.ContentID)
	if err != nil {
		return AdminContentResult{Success: false, Message: fmt.Sprintf("catalog episode reload failed: %v", err)}
	}
	return AdminContentResult{Success: true, Message: "content updated", ContentID: input.ContentID, Episodes: episodes}
}

func (s Service) DeleteAdminContent(ctx context.Context, contentID string, actorUserID string, actorEmail string) AdminContentResult {
	if strings.TrimSpace(contentID) == "" {
		return AdminContentResult{Success: false, Message: "content_id is required"}
	}
	if err := s.Repo.SoftDeleteContent(ctx, contentID, actorUserID, actorEmail); err != nil {
		return AdminContentResult{Success: false, Message: fmt.Sprintf("catalog delete failed: %v", err)}
	}
	return AdminContentResult{Success: true, Message: "content deleted", ContentID: contentID}
}

func (s Service) SchedulePremiere(ctx context.Context, contentID string, availableFrom string, actorUserID string, actorEmail string) AdminContentResult {
	if strings.TrimSpace(contentID) == "" {
		return AdminContentResult{Success: false, Message: "content_id is required"}
	}
	if strings.TrimSpace(availableFrom) == "" {
		return AdminContentResult{Success: false, Message: "available_from is required"}
	}
	if err := s.Repo.SchedulePremiere(ctx, contentID, availableFrom, actorUserID, actorEmail); err != nil {
		return AdminContentResult{Success: false, Message: fmt.Sprintf("catalog schedule failed: %v", err)}
	}
	return AdminContentResult{Success: true, Message: "premiere scheduled", ContentID: contentID}
}

func (s Service) GenerateUploadURL(req UploadURLRequest) (UploadURLResult, error) {
	return s.MediaStore.GenerateUploadURL(req)
}

func (s Service) ConfirmMedia(ctx context.Context, input ConfirmMediaInput) error {
	if err := s.MediaStore.ObjectExists(ctx, input.ObjectKey); err != nil {
		return err
	}
	switch input.MediaType {
	case "poster", "movie_video":
		return s.Repo.UpdateContentMedia(ctx, input.ContentID, input.MediaType, input.ObjectKey, input.ContentType, input.ActorUserID, input.ActorEmail)
	case "episode_video":
		return s.Repo.UpdateEpisodeMedia(ctx, input.ContentID, input.EpisodeID, input.ObjectKey, input.ContentType, input.ActorUserID, input.ActorEmail)
	default:
		return fmt.Errorf("media_type must be poster, movie_video or episode_video")
	}
}

func (s Service) ResolveReadURL(value string) string {
	if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") {
		return value
	}
	return s.MediaStore.SignedReadURL(value)
}

func (s Service) archiveSeeds() ([]provider.ContentSeed, error) {
	movieTarget := s.movieTarget()
	seriesTarget := s.seriesTarget()
	episodeLimit := s.episodeLimit()

	seeds := make([]provider.ContentSeed, 0, movieTarget+seriesTarget)
	usedContentIDs := map[string]bool{}

	// 1) Peliculas reales por identifiers configurados o defaults.
	movieIDs := mergeIdentifiers(s.ArchiveMovieIdentifiers, defaultMovieIdentifiers())
	movieErrors := []string{}
	for i := 0; len(seedsOfType(seeds, "movie")) < movieTarget && i < len(movieIDs); i++ {
		seed, err := s.Archive.ItemToMovieSeed(movieIDs[i])
		if err != nil {
			movieErrors = append(movieErrors, fmt.Sprintf("%s: %v", movieIDs[i], err))
			continue
		}
		if !isRealMP4Seed(seed) || usedContentIDs[seed.ExternalID] {
			continue
		}
		usedContentIDs[seed.ExternalID] = true
		seeds = append(seeds, seed)
	}

	// 2) Si faltan peliculas, se descubren items reales desde archive.org advancedsearch.
	for _, query := range defaultMovieSearchQueries() {
		if len(seedsOfType(seeds, "movie")) >= movieTarget {
			break
		}
		ids, err := s.Archive.SearchIdentifiers(query, 40)
		if err != nil {
			movieErrors = append(movieErrors, fmt.Sprintf("search %q: %v", query, err))
			continue
		}
		for _, id := range ids {
			if len(seedsOfType(seeds, "movie")) >= movieTarget {
				break
			}
			if usedContentIDs[id] {
				continue
			}
			seed, err := s.Archive.ItemToMovieSeed(id)
			if err != nil || !isRealMP4Seed(seed) {
				continue
			}
			usedContentIDs[seed.ExternalID] = true
			seeds = append(seeds, seed)
		}
	}

	// 3) Serie real armada por identifiers configurados de episodios.
	if len(s.ArchiveSeriesEpisodes) >= 3 && len(seedsOfType(seeds, "series")) < seriesTarget {
		ids := s.ArchiveSeriesEpisodes
		if len(ids) > episodeLimit {
			ids = ids[:episodeLimit]
		}
		seriesTitle := strings.TrimSpace(s.ArchiveSeriesTitle)
		if seriesTitle == "" {
			seriesTitle = "Serie Internet Archive"
		}
		seed, err := s.Archive.EpisodeItemsToSeriesSeed(seriesTitle, ids)
		if err == nil && isRealMP4Series(seed) {
			seed.ExternalID = uniqueSeriesExternalID(seed.ExternalID, len(seedsOfType(seeds, "series"))+1)
			seeds = append(seeds, seed)
		}
	}

	// 4) Series reales por identifiers configurados/defaults que contienen varios MP4 en un mismo item.
	seriesIDs := mergeIdentifiers(seriesIdentifiersFromConfig(s.ArchiveSeriesIdentifier, s.ArchiveSeriesIdentifiers), defaultSeriesIdentifiers())
	seriesErrors := []string{}
	for i := 0; len(seedsOfType(seeds, "series")) < seriesTarget && i < len(seriesIDs); i++ {
		seed, err := s.Archive.ItemToSeriesSeed(seriesIDs[i], episodeLimit)
		if err != nil {
			seriesErrors = append(seriesErrors, fmt.Sprintf("%s: %v", seriesIDs[i], err))
			continue
		}
		if !isRealMP4Series(seed) {
			continue
		}
		seed.ExternalID = uniqueSeriesExternalID(seed.ExternalID, len(seedsOfType(seeds, "series"))+1)
		seeds = append(seeds, seed)
	}

	// 5) Si faltan series, se crean colecciones con episodios reales encontrados por advancedsearch.
	for _, def := range defaultSeriesSearchDefinitions() {
		if len(seedsOfType(seeds, "series")) >= seriesTarget {
			break
		}
		seed, err := s.Archive.SearchEpisodeItemsToSeriesSeed(def.Title, def.Query, episodeLimit)
		if err != nil {
			seriesErrors = append(seriesErrors, fmt.Sprintf("search %q: %v", def.Query, err))
			continue
		}
		if !isRealMP4Series(seed) {
			continue
		}
		seed.ExternalID = uniqueSeriesExternalID(seed.ExternalID, len(seedsOfType(seeds, "series"))+1)
		seeds = append(seeds, seed)
	}

	moviesLoaded := len(seedsOfType(seeds, "movie"))
	seriesLoaded := len(seedsOfType(seeds, "series"))
	minMovies := 2
	minSeries := 1
	if s.AllowFallback {
		minMovies = 1
		minSeries = 0
	}
	if moviesLoaded < minMovies || seriesLoaded < minSeries {
		return nil, fmt.Errorf("insufficient real archive.org mp4 catalog: movies=%d/%d series=%d/%d movie_errors=[%s] series_errors=[%s]", moviesLoaded, movieTarget, seriesLoaded, seriesTarget, strings.Join(movieErrors, " | "), strings.Join(seriesErrors, " | "))
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
		return 15
	}
	if s.ArchiveEpisodeLimit > 15 {
		return 15
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
		"Nosferatu1922",
		"night_of_the_living_dead",
	}
}

func defaultSeriesIdentifiers() []string {
	return []string{
		"BarbecueForTwo1960",
	}
}

type seriesSearchDefinition struct {
	Title string
	Query string
}

func defaultMovieSearchQueries() []string {
	return []string{
		`mediatype:movies AND format:mp4 AND title:(charlie chaplin)`,
		`mediatype:movies AND format:mp4 AND title:(public domain movie)`,
		`mediatype:movies AND format:mp4 AND title:(silent film)`,
	}
}

func defaultSeriesSearchDefinitions() []seriesSearchDefinition {
	return []seriesSearchDefinition{
		{Title: "Popeye Classics", Query: `mediatype:movies AND format:mp4 AND title:popeye`},
		{Title: "Betty Boop Classics", Query: `mediatype:movies AND format:mp4 AND title:(betty boop)`},
		{Title: "Superman Cartoons", Query: `mediatype:movies AND format:mp4 AND title:(superman cartoon)`},
		{Title: "Felix The Cat", Query: `mediatype:movies AND format:mp4 AND title:(felix cat)`},
		{Title: "Charlie Chaplin Shorts", Query: `mediatype:movies AND format:mp4 AND title:(charlie chaplin)`},
		{Title: "Classic Cartoons", Query: `mediatype:movies AND format:mp4 AND title:(classic cartoon)`},
		{Title: "Public Domain Shorts", Query: `mediatype:movies AND format:mp4 AND title:(public domain)`},
		{Title: "Silent Film Shorts", Query: `mediatype:movies AND format:mp4 AND title:(silent film)`},
		{Title: "Animation Archive", Query: `mediatype:movies AND format:mp4 AND title:animation`},
		{Title: "Vintage Cinema", Query: `mediatype:movies AND format:mp4 AND title:(vintage film)`},
	}
}

func isRealMP4Seed(seed provider.ContentSeed) bool {
	return strings.HasPrefix(seed.MediaURL, "https://archive.org/download/") && strings.HasSuffix(strings.ToLower(seed.MediaURL), ".mp4") && seed.MediaMimeType == "video/mp4"
}

func isRealMP4Series(seed provider.ContentSeed) bool {
	if !isRealMP4Seed(seed) || len(seed.Episodes) < 3 || len(seed.Episodes) > 15 {
		return false
	}
	for _, ep := range seed.Episodes {
		if !strings.HasPrefix(ep.MediaURL, "https://archive.org/download/") || !strings.HasSuffix(strings.ToLower(ep.MediaURL), ".mp4") || ep.MediaMimeType != "video/mp4" {
			return false
		}
	}
	return true
}

func uniqueSeriesExternalID(base string, index int) string {
	base = sanitizeExternalID(base)
	return fmt.Sprintf("%s-series-real-%02d", base, index)
}

func sanitizeExternalID(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, " ", "-")
	if value == "" {
		return "archive"
	}
	return value
}

func adminInputToWrite(input AdminContentInput, requireContentID bool) (repository.AdminContentWrite, error) {
	typ := strings.TrimSpace(input.Type)
	if typ != "movie" && typ != "series" {
		return repository.AdminContentWrite{}, fmt.Errorf("type must be movie or series")
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return repository.AdminContentWrite{}, fmt.Errorf("title is required")
	}

	if requireContentID && strings.TrimSpace(input.ContentID) == "" {
		return repository.AdminContentWrite{}, fmt.Errorf("content_id is required")
	}

	write := repository.AdminContentWrite{
		ContentID:     strings.TrimSpace(input.ContentID),
		ExternalID:    strings.TrimSpace(input.ExternalID),
		Type:          typ,
		Title:         title,
		Overview:      strings.TrimSpace(input.Overview),
		PosterPath:    strings.TrimSpace(input.PosterPath),
		ReleaseDate:   strings.TrimSpace(input.ReleaseDate),
		AvailableFrom: strings.TrimSpace(input.AvailableFrom),
		Genres:        input.Genres,
		ActorUserID:   strings.TrimSpace(input.ActorUserID),
		ActorEmail:    strings.TrimSpace(input.ActorEmail),
	}
	for _, item := range input.Cast {
		if strings.TrimSpace(item.ActorName) == "" {
			continue
		}
		write.Cast = append(write.Cast, provider.CastSeed{
			ActorName:     strings.TrimSpace(item.ActorName),
			CharacterName: strings.TrimSpace(item.CharacterName),
			OrderIndex:    item.OrderIndex,
		})
	}
	maxSeason := 0
	for _, item := range input.Episodes {
		if typ != "series" {
			continue
		}
		if strings.TrimSpace(item.Title) == "" {
			return repository.AdminContentWrite{}, fmt.Errorf("episode title is required")
		}
		seasonNumber := item.SeasonNumber
		if seasonNumber <= 0 {
			seasonNumber = 1
		}
		episodeNumber := item.EpisodeNumber
		if episodeNumber <= 0 {
			return repository.AdminContentWrite{}, fmt.Errorf("episode_number must be positive")
		}
		if seasonNumber > maxSeason {
			maxSeason = seasonNumber
		}
		write.Episodes = append(write.Episodes, provider.EpisodeSeed{
			SeasonNumber:   seasonNumber,
			EpisodeNumber:  episodeNumber,
			Title:          strings.TrimSpace(item.Title),
			Overview:       strings.TrimSpace(item.Overview),
			RuntimeMinutes: item.RuntimeMinutes,
		})
	}
	if typ == "series" && len(write.Episodes) == 0 {
		return repository.AdminContentWrite{}, fmt.Errorf("series requires at least one episode")
	}
	_ = maxSeason
	return write, nil
}
