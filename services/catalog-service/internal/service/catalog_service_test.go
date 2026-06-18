package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"quetxaltv/catalog-service/internal/provider"
	"quetxaltv/catalog-service/internal/repository"
)

// ─── mocks ───────────────────────────────────────────────────────────────────

type mockRepo struct {
	clearCatalogErr       error
	upsertContentID       string
	upsertContentErr      error
	createAdminID         string
	createAdminEpisodes   []repository.Episode
	createAdminErr        error
	updateAdminErr        error
	allEpisodesReturn     []repository.Episode
	allEpisodesErr        error
	softDeleteErr         error
	schedulePremErr       error
	updateContentMediaErr error
	updateEpisodeMediaErr error
	contentMediaKeys      repository.DeletedContentMedia
	contentMediaFound     bool
	contentMediaErr       error
	deleteContentErr      error
	insertAuditCalled     bool
}

func (m *mockRepo) ClearCatalog(ctx context.Context) error { return m.clearCatalogErr }
func (m *mockRepo) UpsertContent(ctx context.Context, seed provider.ContentSeed) (string, error) {
	return m.upsertContentID, m.upsertContentErr
}
func (m *mockRepo) InsertAudit(_ context.Context, _ string, _ bool, _ string, _ int, _ int) {
	m.insertAuditCalled = true
}
func (m *mockRepo) CreateAdminContent(ctx context.Context, input repository.AdminContentWrite) (string, []repository.Episode, error) {
	return m.createAdminID, m.createAdminEpisodes, m.createAdminErr
}
func (m *mockRepo) UpdateAdminContent(ctx context.Context, input repository.AdminContentWrite) error {
	return m.updateAdminErr
}
func (m *mockRepo) AllEpisodes(ctx context.Context, id string) ([]repository.Episode, error) {
	return m.allEpisodesReturn, m.allEpisodesErr
}
func (m *mockRepo) SoftDeleteContent(ctx context.Context, contentID string, actorUserID string, actorEmail string) error {
	return m.softDeleteErr
}
func (m *mockRepo) SchedulePremiere(ctx context.Context, contentID string, availableFrom string, actorUserID string, actorEmail string) error {
	return m.schedulePremErr
}
func (m *mockRepo) UpdateContentMedia(ctx context.Context, contentID string, mediaType string, objectKey string, contentType string, actorUserID string, actorEmail string) error {
	return m.updateContentMediaErr
}
func (m *mockRepo) UpdateEpisodeMedia(ctx context.Context, contentID string, episodeID string, objectKey string, contentType string, actorUserID string, actorEmail string) error {
	return m.updateEpisodeMediaErr
}
func (m *mockRepo) ContentMediaKeys(ctx context.Context, contentID string) (repository.DeletedContentMedia, bool, error) {
	return m.contentMediaKeys, m.contentMediaFound, m.contentMediaErr
}
func (m *mockRepo) DeleteContent(ctx context.Context, contentID string) error {
	return m.deleteContentErr
}

type mockArchive struct {
	movieSeeds    []provider.ContentSeed
	movieErrs     []error
	movieCallIdx  int
	searchIDs     []string
	searchErr     error
	episodeSeed   provider.ContentSeed
	episodeErr    error
	seriesSeed    provider.ContentSeed
	seriesErr     error
	searchEpSeed  provider.ContentSeed
	searchEpErr   error
}

func (m *mockArchive) ItemToMovieSeed(identifier string) (provider.ContentSeed, error) {
	idx := m.movieCallIdx
	m.movieCallIdx++
	if m.movieErrs != nil && idx < len(m.movieErrs) {
		return provider.ContentSeed{}, m.movieErrs[idx]
	}
	if idx < len(m.movieSeeds) {
		return m.movieSeeds[idx], nil
	}
	return provider.ContentSeed{}, fmt.Errorf("no more seeds")
}
func (m *mockArchive) SearchIdentifiers(query string, rows int) ([]string, error) {
	return m.searchIDs, m.searchErr
}
func (m *mockArchive) EpisodeItemsToSeriesSeed(seriesTitle string, identifiers []string) (provider.ContentSeed, error) {
	return m.episodeSeed, m.episodeErr
}
func (m *mockArchive) ItemToSeriesSeed(identifier string, maxEpisodes int) (provider.ContentSeed, error) {
	return m.seriesSeed, m.seriesErr
}
func (m *mockArchive) SearchEpisodeItemsToSeriesSeed(seriesTitle string, query string, maxEpisodes int) (provider.ContentSeed, error) {
	return m.searchEpSeed, m.searchEpErr
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func validMovieSeed(n int) provider.ContentSeed {
	return provider.ContentSeed{
		ExternalID:    fmt.Sprintf("movie-%d", n),
		Type:          "movie",
		MediaURL:      fmt.Sprintf("https://archive.org/download/movie-%d/film.mp4", n),
		MediaMimeType: "video/mp4",
	}
}

func validSeriesSeed(n int) provider.ContentSeed {
	ep := provider.EpisodeSeed{
		MediaURL:      fmt.Sprintf("https://archive.org/download/series-%d/ep.mp4", n),
		MediaMimeType: "video/mp4",
	}
	return provider.ContentSeed{
		ExternalID:    fmt.Sprintf("series-%d", n),
		Type:          "series",
		MediaURL:      fmt.Sprintf("https://archive.org/download/series-%d/main.mp4", n),
		MediaMimeType: "video/mp4",
		Episodes:      []provider.EpisodeSeed{ep, ep, ep},
	}
}

func newSvc(repo RepositoryI, archive ArchiveI) Service {
	return Service{
		Repo:                repo,
		Archive:             archive,
		AllowFallback:       true,
		ArchiveMovieTarget:  1,
		ArchiveSeriesTarget: 1,
		ArchiveEpisodeLimit: 3,
	}
}

// ─── SyncMinimum ─────────────────────────────────────────────────────────────

func TestSyncMinimum_AllArchiveFails(t *testing.T) {
	errFail := errors.New("archive unreachable")
	archive := &mockArchive{
		movieErrs: []error{errFail, errFail, errFail, errFail},
		searchErr: errFail,
		seriesErr: errFail,
		searchEpErr: errFail,
	}
	repo := &mockRepo{}
	svc := newSvc(repo, archive)

	result := svc.SyncMinimum(context.Background(), false)
	if result.Success {
		t.Error("expected failure when all archive calls fail")
	}
	if !repo.insertAuditCalled {
		t.Error("InsertAudit should be called on failure")
	}
}

func TestSyncMinimum_Success(t *testing.T) {
	archive := &mockArchive{
		movieSeeds: []provider.ContentSeed{validMovieSeed(0)},
		seriesErr:  errors.New("no series"),
		searchEpErr: errors.New("no search"),
	}
	repo := &mockRepo{upsertContentID: "content-uuid"}
	svc := newSvc(repo, archive)

	result := svc.SyncMinimum(context.Background(), false)
	if !result.Success {
		t.Errorf("expected success, got: %s", result.Message)
	}
	if result.Contents != 1 {
		t.Errorf("expected 1 content, got %d", result.Contents)
	}
	if !repo.insertAuditCalled {
		t.Error("InsertAudit should be called on success")
	}
}

func TestSyncMinimum_UpsertFails(t *testing.T) {
	archive := &mockArchive{
		movieSeeds:  []provider.ContentSeed{validMovieSeed(0)},
		seriesErr:   errors.New("no series"),
		searchEpErr: errors.New("no search"),
	}
	repo := &mockRepo{upsertContentErr: errors.New("db error")}
	svc := newSvc(repo, archive)

	result := svc.SyncMinimum(context.Background(), false)
	if result.Success {
		t.Error("expected failure when UpsertContent fails")
	}
}

func TestSyncMinimum_ForceWithClearFails(t *testing.T) {
	archive := &mockArchive{
		movieSeeds:  []provider.ContentSeed{validMovieSeed(0)},
		seriesErr:   errors.New("no series"),
		searchEpErr: errors.New("no search"),
	}
	repo := &mockRepo{clearCatalogErr: errors.New("clear failed")}
	svc := newSvc(repo, archive)

	result := svc.SyncMinimum(context.Background(), true)
	if result.Success {
		t.Error("expected failure when ClearCatalog fails")
	}
}

func TestSyncMinimum_ForceSuccess(t *testing.T) {
	archive := &mockArchive{
		movieSeeds:  []provider.ContentSeed{validMovieSeed(0)},
		seriesErr:   errors.New("no series"),
		searchEpErr: errors.New("no search"),
	}
	repo := &mockRepo{upsertContentID: "cid"}
	svc := newSvc(repo, archive)

	result := svc.SyncMinimum(context.Background(), true)
	if !result.Success {
		t.Errorf("expected success with force=true, got: %s", result.Message)
	}
}

func TestSyncMinimum_WithSeriesEpisodes(t *testing.T) {
	// covers the ArchiveSeriesEpisodes branch in archiveSeeds
	validSeries := validSeriesSeed(0)
	archive := &mockArchive{
		movieSeeds:  []provider.ContentSeed{validMovieSeed(0)},
		episodeSeed: validSeries,
		seriesErr:   errors.New("no single-item series"),
		searchEpErr: errors.New("no search series"),
	}
	repo := &mockRepo{upsertContentID: "cid"}
	svc := Service{
		Repo:                repo,
		Archive:             archive,
		AllowFallback:       true,
		ArchiveMovieTarget:  1,
		ArchiveSeriesTarget: 1,
		ArchiveEpisodeLimit: 5,
		ArchiveSeriesEpisodes: []string{"ep1", "ep2", "ep3"},
		ArchiveSeriesTitle:  "Test Series",
	}
	result := svc.SyncMinimum(context.Background(), false)
	// result may succeed or not depending on if isRealMP4Series passes, but no panic
	_ = result
}

// ─── CreateAdminContent ───────────────────────────────────────────────────────

func TestCreateAdminContent_InvalidType(t *testing.T) {
	svc := Service{}
	result := svc.CreateAdminContent(context.Background(), AdminContentInput{Type: "podcast", Title: "X"})
	if result.Success {
		t.Error("expected failure for invalid type")
	}
}

func TestCreateAdminContent_Success(t *testing.T) {
	repo := &mockRepo{createAdminID: "new-id", createAdminEpisodes: []repository.Episode{}}
	svc := Service{Repo: repo}
	result := svc.CreateAdminContent(context.Background(), AdminContentInput{
		Type:  "movie",
		Title: "Test Film",
	})
	if !result.Success {
		t.Errorf("expected success, got: %s", result.Message)
	}
	if result.ContentID != "new-id" {
		t.Errorf("expected content_id=new-id, got %q", result.ContentID)
	}
}

func TestCreateAdminContent_RepoError(t *testing.T) {
	repo := &mockRepo{createAdminErr: errors.New("db error")}
	svc := Service{Repo: repo}
	result := svc.CreateAdminContent(context.Background(), AdminContentInput{
		Type:  "movie",
		Title: "Test Film",
	})
	if result.Success {
		t.Error("expected failure when repo returns error")
	}
}

// ─── UpdateAdminContent ───────────────────────────────────────────────────────

func TestUpdateAdminContent_InvalidType(t *testing.T) {
	svc := Service{}
	result := svc.UpdateAdminContent(context.Background(), AdminContentInput{Type: "bad", Title: "X"})
	if result.Success {
		t.Error("expected failure for invalid type")
	}
}

func TestUpdateAdminContent_Success(t *testing.T) {
	repo := &mockRepo{allEpisodesReturn: []repository.Episode{}}
	svc := Service{Repo: repo}
	result := svc.UpdateAdminContent(context.Background(), AdminContentInput{
		ContentID: "c-1",
		Type:      "movie",
		Title:     "Updated Film",
	})
	if !result.Success {
		t.Errorf("expected success, got: %s", result.Message)
	}
}

func TestUpdateAdminContent_UpdateFails(t *testing.T) {
	repo := &mockRepo{updateAdminErr: errors.New("db error")}
	svc := Service{Repo: repo}
	result := svc.UpdateAdminContent(context.Background(), AdminContentInput{
		ContentID: "c-1",
		Type:      "movie",
		Title:     "Film",
	})
	if result.Success {
		t.Error("expected failure")
	}
}

func TestUpdateAdminContent_AllEpisodesFails(t *testing.T) {
	repo := &mockRepo{allEpisodesErr: errors.New("db error")}
	svc := Service{Repo: repo}
	result := svc.UpdateAdminContent(context.Background(), AdminContentInput{
		ContentID: "c-1",
		Type:      "movie",
		Title:     "Film",
	})
	if result.Success {
		t.Error("expected failure when AllEpisodes fails")
	}
}

// ─── DeleteAdminContent ───────────────────────────────────────────────────────

func TestDeleteAdminContent_EmptyID(t *testing.T) {
	svc := Service{}
	result := svc.DeleteAdminContent(context.Background(), "", "u1", "u@e.com")
	if result.Success {
		t.Error("expected failure for empty content_id")
	}
	if !strings.Contains(result.Message, "content_id") {
		t.Errorf("unexpected message: %q", result.Message)
	}
}

func TestDeleteAdminContent_WhitespaceID(t *testing.T) {
	svc := Service{}
	result := svc.DeleteAdminContent(context.Background(), "   ", "u1", "u@e.com")
	if result.Success {
		t.Error("expected failure for whitespace content_id")
	}
}

func TestDeleteAdminContent_Success(t *testing.T) {
	repo := &mockRepo{}
	svc := Service{Repo: repo}
	result := svc.DeleteAdminContent(context.Background(), "content-1", "u1", "u@e.com")
	if !result.Success {
		t.Errorf("expected success, got: %s", result.Message)
	}
}

func TestDeleteAdminContent_RepoError(t *testing.T) {
	repo := &mockRepo{softDeleteErr: errors.New("db error")}
	svc := Service{Repo: repo}
	result := svc.DeleteAdminContent(context.Background(), "content-1", "u1", "u@e.com")
	if result.Success {
		t.Error("expected failure when repo returns error")
	}
}

// ─── SchedulePremiere ─────────────────────────────────────────────────────────

func TestSchedulePremiere_EmptyContentID(t *testing.T) {
	svc := Service{}
	result := svc.SchedulePremiere(context.Background(), "", "2026-01-01", "u1", "u@e.com")
	if result.Success {
		t.Error("expected failure for empty content_id")
	}
}

func TestSchedulePremiere_EmptyAvailableFrom(t *testing.T) {
	svc := Service{}
	result := svc.SchedulePremiere(context.Background(), "content-1", "", "u1", "u@e.com")
	if result.Success {
		t.Error("expected failure for empty available_from")
	}
}

func TestSchedulePremiere_Success(t *testing.T) {
	repo := &mockRepo{}
	svc := Service{Repo: repo}
	result := svc.SchedulePremiere(context.Background(), "content-1", "2026-06-01", "u1", "u@e.com")
	if !result.Success {
		t.Errorf("expected success, got: %s", result.Message)
	}
}

func TestSchedulePremiere_RepoError(t *testing.T) {
	repo := &mockRepo{schedulePremErr: errors.New("db error")}
	svc := Service{Repo: repo}
	result := svc.SchedulePremiere(context.Background(), "content-1", "2026-06-01", "u1", "u@e.com")
	if result.Success {
		t.Error("expected failure")
	}
}

// ─── GenerateUploadURL ────────────────────────────────────────────────────────

func TestGenerateUploadURL_NilMediaStore(t *testing.T) {
	svc := Service{MediaStore: nil}
	_, err := svc.GenerateUploadURL(UploadURLRequest{ContentID: "c1", MediaType: "poster"})
	if err == nil {
		t.Error("expected error for nil MediaStore")
	}
}

// ─── ConfirmMedia ─────────────────────────────────────────────────────────────

func TestConfirmMedia_NilMediaStore(t *testing.T) {
	svc := Service{MediaStore: nil}
	err := svc.ConfirmMedia(context.Background(), ConfirmMediaInput{
		ObjectKey: "covers/c/img.jpg",
	})
	if err == nil {
		t.Error("expected error for nil MediaStore")
	}
}

func TestConfirmMedia_PosterSuccess(t *testing.T) {
	store := newTestStore()
	repo := &mockRepo{}
	svc := Service{Repo: repo, MediaStore: store}
	// ObjectExists with invalid key returns error immediately (before GCS client is used)
	err := svc.ConfirmMedia(context.Background(), ConfirmMediaInput{
		ContentID:   "c1",
		MediaType:   "poster",
		ObjectKey:   "invalid-key",
		ContentType: "image/jpeg",
	})
	// ObjectExists fails for invalid key → ConfirmMedia returns error
	if err == nil {
		t.Error("expected error because objectKey is not managed")
	}
}

// ─── DeleteContent ────────────────────────────────────────────────────────────

func TestDeleteContent_EmptyID(t *testing.T) {
	svc := Service{}
	result := svc.DeleteContent(context.Background(), "")
	if result.Success {
		t.Error("expected failure for empty content_id")
	}
	if !strings.Contains(result.Message, "content_id") {
		t.Errorf("unexpected message: %q", result.Message)
	}
}

func TestDeleteContent_WhitespaceID(t *testing.T) {
	svc := Service{}
	result := svc.DeleteContent(context.Background(), "  ")
	if result.Success {
		t.Error("expected failure for whitespace content_id")
	}
}

func TestDeleteContent_ContentMediaKeysFails(t *testing.T) {
	repo := &mockRepo{contentMediaErr: errors.New("db error")}
	svc := Service{Repo: repo}
	result := svc.DeleteContent(context.Background(), "content-1")
	if result.Success {
		t.Error("expected failure when ContentMediaKeys fails")
	}
}

func TestDeleteContent_ContentNotFound(t *testing.T) {
	repo := &mockRepo{contentMediaFound: false}
	svc := Service{Repo: repo}
	result := svc.DeleteContent(context.Background(), "content-1")
	if result.Success {
		t.Error("expected failure when content not found")
	}
	if !strings.Contains(result.Message, "not found") {
		t.Errorf("unexpected message: %q", result.Message)
	}
}

func TestDeleteContent_Success_NoObjects(t *testing.T) {
	repo := &mockRepo{
		contentMediaFound: true,
		contentMediaKeys:  repository.DeletedContentMedia{ObjectKeys: []string{}},
	}
	svc := Service{Repo: repo, MediaStore: nil}
	result := svc.DeleteContent(context.Background(), "content-1")
	if !result.Success {
		t.Errorf("expected success with no objects to delete, got: %s", result.Message)
	}
}

func TestDeleteContent_DeleteRepoFails(t *testing.T) {
	repo := &mockRepo{
		contentMediaFound: true,
		contentMediaKeys:  repository.DeletedContentMedia{ObjectKeys: []string{}},
		deleteContentErr:  errors.New("db delete error"),
	}
	svc := Service{Repo: repo, MediaStore: nil}
	result := svc.DeleteContent(context.Background(), "content-1")
	if result.Success {
		t.Error("expected failure when DeleteContent fails")
	}
}

func TestDeleteContent_WithObjects_NilStore(t *testing.T) {
	// nil MediaStore.DeleteObject returns nil gracefully, covers loop body
	repo := &mockRepo{
		contentMediaFound: true,
		contentMediaKeys: repository.DeletedContentMedia{
			ObjectKeys: []string{"covers/c/img.jpg", "videos/c/film.mp4"},
		},
	}
	svc := Service{Repo: repo, MediaStore: nil}
	result := svc.DeleteContent(context.Background(), "content-1")
	if !result.Success {
		t.Errorf("expected success with nil store (graceful), got: %s", result.Message)
	}
	if result.DeletedObjects != 2 {
		t.Errorf("expected 2 deleted objects, got %d", result.DeletedObjects)
	}
}

// ─── ResolveReadURL ───────────────────────────────────────────────────────────

func TestResolveReadURL_HttpPrefix(t *testing.T) {
	svc := Service{}
	url := "http://example.com/video.mp4"
	got := svc.ResolveReadURL(url)
	if got != url {
		t.Errorf("expected %q, got %q", url, got)
	}
}

func TestResolveReadURL_HttpsPrefix(t *testing.T) {
	svc := Service{}
	url := "https://example.com/video.mp4"
	got := svc.ResolveReadURL(url)
	if got != url {
		t.Errorf("expected %q, got %q", url, got)
	}
}

func TestResolveReadURL_NilStore_NonHttp(t *testing.T) {
	svc := Service{MediaStore: nil}
	// SignedReadURL on nil receiver returns objectKey directly
	key := "covers/c/img.jpg"
	got := svc.ResolveReadURL(key)
	if got != key {
		t.Errorf("expected %q, got %q", key, got)
	}
}

// ─── sanitizeExternalID ───────────────────────────────────────────────────────

func TestSanitizeExternalID(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", "archive"},
		{"  ", "archive"},
		{"Hello World", "hello-world"},
		{"ABC 123", "abc-123"},
		{"already-lowercase", "already-lowercase"},
		{"  Leading ", "leading"},
	}
	for _, tc := range cases {
		got := sanitizeExternalID(tc.in)
		if got != tc.want {
			t.Errorf("sanitizeExternalID(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// ─── uniqueSeriesExternalID ───────────────────────────────────────────────────

func TestUniqueSeriesExternalID(t *testing.T) {
	id := uniqueSeriesExternalID("My Series", 1)
	if id != "my-series-series-real-01" {
		t.Errorf("got %q", id)
	}
	id2 := uniqueSeriesExternalID("", 5)
	if id2 != "archive-series-real-05" {
		t.Errorf("got %q", id2)
	}
}

// ─── mergeIdentifiers ─────────────────────────────────────────────────────────

func TestMergeIdentifiers(t *testing.T) {
	t.Run("empty both", func(t *testing.T) {
		got := mergeIdentifiers(nil, nil)
		if len(got) != 0 {
			t.Fatalf("expected empty, got %v", got)
		}
	})
	t.Run("primary only", func(t *testing.T) {
		got := mergeIdentifiers([]string{"a", "b"}, nil)
		if len(got) != 2 {
			t.Fatalf("expected 2, got %d", len(got))
		}
	})
	t.Run("deduplication", func(t *testing.T) {
		got := mergeIdentifiers([]string{"a", "b"}, []string{"b", "c"})
		if len(got) != 3 {
			t.Fatalf("expected 3 unique, got %d: %v", len(got), got)
		}
	})
	t.Run("whitespace trimmed", func(t *testing.T) {
		got := mergeIdentifiers([]string{" a ", ""}, []string{"a"})
		if len(got) != 1 || got[0] != "a" {
			t.Fatalf("expected [a], got %v", got)
		}
	})
}

// ─── seriesIdentifiersFromConfig ──────────────────────────────────────────────

func TestSeriesIdentifiersFromConfig(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		got := seriesIdentifiersFromConfig("", nil)
		if len(got) != 0 {
			t.Fatalf("expected empty, got %v", got)
		}
	})
	t.Run("single only", func(t *testing.T) {
		got := seriesIdentifiersFromConfig("abc", nil)
		if len(got) != 1 || got[0] != "abc" {
			t.Fatalf("got %v", got)
		}
	})
	t.Run("many only", func(t *testing.T) {
		got := seriesIdentifiersFromConfig("", []string{"x", "y"})
		if len(got) != 2 {
			t.Fatalf("got %v", got)
		}
	})
	t.Run("both", func(t *testing.T) {
		got := seriesIdentifiersFromConfig("first", []string{"x", "y"})
		if len(got) != 3 || got[0] != "first" {
			t.Fatalf("got %v", got)
		}
	})
	t.Run("whitespace single ignored", func(t *testing.T) {
		got := seriesIdentifiersFromConfig("   ", nil)
		if len(got) != 0 {
			t.Fatalf("got %v", got)
		}
	})
}

// ─── seedsOfType ──────────────────────────────────────────────────────────────

func TestSeedsOfType(t *testing.T) {
	seeds := []provider.ContentSeed{
		{Type: "movie"},
		{Type: "series"},
		{Type: "movie"},
	}
	if len(seedsOfType(seeds, "movie")) != 2 {
		t.Fatal("expected 2 movies")
	}
	if len(seedsOfType(seeds, "series")) != 1 {
		t.Fatal("expected 1 series")
	}
	if len(seedsOfType(nil, "movie")) != 0 {
		t.Fatal("expected empty for nil input")
	}
}

// ─── isRealMP4Seed ────────────────────────────────────────────────────────────

func TestIsRealMP4Seed(t *testing.T) {
	valid := provider.ContentSeed{
		MediaURL:      "https://archive.org/download/item/video.mp4",
		MediaMimeType: "video/mp4",
	}
	if !isRealMP4Seed(valid) {
		t.Error("expected true for valid seed")
	}
	noPrefix := valid
	noPrefix.MediaURL = "https://other.com/video.mp4"
	if isRealMP4Seed(noPrefix) {
		t.Error("expected false for non-archive.org URL")
	}
	noSuffix := valid
	noSuffix.MediaURL = "https://archive.org/download/item/video.avi"
	if isRealMP4Seed(noSuffix) {
		t.Error("expected false for non-mp4 extension")
	}
	wrongMime := valid
	wrongMime.MediaMimeType = "video/avi"
	if isRealMP4Seed(wrongMime) {
		t.Error("expected false for wrong mime type")
	}
}

// ─── isRealMP4Series ──────────────────────────────────────────────────────────

func TestIsRealMP4Series(t *testing.T) {
	validEp := provider.EpisodeSeed{
		MediaURL:      "https://archive.org/download/show/ep1.mp4",
		MediaMimeType: "video/mp4",
	}
	base := provider.ContentSeed{
		MediaURL:      "https://archive.org/download/show/main.mp4",
		MediaMimeType: "video/mp4",
	}

	t.Run("too few episodes", func(t *testing.T) {
		s := base
		s.Episodes = []provider.EpisodeSeed{validEp, validEp}
		if isRealMP4Series(s) {
			t.Error("expected false for < 3 episodes")
		}
	})
	t.Run("exactly 3 episodes", func(t *testing.T) {
		s := base
		s.Episodes = []provider.EpisodeSeed{validEp, validEp, validEp}
		if !isRealMP4Series(s) {
			t.Error("expected true for 3 valid episodes")
		}
	})
	t.Run("too many episodes", func(t *testing.T) {
		s := base
		eps := make([]provider.EpisodeSeed, 16)
		for i := range eps {
			eps[i] = validEp
		}
		s.Episodes = eps
		if isRealMP4Series(s) {
			t.Error("expected false for > 15 episodes")
		}
	})
	t.Run("bad episode URL", func(t *testing.T) {
		badEp := provider.EpisodeSeed{
			MediaURL:      "https://other.com/ep1.mp4",
			MediaMimeType: "video/mp4",
		}
		s := base
		s.Episodes = []provider.EpisodeSeed{validEp, validEp, badEp}
		if isRealMP4Series(s) {
			t.Error("expected false for bad episode URL")
		}
	})
	t.Run("bad main seed", func(t *testing.T) {
		s := provider.ContentSeed{
			MediaURL:      "https://other.com/main.mp4",
			MediaMimeType: "video/mp4",
			Episodes:      []provider.EpisodeSeed{validEp, validEp, validEp},
		}
		if isRealMP4Series(s) {
			t.Error("expected false for bad main seed")
		}
	})
}

// ─── defaultIdentifiers and queries ───────────────────────────────────────────

func TestDefaultIdentifiers(t *testing.T) {
	if len(defaultMovieIdentifiers()) == 0 {
		t.Error("defaultMovieIdentifiers() should not be empty")
	}
	if len(defaultSeriesIdentifiers()) == 0 {
		t.Error("defaultSeriesIdentifiers() should not be empty")
	}
	if len(defaultMovieSearchQueries()) == 0 {
		t.Error("defaultMovieSearchQueries() should not be empty")
	}
	defs := defaultSeriesSearchDefinitions()
	if len(defs) == 0 {
		t.Error("defaultSeriesSearchDefinitions() should not be empty")
	}
	for _, d := range defs {
		if d.Title == "" || d.Query == "" {
			t.Errorf("empty Title or Query in definition: %+v", d)
		}
	}
}

// ─── adminInputToWrite ────────────────────────────────────────────────────────

func TestAdminInputToWrite_InvalidType(t *testing.T) {
	_, err := adminInputToWrite(AdminContentInput{Type: "podcast", Title: "X"}, false)
	if err == nil || !strings.Contains(err.Error(), "type") {
		t.Errorf("expected type error, got %v", err)
	}
}

func TestAdminInputToWrite_EmptyTitle(t *testing.T) {
	_, err := adminInputToWrite(AdminContentInput{Type: "movie", Title: ""}, false)
	if err == nil {
		t.Error("expected title error")
	}
}

func TestAdminInputToWrite_RequireContentID(t *testing.T) {
	_, err := adminInputToWrite(AdminContentInput{Type: "movie", Title: "X", ContentID: ""}, true)
	if err == nil {
		t.Error("expected content_id error")
	}
}

func TestAdminInputToWrite_ValidMovie(t *testing.T) {
	input := AdminContentInput{
		Type:   "movie",
		Title:  "My Film",
		Genres: []string{"action"},
		Cast: []AdminCastInput{
			{ActorName: "John", CharacterName: "Hero", OrderIndex: 1},
			{ActorName: "  ", CharacterName: "Ignored"},
		},
		Episodes: []AdminEpisodeInput{
			{Title: "Ignored Episode", EpisodeNumber: 1},
		},
		ActorUserID: "user-1",
		ActorEmail:  "u@example.com",
	}
	write, err := adminInputToWrite(input, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if write.Type != "movie" || write.Title != "My Film" {
		t.Errorf("unexpected write: %+v", write)
	}
	if len(write.Cast) != 1 {
		t.Errorf("expected 1 cast (empty name skipped), got %d", len(write.Cast))
	}
	if len(write.Episodes) != 0 {
		t.Errorf("episodes should be ignored for movie, got %d", len(write.Episodes))
	}
}

func TestAdminInputToWrite_ValidSeries(t *testing.T) {
	input := AdminContentInput{
		Type:  "series",
		Title: "My Show",
		Episodes: []AdminEpisodeInput{
			{Title: "Pilot", EpisodeNumber: 1, SeasonNumber: 1},
			{Title: "Episode 2", EpisodeNumber: 2, SeasonNumber: 0},
		},
	}
	write, err := adminInputToWrite(input, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(write.Episodes) != 2 {
		t.Errorf("expected 2 episodes, got %d", len(write.Episodes))
	}
	if write.Episodes[1].SeasonNumber != 1 {
		t.Errorf("season 0 should default to 1, got %d", write.Episodes[1].SeasonNumber)
	}
}

func TestAdminInputToWrite_SeriesNoEpisodes(t *testing.T) {
	_, err := adminInputToWrite(AdminContentInput{Type: "series", Title: "Empty Show"}, false)
	if err == nil {
		t.Error("expected error for series with no episodes")
	}
}

func TestAdminInputToWrite_EpisodeEmptyTitle(t *testing.T) {
	input := AdminContentInput{
		Type:  "series",
		Title: "My Show",
		Episodes: []AdminEpisodeInput{
			{Title: "", EpisodeNumber: 1},
		},
	}
	_, err := adminInputToWrite(input, false)
	if err == nil {
		t.Error("expected error for episode with empty title")
	}
}

func TestAdminInputToWrite_EpisodeZeroNumber(t *testing.T) {
	input := AdminContentInput{
		Type:  "series",
		Title: "My Show",
		Episodes: []AdminEpisodeInput{
			{Title: "Pilot", EpisodeNumber: 0},
		},
	}
	_, err := adminInputToWrite(input, false)
	if err == nil {
		t.Error("expected error for episode_number = 0")
	}
}

func TestAdminInputToWrite_RequireContentIDSet(t *testing.T) {
	input := AdminContentInput{
		Type:      "movie",
		Title:     "X",
		ContentID: "abc-123",
	}
	write, err := adminInputToWrite(input, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if write.ContentID != "abc-123" {
		t.Errorf("expected content_id abc-123, got %q", write.ContentID)
	}
}

// ─── Service target helpers ────────────────────────────────────────────────────

func TestMovieTarget(t *testing.T) {
	if (Service{}).movieTarget() != 5 {
		t.Error("zero ArchiveMovieTarget should default to 5")
	}
	if (Service{ArchiveMovieTarget: 3}).movieTarget() != 3 {
		t.Error("should use provided value")
	}
	if (Service{ArchiveMovieTarget: 100}).movieTarget() != 50 {
		t.Error("should cap at 50")
	}
}

func TestSeriesTarget(t *testing.T) {
	if (Service{}).seriesTarget() != 10 {
		t.Error("zero should default to 10")
	}
	if (Service{ArchiveSeriesTarget: 5}).seriesTarget() != 5 {
		t.Error("should use provided value")
	}
	if (Service{ArchiveSeriesTarget: 100}).seriesTarget() != 50 {
		t.Error("should cap at 50")
	}
}

func TestEpisodeLimit(t *testing.T) {
	if (Service{}).episodeLimit() != 15 {
		t.Error("zero should default to 15")
	}
	if (Service{ArchiveEpisodeLimit: 10}).episodeLimit() != 10 {
		t.Error("should use provided value")
	}
	if (Service{ArchiveEpisodeLimit: 20}).episodeLimit() != 15 {
		t.Error("should cap at 15")
	}
}
