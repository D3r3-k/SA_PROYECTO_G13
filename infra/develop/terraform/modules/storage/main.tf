resource "google_storage_bucket" "this" {
  name                        = var.bucket_name
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.labels

  cors {
    origin          = var.cors_origins
    method          = ["GET", "PUT", "HEAD", "OPTIONS"]
    response_header = ["Content-Type", "Content-Length", "x-goog-content-length-range"]
    max_age_seconds = 3600
  }
}

resource "google_storage_bucket_iam_member" "media_object_admin" {
  bucket = google_storage_bucket.this.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.media_service_account_email}"
}
