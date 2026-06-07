package grpc

import (
	"context"

	pb "catalog-service/generated"
	"catalog-service/internal/service"
)

type CatalogHandler struct {
	pb.UnimplementedCatalogServiceServer

	service *service.CatalogService
}

func NewCatalogHandler(
	s *service.CatalogService,
) *CatalogHandler {

	return &CatalogHandler{
		service: s,
	}
}

func (h *CatalogHandler) GetContentById(
	ctx context.Context,
	req *pb.ContentRequest,
) (*pb.ContentDetail, error) {

	content, err := h.service.GetContent(
		req.ContentId,
	)

	if err != nil {
		return nil, err
	}

	return &pb.ContentDetail{
		ContentId:   content.ContentID,
		Title:       content.Title,
		Description: content.Description,
	}, nil
}
