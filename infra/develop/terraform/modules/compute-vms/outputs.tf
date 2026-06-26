output "frontend_public_ip" {
  description = "IP publica del frontend."
  value       = google_compute_instance.this["frontend"].network_interface[0].access_config[0].nat_ip
}

output "gateway_private_ip" {
  description = "IP privada del gateway."
  value       = google_compute_instance.this["gateway"].network_interface[0].network_ip
}

output "services_private_ip" {
  description = "IP privada de la VM de servicios."
  value       = google_compute_instance.this["services"].network_interface[0].network_ip
}
