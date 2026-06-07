package repository

import "catalog-service/internal/model"

type CatalogRepository interface {
	GetByID(id string) (*model.Content, error)
	Search(title, genre, category, contentType string) ([]model.Content, error)
	GetFeatured() ([]model.Content, error)
	GetCategories() ([]model.Category, error)
	GetGenres() ([]model.Genre, error)
}
