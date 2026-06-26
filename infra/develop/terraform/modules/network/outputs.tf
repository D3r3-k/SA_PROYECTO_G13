output "network_name" {
  description = "Nombre de la VPC."
  value       = google_compute_network.this.name
}

output "network_id" {
  description = "ID de la VPC."
  value       = google_compute_network.this.id
}

output "network_self_link" {
  description = "Self link de la VPC."
  value       = google_compute_network.this.self_link
}

output "public_subnet_self_link" {
  description = "Self link de la subred publica."
  value       = google_compute_subnetwork.public.self_link
}

output "private_subnet_self_link" {
  description = "Self link de la subred privada."
  value       = google_compute_subnetwork.private.self_link
}
