output "cluster_name" {
  description = "Nombre del cluster GKE."
  value       = google_container_cluster.this.name
}

output "location" {
  description = "Region del cluster GKE."
  value       = google_container_cluster.this.location
}

output "subnetwork_name" {
  description = "Nombre de la subred GKE."
  value       = google_compute_subnetwork.gke.name
}
