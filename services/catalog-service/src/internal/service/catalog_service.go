package service

import (
	"catalog-service/internal/model"
	"catalog-service/internal/repository"
)

type CatalogService struct {
	repo repository.CatalogRepository
}

func NewCatalogService(
	repo repository.CatalogRepository,
) *CatalogService {

	return &CatalogService{
		repo: repo,
	}
}

func (s *CatalogService) GetContent(
	id string,
) (*model.Content, error) {

	return s.repo.GetByID(id)
}
