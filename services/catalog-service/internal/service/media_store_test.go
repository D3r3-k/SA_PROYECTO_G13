package service

import "testing"

func TestBuildObjectKey(t *testing.T) {
	tests := []struct {
		name     string
		req      UploadURLRequest
		expected string
	}{
		{
			name: "poster key",
			req: UploadURLRequest{
				ContentID:   "content-1",
				MediaType:   "poster",
				FileName:    "cover.jpg",
				ContentType: "image/jpeg",
			},
			expected: "covers/content-1/",
		},
		{
			name: "movie video key",
			req: UploadURLRequest{
				ContentID:   "content-1",
				MediaType:   "movie_video",
				FileName:    "movie.mp4",
				ContentType: "video/mp4",
			},
			expected: "videos/content-1/",
		},
		{
			name: "episode video key",
			req: UploadURLRequest{
				ContentID:   "content-1",
				EpisodeID:   "episode-1",
				MediaType:   "episode_video",
				FileName:    "episode.webm",
				ContentType: "video/webm",
			},
			expected: "videos/content-1/episodes/episode-1/",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, err := buildObjectKey(tt.req)
			if err != nil {
				t.Fatalf("buildObjectKey() error = %v", err)
			}
			if len(key) <= len(tt.expected) || key[:len(tt.expected)] != tt.expected {
				t.Fatalf("buildObjectKey() = %q, want prefix %q", key, tt.expected)
			}
		})
	}
}

func TestValidateUploadRequest(t *testing.T) {
	store := &MediaStore{
		imageTypes:   map[string]bool{"image/jpeg": true},
		videoTypes:   map[string]bool{"video/mp4": true},
		maxImageByte: 10 * 1024 * 1024,
		maxVideoByte: 1024 * 1024 * 1024,
	}

	valid := UploadURLRequest{
		ContentID:   "content-1",
		MediaType:   "poster",
		FileName:    "cover.jpg",
		ContentType: "image/jpeg",
		SizeBytes:   1024,
	}
	if err := store.validateUploadRequest(valid); err != nil {
		t.Fatalf("validateUploadRequest() error = %v", err)
	}

	invalidType := valid
	invalidType.ContentType = "image/gif"
	if err := store.validateUploadRequest(invalidType); err == nil {
		t.Fatal("validateUploadRequest() expected invalid image content type")
	}

	oversized := valid
	oversized.SizeBytes = store.maxImageByte + 1
	if err := store.validateUploadRequest(oversized); err == nil {
		t.Fatal("validateUploadRequest() expected image size error")
	}

	episode := UploadURLRequest{
		ContentID:   "content-1",
		MediaType:   "episode_video",
		FileName:    "episode.mp4",
		ContentType: "video/mp4",
		SizeBytes:   1024,
	}
	if err := store.validateUploadRequest(episode); err == nil {
		t.Fatal("validateUploadRequest() expected missing episode_id")
	}
}
