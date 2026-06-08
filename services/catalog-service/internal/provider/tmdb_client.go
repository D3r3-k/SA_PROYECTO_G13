package provider

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	BaseURL    string
	APIKey     string
	Language   string
	HTTPClient *http.Client
}

type TmdbGenre struct {
	Name string `json:"name"`
}
type TmdbCast struct {
	Name      string `json:"name"`
	Character string `json:"character"`
	Order     int    `json:"order"`
}
type TmdbCredits struct {
	Cast []TmdbCast `json:"cast"`
}
type TmdbMovie struct {
	ID          int         `json:"id"`
	Title       string      `json:"title"`
	Overview    string      `json:"overview"`
	PosterPath  string      `json:"poster_path"`
	ReleaseDate string      `json:"release_date"`
	Genres      []TmdbGenre `json:"genres"`
	Credits     TmdbCredits `json:"credits"`
}
type TmdbTV struct {
	ID              int         `json:"id"`
	Name            string      `json:"name"`
	Overview        string      `json:"overview"`
	PosterPath      string      `json:"poster_path"`
	FirstAirDate    string      `json:"first_air_date"`
	NumberOfSeasons int         `json:"number_of_seasons"`
	Genres          []TmdbGenre `json:"genres"`
	Credits         TmdbCredits `json:"credits"`
}
type TmdbEpisode struct {
	ID            int    `json:"id"`
	Name          string `json:"name"`
	Overview      string `json:"overview"`
	EpisodeNumber int    `json:"episode_number"`
	SeasonNumber  int    `json:"season_number"`
	Runtime       int    `json:"runtime"`
}
type TmdbSeason struct {
	Episodes []TmdbEpisode `json:"episodes"`
}

func NewClient(baseURL string, apiKey string, language string) Client {
	return Client{BaseURL: strings.TrimRight(baseURL, "/"), APIKey: apiKey, Language: language, HTTPClient: &http.Client{Timeout: 12 * time.Second}}
}

func (c Client) Available() bool { return strings.TrimSpace(c.APIKey) != "" }

func (c Client) get(path string, out any) error {
	if !c.Available() {
		return fmt.Errorf("TMDB_API_KEY is empty")
	}
	endpoint, err := url.Parse(c.BaseURL + path)
	if err != nil {
		return err
	}
	q := endpoint.Query()
	q.Set("api_key", c.APIKey)
	q.Set("language", c.Language)
	q.Set("append_to_response", "credits")
	endpoint.RawQuery = q.Encode()

	req, err := http.NewRequest(http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return err
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("tmdb returned status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c Client) GetMovie(id int) (TmdbMovie, error) {
	var item TmdbMovie
	err := c.get(fmt.Sprintf("/movie/%d", id), &item)
	return item, err
}
func (c Client) GetTV(id int) (TmdbTV, error) {
	var item TmdbTV
	err := c.get(fmt.Sprintf("/tv/%d", id), &item)
	return item, err
}
func (c Client) GetSeason(tvID int, season int) (TmdbSeason, error) {
	if !c.Available() {
		return TmdbSeason{}, fmt.Errorf("TMDB_API_KEY is empty")
	}
	endpoint, err := url.Parse(fmt.Sprintf("%s/tv/%d/season/%d", c.BaseURL, tvID, season))
	if err != nil {
		return TmdbSeason{}, err
	}
	q := endpoint.Query()
	q.Set("api_key", c.APIKey)
	q.Set("language", c.Language)
	endpoint.RawQuery = q.Encode()
	resp, err := c.HTTPClient.Get(endpoint.String())
	if err != nil {
		return TmdbSeason{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return TmdbSeason{}, fmt.Errorf("tmdb returned status %d", resp.StatusCode)
	}
	var item TmdbSeason
	err = json.NewDecoder(resp.Body).Decode(&item)
	return item, err
}
