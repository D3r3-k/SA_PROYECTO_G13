output "name" {
  description = "Nombre de la IP estatica global."
  value       = google_compute_global_address.this.name
}

output "address" {
  description = "Direccion IP estatica global."
  value       = google_compute_global_address.this.address
}
