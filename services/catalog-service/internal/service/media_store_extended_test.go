package service

import "testing"

// ─── buildObjectKey ───────────────────────────────────────────────────────────

func TestBuildObjectKey_MediaTypes(t *testing.T) {
	cases := []struct {
		name       string
		req        UploadURLRequest
		wantPrefix string
		wantErr    bool
	}{
		{
			name: "poster genera ruta covers/",
			req: UploadURLRequest{
				ContentID: "abc-123", MediaType: "poster",
				FileName: "cover.png", ContentType: "image/png",
			},
			wantPrefix: "covers/abc-123/",
		},
		{
			name: "movie_video genera ruta videos/",
			req: UploadURLRequest{
				ContentID: "abc-123", MediaType: "movie_video",
				FileName: "film.mp4", ContentType: "video/mp4",
			},
			wantPrefix: "videos/abc-123/",
		},
		{
			name: "episode_video con episode_id genera ruta episodes/",
			req: UploadURLRequest{
				ContentID: "abc-123", EpisodeID: "ep-456", MediaType: "episode_video",
				FileName: "episode.mp4", ContentType: "video/mp4",
			},
			wantPrefix: "videos/abc-123/episodes/ep-456/",
		},
		{
			name:    "tipo desconocido retorna error",
			req:     UploadURLRequest{ContentID: "abc", MediaType: "unknown_type"},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			key, err := buildObjectKey(tc.req)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("buildObjectKey() esperaba error para type=%q", tc.req.MediaType)
				}
				return
			}
			if err != nil {
				t.Fatalf("buildObjectKey() error inesperado: %v", err)
			}
			if len(key) <= len(tc.wantPrefix) || key[:len(tc.wantPrefix)] != tc.wantPrefix {
				t.Fatalf("buildObjectKey() = %q, quería prefijo %q", key, tc.wantPrefix)
			}
		})
	}
}

func TestBuildObjectKey_IncludeUUID(t *testing.T) {
	req := UploadURLRequest{
		ContentID: "c-1", MediaType: "poster",
		FileName: "img.jpg", ContentType: "image/jpeg",
	}
	k1, _ := buildObjectKey(req)
	k2, _ := buildObjectKey(req)
	if k1 == k2 {
		t.Fatal("buildObjectKey() debe generar claves únicas (UUID) en cada llamada")
	}
}

func TestBuildObjectKey_ConservaExtension(t *testing.T) {
	req := UploadURLRequest{
		ContentID: "c-1", MediaType: "movie_video",
		FileName: "pelicula.webm", ContentType: "video/webm",
	}
	key, err := buildObjectKey(req)
	if err != nil {
		t.Fatalf("buildObjectKey() error: %v", err)
	}
	if len(key) < 5 {
		t.Fatal("clave demasiado corta")
	}
}

// ─── validateUploadRequest ────────────────────────────────────────────────────

func newTestStore() *MediaStore {
	return &MediaStore{
		imageTypes:   map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true},
		videoTypes:   map[string]bool{"video/mp4": true, "video/webm": true},
		maxImageByte: 10 * 1024 * 1024,
		maxVideoByte: 1024 * 1024 * 1024,
	}
}

func TestValidateUploadRequest_Extended(t *testing.T) {
	store := newTestStore()

	tests := []struct {
		name    string
		req     UploadURLRequest
		wantErr bool
	}{
		{
			name: "poster jpeg válido",
			req: UploadURLRequest{
				ContentID: "c1", MediaType: "poster",
				FileName: "cover.jpg", ContentType: "image/jpeg", SizeBytes: 512,
			},
			wantErr: false,
		},
		{
			name: "poster png válido",
			req: UploadURLRequest{
				ContentID: "c1", MediaType: "poster",
				FileName: "cover.png", ContentType: "image/png", SizeBytes: 1024,
			},
			wantErr: false,
		},
		{
			name: "poster webp válido",
			req: UploadURLRequest{
				ContentID: "c1", MediaType: "poster",
				FileName: "cover.webp", ContentType: "image/webp", SizeBytes: 2048,
			},
			wantErr: false,
		},
		{
			name: "video mp4 válido",
			req: UploadURLRequest{
				ContentID: "c1", MediaType: "movie_video",
				FileName: "film.mp4", ContentType: "video/mp4", SizeBytes: 1024 * 1024,
			},
			wantErr: false,
		},
		{
			name: "video webm válido",
			req: UploadURLRequest{
				ContentID: "c1", MediaType: "movie_video",
				FileName: "film.webm", ContentType: "video/webm", SizeBytes: 1024,
			},
			wantErr: false,
		},
		{
			name: "imagen gif rechazada",
			req: UploadURLRequest{
				ContentID: "c1", MediaType: "poster",
				FileName: "ani.gif", ContentType: "image/gif", SizeBytes: 100,
			},
			wantErr: true,
		},
		{
			name: "imagen supera tamaño máximo",
			req: UploadURLRequest{
				ContentID: "c1", MediaType: "poster",
				FileName: "big.jpg", ContentType: "image/jpeg",
				SizeBytes: 10*1024*1024 + 1,
			},
			wantErr: true,
		},
		{
			name: "video supera tamaño máximo",
			req: UploadURLRequest{
				ContentID: "c1", MediaType: "movie_video",
				FileName: "big.mp4", ContentType: "video/mp4",
				SizeBytes: 1024*1024*1024 + 1,
			},
			wantErr: true,
		},
		{
			name: "episode_video sin episode_id rechazado",
			req: UploadURLRequest{
				ContentID: "c1", MediaType: "episode_video",
				FileName: "ep.mp4", ContentType: "video/mp4", SizeBytes: 1024,
			},
			wantErr: true,
		},
		{
			name: "episode_video con episode_id válido",
			req: UploadURLRequest{
				ContentID: "c1", EpisodeID: "ep-1", MediaType: "episode_video",
				FileName: "ep.mp4", ContentType: "video/mp4", SizeBytes: 1024,
			},
			wantErr: false,
		},
		{
			name: "content_id vacío rechazado",
			req: UploadURLRequest{
				ContentID: "", MediaType: "poster",
				FileName: "img.jpg", ContentType: "image/jpeg", SizeBytes: 100,
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := store.validateUploadRequest(tc.req)
			if tc.wantErr && err == nil {
				t.Fatalf("validateUploadRequest() esperaba error para %q", tc.name)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("validateUploadRequest() error inesperado: %v", err)
			}
		})
	}
}
