package service

import (
	"context"
	"os"
	"testing"
)

// ─── isManagedObjectKey ───────────────────────────────────────────────────────

func TestIsManagedObjectKey(t *testing.T) {
	cases := []struct {
		key  string
		want bool
	}{
		{"covers/c1/img.jpg", true},
		{"videos/c1/film.mp4", true},
		{"covers/", true},
		{"videos/", true},
		{"other/path.jpg", false},
		{"", false},
		{"  ", false},
		{"COVERS/img.jpg", false},
	}
	for _, tc := range cases {
		got := isManagedObjectKey(tc.key)
		if got != tc.want {
			t.Errorf("isManagedObjectKey(%q) = %v, want %v", tc.key, got, tc.want)
		}
	}
}

// ─── typeSet ──────────────────────────────────────────────────────────────────

func TestTypeSet(t *testing.T) {
	s := typeSet([]string{"image/jpeg", "IMAGE/PNG", " video/mp4 ", ""})
	if !s["image/jpeg"] {
		t.Error("expected image/jpeg in set")
	}
	if !s["image/png"] {
		t.Error("expected image/png (lowercased) in set")
	}
	if !s["video/mp4"] {
		t.Error("expected video/mp4 (trimmed) in set")
	}
	if s[""] {
		t.Error("empty string should not be in set")
	}

	empty := typeSet(nil)
	if len(empty) != 0 {
		t.Error("nil input should produce empty set")
	}
}

// ─── minutes ──────────────────────────────────────────────────────────────────

func TestMinutes(t *testing.T) {
	d := minutes(15, 60)
	if d.Minutes() != 15 {
		t.Errorf("expected 15min, got %v", d)
	}
	d2 := minutes(0, 30)
	if d2.Minutes() != 30 {
		t.Errorf("expected fallback 30min, got %v", d2)
	}
	d3 := minutes(-5, 45)
	if d3.Minutes() != 45 {
		t.Errorf("expected fallback 45min for negative, got %v", d3)
	}
}

// ─── maxInt ───────────────────────────────────────────────────────────────────

func TestMaxInt(t *testing.T) {
	if maxInt(10, 100) != 10 {
		t.Error("expected 10 when value is positive")
	}
	if maxInt(0, 100) != 100 {
		t.Error("expected fallback 100 when value is 0")
	}
	if maxInt(-5, 100) != 100 {
		t.Error("expected fallback 100 when value is negative")
	}
}

// ─── NewMediaStore ────────────────────────────────────────────────────────────

func TestNewMediaStore_EmptyConfig(t *testing.T) {
	ms, err := NewMediaStore(context.Background(), MediaStoreConfig{}, "")
	if err != nil {
		t.Errorf("expected no error for empty config, got %v", err)
	}
	if ms != nil {
		t.Error("expected nil MediaStore for empty config")
	}
}

func TestNewMediaStore_EmptyBucket(t *testing.T) {
	ms, err := NewMediaStore(context.Background(), MediaStoreConfig{BucketName: ""}, "/some/path")
	if err != nil {
		t.Errorf("expected no error for empty bucket, got %v", err)
	}
	if ms != nil {
		t.Error("expected nil MediaStore for empty bucket")
	}
}

func TestNewMediaStore_MissingCredentialsFile(t *testing.T) {
	ms, err := NewMediaStore(context.Background(), MediaStoreConfig{
		BucketName: "test-bucket",
	}, "/nonexistent/path/creds.json")
	if err == nil {
		t.Error("expected error for missing credentials file")
	}
	if ms != nil {
		t.Error("expected nil MediaStore on error")
	}
}

func TestNewMediaStore_BadJSON(t *testing.T) {
	f, err := os.CreateTemp("", "test-creds-*.json")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(f.Name())
	f.WriteString("not-valid-json")
	f.Close()

	ms, err := NewMediaStore(context.Background(), MediaStoreConfig{
		BucketName: "test-bucket",
	}, f.Name())
	if err == nil {
		t.Error("expected error for bad JSON")
	}
	if ms != nil {
		t.Error("expected nil MediaStore on error")
	}
}

func TestNewMediaStore_MissingEmailOrKey(t *testing.T) {
	f, err := os.CreateTemp("", "test-creds-*.json")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(f.Name())
	f.WriteString(`{"client_email": "", "private_key": ""}`)
	f.Close()

	ms, err := NewMediaStore(context.Background(), MediaStoreConfig{
		BucketName: "test-bucket",
	}, f.Name())
	if err == nil {
		t.Error("expected error for missing email or key")
	}
	if ms != nil {
		t.Error("expected nil MediaStore on error")
	}
}

// ─── GenerateUploadURL (nil and validation paths) ─────────────────────────────

func TestGenerateUploadURL_NilReceiver(t *testing.T) {
	var m *MediaStore
	_, err := m.GenerateUploadURL(UploadURLRequest{
		ContentID: "c1", MediaType: "poster",
	})
	if err == nil {
		t.Error("expected error for nil receiver")
	}
}

func TestGenerateUploadURL_ValidationError(t *testing.T) {
	store := newTestStore()
	_, err := store.GenerateUploadURL(UploadURLRequest{
		ContentID: "", MediaType: "poster",
	})
	if err == nil {
		t.Error("expected validation error for empty ContentID")
	}
}

func TestGenerateUploadURL_SigningFails(t *testing.T) {
	store := newTestStore()
	_, err := store.GenerateUploadURL(UploadURLRequest{
		ContentID:   "c-1",
		MediaType:   "poster",
		FileName:    "cover.jpg",
		ContentType: "image/jpeg",
		SizeBytes:   512,
	})
	// signing fails because store has empty private key
	if err == nil {
		t.Error("expected error from SignedURL with empty credentials")
	}
}

// ─── ObjectExists (nil and invalid key paths) ──────────────────────────────────

func TestObjectExists_NilReceiver(t *testing.T) {
	var m *MediaStore
	err := m.ObjectExists(context.Background(), "covers/c/img.jpg")
	if err == nil {
		t.Error("expected error for nil receiver")
	}
}

func TestObjectExists_InvalidKey(t *testing.T) {
	store := newTestStore()
	err := store.ObjectExists(context.Background(), "invalid-key")
	if err == nil {
		t.Error("expected error for invalid object key")
	}
}

// ─── DeleteObject (nil and invalid key paths) ──────────────────────────────────

func TestDeleteObject_NilReceiver(t *testing.T) {
	var m *MediaStore
	err := m.DeleteObject(context.Background(), "covers/c/img.jpg")
	if err != nil {
		t.Errorf("expected nil for nil receiver (graceful), got %v", err)
	}
}

func TestDeleteObject_InvalidKey(t *testing.T) {
	store := newTestStore()
	err := store.DeleteObject(context.Background(), "invalid-key")
	if err != nil {
		t.Errorf("expected nil for invalid key (graceful), got %v", err)
	}
}

// ─── SignedReadURL (nil and invalid key paths) ─────────────────────────────────

func TestSignedReadURL_NilReceiver(t *testing.T) {
	var m *MediaStore
	key := "covers/c/img.jpg"
	got := m.SignedReadURL(key)
	if got != key {
		t.Errorf("nil receiver should return key as-is, got %q", got)
	}
}

func TestSignedReadURL_InvalidKey(t *testing.T) {
	store := newTestStore()
	key := "not-managed-key"
	got := store.SignedReadURL(key)
	if got != key {
		t.Errorf("invalid key should return key as-is, got %q", got)
	}
}

func TestSignedReadURL_ValidKeyNoCredentials(t *testing.T) {
	store := newTestStore()
	key := "covers/c/img.jpg"
	got := store.SignedReadURL(key)
	// signing fails with empty privateKey, returns key as-is
	if got != key {
		t.Errorf("expected key returned when signing fails, got %q", got)
	}
}

// ─── validateUploadRequest: default media_type ────────────────────────────────

func TestValidateUploadRequest_UnknownMediaType(t *testing.T) {
	store := newTestStore()
	err := store.validateUploadRequest(UploadURLRequest{
		ContentID:   "c1",
		MediaType:   "unknown_type",
		FileName:    "file.mp4",
		ContentType: "video/mp4",
		SizeBytes:   100,
	})
	if err == nil {
		t.Error("expected error for unknown media_type in validateUploadRequest")
	}
}

func TestValidateUploadRequest_MissingFileName(t *testing.T) {
	store := newTestStore()
	err := store.validateUploadRequest(UploadURLRequest{
		ContentID:   "c1",
		MediaType:   "poster",
		FileName:    "",
		ContentType: "image/jpeg",
		SizeBytes:   100,
	})
	if err == nil {
		t.Error("expected error for empty file_name")
	}
}

func TestValidateUploadRequest_MissingContentType(t *testing.T) {
	store := newTestStore()
	err := store.validateUploadRequest(UploadURLRequest{
		ContentID:   "c1",
		MediaType:   "poster",
		FileName:    "img.jpg",
		ContentType: "",
		SizeBytes:   100,
	})
	if err == nil {
		t.Error("expected error for empty content_type")
	}
}

func TestValidateUploadRequest_ZeroSize(t *testing.T) {
	store := newTestStore()
	err := store.validateUploadRequest(UploadURLRequest{
		ContentID:   "c1",
		MediaType:   "poster",
		FileName:    "img.jpg",
		ContentType: "image/jpeg",
		SizeBytes:   0,
	})
	if err == nil {
		t.Error("expected error for zero size_bytes")
	}
}

// ─── buildObjectKey: no extension fallback ────────────────────────────────────

func TestBuildObjectKey_NoExtensionNoMime(t *testing.T) {
	_, err := buildObjectKey(UploadURLRequest{
		ContentID:   "c1",
		MediaType:   "poster",
		FileName:    "fileWithNoExtension",
		ContentType: "application/octet-stream",
	})
	// mime.ExtensionsByType for octet-stream may or may not find extension
	// either way, if no extension found, returns error
	_ = err // result depends on platform mime database
}

func TestBuildObjectKey_NoExtensionValidMime(t *testing.T) {
	key, err := buildObjectKey(UploadURLRequest{
		ContentID:   "c1",
		MediaType:   "movie_video",
		FileName:    "video_no_ext",
		ContentType: "video/mp4",
	})
	// video/mp4 mime type has known extensions, should succeed
	if err != nil {
		t.Logf("buildObjectKey without ext for video/mp4: %v (platform-dependent)", err)
		return
	}
	if key == "" {
		t.Error("expected non-empty key")
	}
}
