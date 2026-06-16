package main

import (
	"context"
	"log"
	"os"

	"quetxaltv/catalog-service/internal/config"
	"quetxaltv/catalog-service/internal/db"
	grpcserver "quetxaltv/catalog-service/internal/grpc"
	"quetxaltv/catalog-service/internal/provider"
	"quetxaltv/catalog-service/internal/repository"
	"quetxaltv/catalog-service/internal/service"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("catalog database connection failed: %v", err)
	}
	defer pool.Close()

	if err := db.ApplyMigrations(ctx, pool, "./migrations"); err != nil {
		log.Fatalf("catalog migrations failed: %v", err)
	}

	repo := repository.Repository{DB: pool}
	archiveClient := provider.NewArchiveClient(cfg.ArchiveMetadataBaseURL, cfg.ArchiveDownloadBaseURL, cfg.ArchiveImageBaseURL)
	mediaStore, err := service.NewMediaStore(ctx, service.MediaStoreConfig{
		ProjectID:            cfg.GCSProjectID,
		BucketName:           cfg.GCSBucketName,
		UploadExpiresMinutes: cfg.GCSSignedUploadExpires,
		ReadExpiresMinutes:   cfg.GCSSignedReadExpires,
		AllowedImageTypes:    cfg.GCSAllowedImageTypes,
		AllowedVideoTypes:    cfg.GCSAllowedVideoTypes,
		MaxImageMB:           cfg.GCSMaxImageMB,
		MaxVideoMB:           cfg.GCSMaxVideoMB,
	}, os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"))
	if err != nil {
		log.Fatalf("catalog media store init failed: %v", err)
	}
	svc := service.Service{
		Repo:                     repo,
		Archive:                  archiveClient,
		MediaStore:               mediaStore,
		ArchiveMovieIdentifiers:  cfg.ArchiveMovieIdentifiers,
		ArchiveSeriesIdentifier:  cfg.ArchiveSeriesIdentifier,
		ArchiveSeriesIdentifiers: cfg.ArchiveSeriesIdentifiers,
		ArchiveSeriesTitle:       cfg.ArchiveSeriesTitle,
		ArchiveSeriesEpisodes:    cfg.ArchiveSeriesEpisodes,
		ArchiveEpisodeLimit:      cfg.ArchiveEpisodeLimit,
		ArchiveMovieTarget:       cfg.ArchiveMovieTarget,
		ArchiveSeriesTarget:      cfg.ArchiveSeriesTarget,
		AllowFallback:            cfg.ArchiveAllowFallback,
	}
	server, err := grpcserver.New(repo, svc)
	if err != nil {
		log.Fatalf("catalog grpc init failed: %v", err)
	}
	log.Printf("Catalog Service gRPC running on :%s", cfg.Port)
	if err := server.Serve(cfg.Port); err != nil {
		log.Fatalf("catalog grpc failed: %v", err)
	}
}
