package service

import (
	"context"
	"encoding/json"
	"fmt"
	"mime"
	"net/url"
	"os"
	"path"
	"strings"
	"time"

	"cloud.google.com/go/storage"
	"github.com/google/uuid"
	"google.golang.org/api/option"
)

type MediaStoreConfig struct {
	ProjectID            string
	BucketName           string
	UploadExpiresMinutes int
	ReadExpiresMinutes   int
	AllowedImageTypes    []string
	AllowedVideoTypes    []string
	MaxImageMB           int
	MaxVideoMB           int
}

type MediaStore struct {
	client       *storage.Client
	bucketName   string
	googleID     string
	privateKey   []byte
	uploadExpiry time.Duration
	readExpiry   time.Duration
	imageTypes   map[string]bool
	videoTypes   map[string]bool
	maxImageByte int64
	maxVideoByte int64
}

type serviceAccountFile struct {
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
}

type UploadURLRequest struct {
	ContentID   string
	EpisodeID   string
	MediaType   string
	FileName    string
	ContentType string
	SizeBytes   int64
}

type UploadURLResult struct {
	UploadURL        string
	ObjectKey        string
	ExpiresInMinutes int
}

func NewMediaStore(ctx context.Context, cfg MediaStoreConfig, credentialsPath string) (*MediaStore, error) {
	if strings.TrimSpace(cfg.BucketName) == "" || strings.TrimSpace(credentialsPath) == "" {
		return nil, nil
	}

	raw, err := os.ReadFile(credentialsPath)
	if err != nil {
		return nil, fmt.Errorf("read gcs credentials: %w", err)
	}
	var account serviceAccountFile
	if err := json.Unmarshal(raw, &account); err != nil {
		return nil, fmt.Errorf("parse gcs credentials: %w", err)
	}
	if account.ClientEmail == "" || account.PrivateKey == "" {
		return nil, fmt.Errorf("gcs credentials missing client_email or private_key")
	}

	client, err := storage.NewClient(ctx, option.WithCredentialsFile(credentialsPath))
	if err != nil {
		return nil, fmt.Errorf("create gcs client: %w", err)
	}

	return &MediaStore{
		client:       client,
		bucketName:   cfg.BucketName,
		googleID:     account.ClientEmail,
		privateKey:   []byte(account.PrivateKey),
		uploadExpiry: minutes(cfg.UploadExpiresMinutes, 15),
		readExpiry:   minutes(cfg.ReadExpiresMinutes, 60),
		imageTypes:   typeSet(cfg.AllowedImageTypes),
		videoTypes:   typeSet(cfg.AllowedVideoTypes),
		maxImageByte: int64(maxInt(cfg.MaxImageMB, 10)) * 1024 * 1024,
		maxVideoByte: int64(maxInt(cfg.MaxVideoMB, 1024)) * 1024 * 1024,
	}, nil
}

func (m *MediaStore) GenerateUploadURL(req UploadURLRequest) (UploadURLResult, error) {
	if m == nil {
		return UploadURLResult{}, fmt.Errorf("gcs media store is not configured")
	}
	if err := m.validateUploadRequest(req); err != nil {
		return UploadURLResult{}, err
	}

	objectKey, err := buildObjectKey(req)
	if err != nil {
		return UploadURLResult{}, err
	}
	uploadURL, err := storage.SignedURL(m.bucketName, objectKey, &storage.SignedURLOptions{
		GoogleAccessID: m.googleID,
		PrivateKey:     m.privateKey,
		Method:         "PUT",
		Expires:        time.Now().Add(m.uploadExpiry),
		ContentType:    req.ContentType,
		Scheme:         storage.SigningSchemeV4,
	})
	if err != nil {
		return UploadURLResult{}, fmt.Errorf("generate signed upload url: %w", err)
	}
	return UploadURLResult{
		UploadURL:        uploadURL,
		ObjectKey:        objectKey,
		ExpiresInMinutes: int(m.uploadExpiry / time.Minute),
	}, nil
}

func (m *MediaStore) ObjectExists(ctx context.Context, objectKey string) error {
	if m == nil {
		return fmt.Errorf("gcs media store is not configured")
	}
	if !isManagedObjectKey(objectKey) {
		return fmt.Errorf("invalid media object key")
	}
	_, err := m.client.Bucket(m.bucketName).Object(objectKey).Attrs(ctx)
	if err != nil {
		return fmt.Errorf("gcs object not found: %w", err)
	}
	return nil
}

func (m *MediaStore) DeleteObject(ctx context.Context, objectKey string) error {
	if m == nil || !isManagedObjectKey(objectKey) {
		return nil
	}
	err := m.client.Bucket(m.bucketName).Object(objectKey).Delete(ctx)
	if err == storage.ErrObjectNotExist {
		return nil
	}
	if err != nil {
		return fmt.Errorf("delete gcs object %s: %w", objectKey, err)
	}
	return nil
}

func (m *MediaStore) SignedReadURL(objectKey string) string {
	if m == nil || !isManagedObjectKey(objectKey) {
		return objectKey
	}
	readURL, err := storage.SignedURL(m.bucketName, objectKey, &storage.SignedURLOptions{
		GoogleAccessID: m.googleID,
		PrivateKey:     m.privateKey,
		Method:         "GET",
		Expires:        time.Now().Add(m.readExpiry),
		Scheme:         storage.SigningSchemeV4,
	})
	if err != nil {
		return objectKey
	}
	return readURL
}

func (m *MediaStore) validateUploadRequest(req UploadURLRequest) error {
	if strings.TrimSpace(req.ContentID) == "" {
		return fmt.Errorf("content_id is required")
	}
	if strings.TrimSpace(req.FileName) == "" {
		return fmt.Errorf("file_name is required")
	}
	if strings.TrimSpace(req.ContentType) == "" {
		return fmt.Errorf("content_type is required")
	}
	if req.SizeBytes <= 0 {
		return fmt.Errorf("size_bytes must be positive")
	}

	switch req.MediaType {
	case "poster":
		if !m.imageTypes[req.ContentType] {
			return fmt.Errorf("image content type is not allowed")
		}
		if req.SizeBytes > m.maxImageByte {
			return fmt.Errorf("image exceeds max size")
		}
	case "movie_video":
		if !m.videoTypes[req.ContentType] {
			return fmt.Errorf("video content type is not allowed")
		}
		if req.SizeBytes > m.maxVideoByte {
			return fmt.Errorf("video exceeds max size")
		}
	case "episode_video":
		if strings.TrimSpace(req.EpisodeID) == "" {
			return fmt.Errorf("episode_id is required")
		}
		if !m.videoTypes[req.ContentType] {
			return fmt.Errorf("video content type is not allowed")
		}
		if req.SizeBytes > m.maxVideoByte {
			return fmt.Errorf("video exceeds max size")
		}
	default:
		return fmt.Errorf("media_type must be poster, movie_video or episode_video")
	}
	return nil
}

func buildObjectKey(req UploadURLRequest) (string, error) {
	ext := strings.ToLower(path.Ext(req.FileName))
	if ext == "" {
		extensions, err := mime.ExtensionsByType(req.ContentType)
		if err == nil && len(extensions) > 0 {
			ext = extensions[0]
		}
	}
	if ext == "" {
		return "", fmt.Errorf("file extension is required")
	}

	name := uuid.NewString() + ext
	contentID := url.PathEscape(strings.TrimSpace(req.ContentID))
	switch req.MediaType {
	case "poster":
		return path.Join("covers", contentID, name), nil
	case "movie_video":
		return path.Join("videos", contentID, name), nil
	case "episode_video":
		episodeID := url.PathEscape(strings.TrimSpace(req.EpisodeID))
		return path.Join("videos", contentID, "episodes", episodeID, name), nil
	default:
		return "", fmt.Errorf("invalid media_type")
	}
}

func isManagedObjectKey(value string) bool {
	return strings.HasPrefix(value, "covers/") || strings.HasPrefix(value, "videos/")
}

func typeSet(values []string) map[string]bool {
	out := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(strings.ToLower(value))
		if value != "" {
			out[value] = true
		}
	}
	return out
}

func minutes(value int, fallback int) time.Duration {
	if value <= 0 {
		value = fallback
	}
	return time.Duration(value) * time.Minute
}

func maxInt(value int, fallback int) int {
	if value <= 0 {
		return fallback
	}
	return value
}
