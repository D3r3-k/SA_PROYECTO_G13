package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port                    string
	DatabaseURL             string
	ArchiveMetadataBaseURL  string
	ArchiveDownloadBaseURL  string
	ArchiveMovieIdentifiers []string
	ArchiveSeriesIdentifier string
	ArchiveSeriesTitle      string
	ArchiveSeriesEpisodes   []string
	ArchiveEpisodeLimit     int
	ArchiveAllowFallback    bool
}

func Load() Config {
	return Config{
		Port:                    getEnv("CATALOG_GRPC_PORT", "50055"),
		DatabaseURL:             getEnv("DATABASE_URL", "postgresql://catalog_user:catalog_password@catalog-db:5432/catalog_db"),
		ArchiveMetadataBaseURL:  getEnv("ARCHIVE_METADATA_BASE_URL", "https://archive.org/metadata"),
		ArchiveDownloadBaseURL:  getEnv("ARCHIVE_DOWNLOAD_BASE_URL", "https://archive.org/download"),
		ArchiveMovieIdentifiers: splitList(getEnv("ARCHIVE_MOVIE_IDENTIFIERS", "charlie-chaplin-the-champion-1915,charliechaplin_theimmigrant_20190819")),
		ArchiveSeriesIdentifier: getEnv("ARCHIVE_SERIES_IDENTIFIER", "BarbecueForTwo1960"),
		ArchiveSeriesTitle:      getEnv("ARCHIVE_SERIES_TITLE", "Serie Internet Archive"),
		ArchiveSeriesEpisodes:   splitList(getEnv("ARCHIVE_SERIES_EPISODE_IDENTIFIERS", "")),
		ArchiveEpisodeLimit:     getInt("ARCHIVE_SERIES_EPISODE_LIMIT", 5),
		ArchiveAllowFallback:    getBool("ARCHIVE_ALLOW_FALLBACK", true),
	}
}

func getEnv(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	return value
}

func getInt(name string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getBool(name string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(name)))
	if value == "" {
		return fallback
	}
	return value == "true" || value == "1" || value == "yes"
}

func splitList(value string) []string {
	parts := strings.Split(value, ",")
	out := []string{}
	for _, item := range parts {
		item = strings.TrimSpace(item)
		if item != "" {
			out = append(out, item)
		}
	}
	return out
}
