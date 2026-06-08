package provider

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type ArchiveClient struct {
	MetadataBaseURL string
	DownloadBaseURL string
	HTTPClient      *http.Client
}

type ArchiveMetadataResponse struct {
	Metadata ArchiveItemMetadata `json:"metadata"`
	Files    []ArchiveFile       `json:"files"`
}

type ArchiveItemMetadata struct {
	Identifier  string `json:"identifier"`
	Title       any    `json:"title"`
	Description any    `json:"description"`
	Date        any    `json:"date"`
	Creator     any    `json:"creator"`
}

type ArchiveFile struct {
	Name   string `json:"name"`
	Format string `json:"format"`
	Title  string `json:"title"`
	Length string `json:"length"`
	Size   string `json:"size"`
}

type ArchiveSearchResponse struct {
	Response ArchiveSearchInnerResponse `json:"response"`
}

type ArchiveSearchInnerResponse struct {
	Docs []ArchiveSearchDoc `json:"docs"`
}

type ArchiveSearchDoc struct {
	Identifier string `json:"identifier"`
	Title      any    `json:"title"`
}

func NewArchiveClient(metadataBaseURL string, downloadBaseURL string) ArchiveClient {
	if strings.TrimSpace(metadataBaseURL) == "" {
		metadataBaseURL = "https://archive.org/metadata"
	}
	if strings.TrimSpace(downloadBaseURL) == "" {
		downloadBaseURL = "https://archive.org/download"
	}
	return ArchiveClient{
		MetadataBaseURL: strings.TrimRight(metadataBaseURL, "/"),
		DownloadBaseURL: strings.TrimRight(downloadBaseURL, "/"),
		HTTPClient:      &http.Client{Timeout: 15 * time.Second},
	}
}

func (c ArchiveClient) GetItem(identifier string) (ArchiveMetadataResponse, error) {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return ArchiveMetadataResponse{}, fmt.Errorf("archive identifier is empty")
	}
	endpoint := c.MetadataBaseURL + "/" + url.PathEscape(identifier)
	resp, err := c.HTTPClient.Get(endpoint)
	if err != nil {
		return ArchiveMetadataResponse{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ArchiveMetadataResponse{}, fmt.Errorf("archive.org metadata returned status %d for %s", resp.StatusCode, identifier)
	}
	var item ArchiveMetadataResponse
	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		return ArchiveMetadataResponse{}, err
	}
	if item.Metadata.Identifier == "" {
		item.Metadata.Identifier = identifier
	}
	return item, nil
}

func (c ArchiveClient) SearchIdentifiers(query string, rows int) ([]string, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		query = "mediatype:movies"
	}
	if rows <= 0 {
		rows = 25
	}
	endpoint := "https://archive.org/advancedsearch.php"
	params := url.Values{}
	params.Set("q", query)
	params.Set("fl[]", "identifier")
	params.Add("fl[]", "title")
	params.Set("rows", strconv.Itoa(rows))
	params.Set("page", "1")
	params.Set("output", "json")
	params.Set("sort[]", "downloads desc")

	resp, err := c.HTTPClient.Get(endpoint + "?" + params.Encode())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("archive.org advancedsearch returned status %d", resp.StatusCode)
	}
	var result ArchiveSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	out := []string{}
	seen := map[string]bool{}
	for _, doc := range result.Response.Docs {
		id := strings.TrimSpace(doc.Identifier)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out, nil
}

func (c ArchiveClient) ItemToMovieSeed(identifier string) (ContentSeed, error) {
	item, err := c.GetItem(identifier)
	if err != nil {
		return ContentSeed{}, err
	}
	media, ok := c.firstVideoFile(item.Files)
	if !ok {
		return ContentSeed{}, fmt.Errorf("archive item %s does not contain a supported video file", identifier)
	}
	title := firstText(item.Metadata.Title, identifier)
	return ContentSeed{
		ExternalID:    item.Metadata.Identifier,
		Provider:      "archive.org",
		Type:          "movie",
		Title:         title,
		Overview:      cleanText(firstText(item.Metadata.Description, "Archivo multimedia obtenido desde Internet Archive.")),
		PosterPath:    c.firstImageURL(item.Metadata.Identifier, item.Files),
		ReleaseDate:   firstText(item.Metadata.Date, ""),
		MediaURL:      c.downloadURL(item.Metadata.Identifier, media.Name),
		MediaMimeType: mimeFromFile(media),
		SourcePageURL: "https://archive.org/details/" + url.PathEscape(item.Metadata.Identifier),
		Genres:        []string{"Archivo", "Dominio publico"},
		Cast:          []CastSeed{{ActorName: firstText(item.Metadata.Creator, "Internet Archive"), CharacterName: "Fuente", OrderIndex: 0}},
		SeasonsCount:  0,
		Episodes:      []EpisodeSeed{},
	}, nil
}

func (c ArchiveClient) ItemToSeriesSeed(identifier string, maxEpisodes int) (ContentSeed, error) {
	item, err := c.GetItem(identifier)
	if err != nil {
		return ContentSeed{}, err
	}
	videos := c.videoFiles(item.Files)
	if len(videos) == 0 {
		return ContentSeed{}, fmt.Errorf("archive item %s does not contain supported video files", identifier)
	}
	if maxEpisodes <= 0 || maxEpisodes > 15 {
		maxEpisodes = 15
	}
	if len(videos) > maxEpisodes {
		videos = videos[:maxEpisodes]
	}
	episodes := make([]EpisodeSeed, 0, len(videos))
	for i, file := range videos {
		episodes = append(episodes, EpisodeSeed{
			SeasonNumber:   1,
			EpisodeNumber:  i + 1,
			Title:          titleFromFile(file, fmt.Sprintf("Episodio %d", i+1)),
			Overview:       "Archivo multimedia reproducible directamente desde archive.org/download.",
			RuntimeMinutes: runtimeMinutes(file.Length),
			MediaURL:       c.downloadURL(item.Metadata.Identifier, file.Name),
			MediaMimeType:  mimeFromFile(file),
		})
	}
	seriesMediaURL := ""
	seriesMediaMimeType := ""
	if len(episodes) > 0 {
		seriesMediaURL = episodes[0].MediaURL
		seriesMediaMimeType = episodes[0].MediaMimeType
	}

	return ContentSeed{
		ExternalID:    item.Metadata.Identifier,
		Provider:      "archive.org",
		Type:          "series",
		Title:         firstText(item.Metadata.Title, identifier),
		Overview:      cleanText(firstText(item.Metadata.Description, "Serie obtenida desde Internet Archive.")),
		PosterPath:    c.firstImageURL(item.Metadata.Identifier, item.Files),
		ReleaseDate:   firstText(item.Metadata.Date, ""),
		MediaURL:      seriesMediaURL,
		MediaMimeType: seriesMediaMimeType,
		SourcePageURL: "https://archive.org/details/" + url.PathEscape(item.Metadata.Identifier),
		Genres:        []string{"Archivo", "Serie", "Dominio publico"},
		Cast:          []CastSeed{{ActorName: firstText(item.Metadata.Creator, "Internet Archive"), CharacterName: "Fuente", OrderIndex: 0}},
		SeasonsCount:  1,
		Episodes:      episodes,
	}, nil
}

func (c ArchiveClient) EpisodeItemsToSeriesSeed(seriesTitle string, identifiers []string) (ContentSeed, error) {
	episodes := []EpisodeSeed{}
	poster := ""
	overview := "Serie armada desde varios archivos multimedia de Internet Archive."
	for i, id := range identifiers {
		item, err := c.GetItem(id)
		if err != nil {
			return ContentSeed{}, err
		}
		media, ok := c.firstVideoFile(item.Files)
		if !ok {
			return ContentSeed{}, fmt.Errorf("archive episode item %s does not contain a supported video file", id)
		}
		if poster == "" {
			poster = c.firstImageURL(item.Metadata.Identifier, item.Files)
		}
		episodes = append(episodes, EpisodeSeed{
			SeasonNumber:   1,
			EpisodeNumber:  i + 1,
			Title:          firstText(item.Metadata.Title, fmt.Sprintf("Episodio %d", i+1)),
			Overview:       cleanText(firstText(item.Metadata.Description, "Archivo multimedia reproducible directamente desde archive.org/download.")),
			RuntimeMinutes: runtimeMinutes(media.Length),
			MediaURL:       c.downloadURL(item.Metadata.Identifier, media.Name),
			MediaMimeType:  mimeFromFile(media),
		})
	}
	if strings.TrimSpace(seriesTitle) == "" {
		seriesTitle = "Serie Internet Archive"
	}
	seriesMediaURL := ""
	seriesMediaMimeType := ""
	if len(episodes) > 0 {
		seriesMediaURL = episodes[0].MediaURL
		seriesMediaMimeType = episodes[0].MediaMimeType
	}

	return ContentSeed{
		ExternalID:    strings.Join(identifiers, ","),
		Provider:      "archive.org",
		Type:          "series",
		Title:         seriesTitle,
		Overview:      overview,
		PosterPath:    poster,
		ReleaseDate:   "",
		MediaURL:      seriesMediaURL,
		MediaMimeType: seriesMediaMimeType,
		SourcePageURL: "https://archive.org/",
		Genres:        []string{"Archivo", "Serie", "Dominio publico"},
		Cast:          []CastSeed{{ActorName: "Internet Archive", CharacterName: "Fuente", OrderIndex: 0}},
		SeasonsCount:  1,
		Episodes:      episodes,
	}, nil
}

func (c ArchiveClient) SearchEpisodeItemsToSeriesSeed(seriesTitle string, query string, maxEpisodes int) (ContentSeed, error) {
	if maxEpisodes <= 0 || maxEpisodes > 15 {
		maxEpisodes = 15
	}
	ids, err := c.SearchIdentifiers(query, maxEpisodes*4)
	if err != nil {
		return ContentSeed{}, err
	}
	episodes := []EpisodeSeed{}
	poster := ""
	creator := "Internet Archive"
	for _, id := range ids {
		if len(episodes) >= maxEpisodes {
			break
		}
		item, err := c.GetItem(id)
		if err != nil {
			continue
		}
		media, ok := c.firstVideoFile(item.Files)
		if !ok {
			continue
		}
		if poster == "" {
			poster = c.firstImageURL(item.Metadata.Identifier, item.Files)
		}
		if creator == "Internet Archive" {
			creator = firstText(item.Metadata.Creator, "Internet Archive")
		}
		episodes = append(episodes, EpisodeSeed{
			SeasonNumber:   1,
			EpisodeNumber:  len(episodes) + 1,
			Title:          firstText(item.Metadata.Title, titleFromFile(media, fmt.Sprintf("Episodio %d", len(episodes)+1))),
			Overview:       cleanText(firstText(item.Metadata.Description, "Archivo multimedia reproducible directamente desde archive.org/download.")),
			RuntimeMinutes: runtimeMinutes(media.Length),
			MediaURL:       c.downloadURL(item.Metadata.Identifier, media.Name),
			MediaMimeType:  mimeFromFile(media),
		})
	}
	if len(episodes) < 3 {
		return ContentSeed{}, fmt.Errorf("series query %q returned only %d real mp4 episodes", query, len(episodes))
	}
	if strings.TrimSpace(seriesTitle) == "" {
		seriesTitle = "Internet Archive Collection"
	}
	return ContentSeed{
		ExternalID:    sanitizeExternalIDProvider(seriesTitle) + "-archive-series",
		Provider:      "archive.org",
		Type:          "series",
		Title:         seriesTitle,
		Overview:      "Serie armada con episodios reales obtenidos desde Internet Archive mediante advancedsearch y metadata; cada episodio apunta a un archivo .mp4 directo.",
		PosterPath:    poster,
		ReleaseDate:   "",
		MediaURL:      episodes[0].MediaURL,
		MediaMimeType: episodes[0].MediaMimeType,
		SourcePageURL: "https://archive.org/search?query=" + url.QueryEscape(query),
		Genres:        []string{"Archivo", "Serie", "Dominio publico"},
		Cast:          []CastSeed{{ActorName: creator, CharacterName: "Fuente", OrderIndex: 0}},
		SeasonsCount:  1,
		Episodes:      episodes,
	}, nil
}

func sanitizeExternalIDProvider(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, " ", "-")
	value = strings.ReplaceAll(value, ":", "")
	value = strings.ReplaceAll(value, "/", "-")
	value = regexp.MustCompile(`[^a-z0-9_-]+`).ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if value == "" {
		return "archive-series"
	}
	return value
}

func (c ArchiveClient) videoFiles(files []ArchiveFile) []ArchiveFile {
	out := []ArchiveFile{}
	for _, f := range files {
		if isSupportedVideo(f) {
			out = append(out, f)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return naturalKey(out[i].Name) < naturalKey(out[j].Name) })
	return out
}

func (c ArchiveClient) firstVideoFile(files []ArchiveFile) (ArchiveFile, bool) {
	videos := c.videoFiles(files)
	if len(videos) == 0 {
		return ArchiveFile{}, false
	}
	return videos[0], true
}

func (c ArchiveClient) firstImageURL(identifier string, files []ArchiveFile) string {
	for _, f := range files {
		lower := strings.ToLower(f.Name)
		if strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg") || strings.HasSuffix(lower, ".png") || strings.Contains(strings.ToLower(f.Format), "jpeg") || strings.Contains(strings.ToLower(f.Format), "png") {
			return c.downloadURL(identifier, f.Name)
		}
	}
	return ""
}

func (c ArchiveClient) downloadURL(identifier string, fileName string) string {
	escapedFile := strings.ReplaceAll(url.PathEscape(fileName), "%2F", "/")
	return c.DownloadBaseURL + "/" + url.PathEscape(identifier) + "/" + escapedFile
}

func isSupportedVideo(f ArchiveFile) bool {
	name := strings.ToLower(strings.TrimSpace(f.Name))
	if strings.Contains(name, "_meta.xml") || strings.Contains(name, "_files.xml") {
		return false
	}
	// Para el frontend se requiere una URL reproducible directa con terminacion .mp4.
	// No se aceptan .ogv, .ogg, .webm, .m4v ni archivos derivados sin extension mp4.
	return strings.HasSuffix(name, ".mp4")
}

func mimeFromFile(f ArchiveFile) string {
	return "video/mp4"
}

func titleFromFile(f ArchiveFile, fallback string) string {
	if strings.TrimSpace(f.Title) != "" {
		return strings.TrimSpace(f.Title)
	}
	base := path.Base(f.Name)
	ext := path.Ext(base)
	title := strings.TrimSuffix(base, ext)
	title = strings.ReplaceAll(title, "_", " ")
	title = strings.ReplaceAll(title, "-", " ")
	title = strings.TrimSpace(title)
	if title == "" {
		return fallback
	}
	return title
}

func firstText(value any, fallback string) string {
	switch v := value.(type) {
	case string:
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return fallback
}

func cleanText(value string) string {
	value = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(value, " ")
	value = strings.Join(strings.Fields(value), " ")
	if len(value) > 900 {
		return strings.TrimSpace(value[:900])
	}
	return value
}

func runtimeMinutes(length string) int {
	length = strings.TrimSpace(length)
	if length == "" {
		return 0
	}
	if seconds, err := strconv.ParseFloat(length, 64); err == nil {
		return int(seconds / 60)
	}
	parts := strings.Split(length, ":")
	total := 0
	for _, p := range parts {
		n, err := strconv.Atoi(strings.Split(p, ".")[0])
		if err != nil {
			return 0
		}
		total = total*60 + n
	}
	return total / 60
}

func naturalKey(value string) string {
	return strings.ToLower(value)
}
