package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port                     string
	DatabaseURL              string
	GCSProjectID             string
	GCSBucketName            string
	GCSSignedUploadExpires   int
	GCSSignedReadExpires     int
	GCSAllowedImageTypes     []string
	GCSAllowedVideoTypes     []string
	GCSMaxImageMB            int
	GCSMaxVideoMB            int
	ArchiveMetadataBaseURL   string
	ArchiveDownloadBaseURL   string
	ArchiveImageBaseURL      string
	ArchiveMovieIdentifiers  []string
	ArchiveSeriesIdentifier  string
	ArchiveSeriesIdentifiers []string
	ArchiveSeriesTitle       string
	ArchiveSeriesEpisodes    []string
	ArchiveEpisodeLimit      int
	ArchiveMovieTarget       int
	ArchiveSeriesTarget      int
	ArchiveAllowFallback     bool
}

func Load() Config {
	return Config{
		Port:                     getEnv("CATALOG_GRPC_PORT", "50055"),
		DatabaseURL:              getEnv("DATABASE_URL", "postgresql://catalog_user:catalog_password@catalog-db:5432/catalog_db"),
		GCSProjectID:             getEnv("GCS_PROJECT_ID", getEnv("GOOGLE_CLOUD_PROJECT", "")),
		GCSBucketName:            getEnv("GCS_BUCKET_NAME", ""),
		GCSSignedUploadExpires:   getInt("GCS_SIGNED_UPLOAD_EXPIRES_MINUTES", 15),
		GCSSignedReadExpires:     getInt("GCS_SIGNED_READ_EXPIRES_MINUTES", 60),
		GCSAllowedImageTypes:     splitList(getEnv("GCS_ALLOWED_IMAGE_TYPES", "image/jpeg,image/png,image/webp")),
		GCSAllowedVideoTypes:     splitList(getEnv("GCS_ALLOWED_VIDEO_TYPES", "video/mp4,video/webm")),
		GCSMaxImageMB:            getInt("GCS_MAX_IMAGE_MB", 10),
		GCSMaxVideoMB:            getInt("GCS_MAX_VIDEO_MB", 1024),
		ArchiveMetadataBaseURL:   getEnv("ARCHIVE_METADATA_BASE_URL", "https://archive.org/metadata"),
		ArchiveDownloadBaseURL:   getEnv("ARCHIVE_DOWNLOAD_BASE_URL", "https://archive.org/download"),
		ArchiveImageBaseURL:      getEnv("ARCHIVE_IMAGE_BASE_URL", "https://archive.org/services/img"),
		ArchiveMovieIdentifiers:  splitList(getEnv("ARCHIVE_MOVIE_IDENTIFIERS", "")),
		ArchiveSeriesIdentifier:  getEnv("ARCHIVE_SERIES_IDENTIFIER", ""),
		ArchiveSeriesIdentifiers: splitList(getEnv("ARCHIVE_SERIES_IDENTIFIERS", "")),
		ArchiveSeriesTitle:       getEnv("ARCHIVE_SERIES_TITLE", "Serie Internet Archive"),
		ArchiveSeriesEpisodes:    splitList(getEnv("ARCHIVE_SERIES_EPISODE_IDENTIFIERS", "")),
		ArchiveEpisodeLimit:      getInt("ARCHIVE_SERIES_EPISODE_LIMIT", 15),
		ArchiveMovieTarget:       getInt("ARCHIVE_MOVIE_TARGET", 5),
		ArchiveSeriesTarget:      getInt("ARCHIVE_SERIES_TARGET", 10),
		ArchiveAllowFallback:     getBool("ARCHIVE_ALLOW_FALLBACK", false),
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
