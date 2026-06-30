output "instance_name" {
  description = "Nombre de la instancia Cloud SQL."
  value       = google_sql_database_instance.this.name
}

output "private_ip_address" {
  description = "IP privada de Cloud SQL."
  value       = google_sql_database_instance.this.private_ip_address
}

output "service_account_email" {
  description = "Email de la service account asociada a la instancia Cloud SQL."
  value       = google_sql_database_instance.this.service_account_email_address
}
