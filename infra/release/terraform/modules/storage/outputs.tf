output "bucket_name" {
  description = "Nombre del bucket."
  value       = google_storage_bucket.this.name
}
