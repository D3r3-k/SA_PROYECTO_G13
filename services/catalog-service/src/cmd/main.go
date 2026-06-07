package main

import (
	"log"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	pb "catalog-service/generated"

	"catalog-service/internal/config"
	"catalog-service/internal/database"
	grpcHandler "catalog-service/internal/grpc"
	"catalog-service/internal/repository"
	"catalog-service/internal/service"
)

func main() {
	// 1. Config
	cfg := config.Load()

	// 2. Base de datos
	db, err := database.Connect(
		cfg.DBHost,
		cfg.DBPort,
		cfg.DBUser,
		cfg.DBPass,
		cfg.DBName,
	)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	repo := repository.NewCatalogRepository(db)
	svc := service.NewCatalogService(repo)
	handler := grpcHandler.NewCatalogHandler(svc)

	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	server := grpc.NewServer()
	pb.RegisterCatalogServiceServer(server, handler)
	reflection.Register(server)

	log.Printf("Catalog Service running on :%s", cfg.GRPCPort)
	if err := server.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
