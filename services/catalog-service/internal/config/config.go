package config

import (
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
	TmdbBaseURL string
	TmdbAPIKey  string
	TmdbLang    string
}

func Load() Config {
	return Config{
		Port:        getEnv("CATALOG_GRPC_PORT", "50055"),
		DatabaseURL: getEnv("DATABASE_URL", "postgresql://catalog_user:catalog_password@catalog-db:5432/catalog_db"),
		TmdbBaseURL: getEnv("TMDB_BASE_URL", "https://api.themoviedb.org/3"),
		TmdbAPIKey:  os.Getenv("TMDB_API_KEY"),
		TmdbLang:    getEnv("TMDB_LANGUAGE", "es-GT"),
	}
}

func getEnv(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	return value
}
