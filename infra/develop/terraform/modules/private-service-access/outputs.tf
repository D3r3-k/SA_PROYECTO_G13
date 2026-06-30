output "connection_id" {
  description = "ID de la conexion Private Service Access."
  value       = google_service_networking_connection.this.id
}
