output "cicd_service_account_email" {
  description = "Email del Service Account de CI/CD."
  value       = google_service_account.cicd.email
}

output "media_service_account_email" {
  description = "Email del Service Account de Catalog/GCS."
  value       = google_service_account.media.email
}
