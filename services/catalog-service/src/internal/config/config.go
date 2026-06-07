// internal/config/config.go
package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost   string
	DBPort   string
	DBUser   string
	DBPass   string
	DBName   string
	GRPCPort string
}

func Load() *Config {
	godotenv.Load()
	return &Config{
		DBHost:   os.Getenv("DB_HOST"),
		DBPort:   os.Getenv("DB_PORT"),
		DBUser:   os.Getenv("DB_USER"),
		DBPass:   os.Getenv("DB_PASSWORD"),
		DBName:   os.Getenv("DB_NAME"),
		GRPCPort: getEnv("GRPC_PORT", "50051"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
