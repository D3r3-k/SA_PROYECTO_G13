output "instance_name" {
  description = "Nombre de la instancia Cloud SQL."
  value       = google_sql_database_instance.this.name
}

output "private_ip_address" {
  description = "IP privada de Cloud SQL."
  value       = google_sql_database_instance.this.private_ip_address
}
