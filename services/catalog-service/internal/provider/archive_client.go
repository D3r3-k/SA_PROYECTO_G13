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
	if maxEpisodes <= 0 || maxEpisodes > 5 {
		maxEpisodes = 5
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
	name := strings.ToLower(f.Name)
	format := strings.ToLower(f.Format)
	if strings.Contains(name, "_meta.xml") || strings.Contains(name, "_files.xml") {
		return false
	}
	return strings.HasSuffix(name, ".mp4") || strings.HasSuffix(name, ".ogv") || strings.HasSuffix(name, ".webm") || strings.Contains(format, "mpeg4") || strings.Contains(format, "h.264") || strings.Contains(format, "webm") || strings.Contains(format, "ogg video")
}

func mimeFromFile(f ArchiveFile) string {
	lower := strings.ToLower(f.Name)
	switch {
	case strings.HasSuffix(lower, ".mp4"):
		return "video/mp4"
	case strings.HasSuffix(lower, ".webm"):
		return "video/webm"
	case strings.HasSuffix(lower, ".ogv"), strings.HasSuffix(lower, ".ogg"):
		return "video/ogg"
	default:
		return "video/mp4"
	}
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
