output "cloud_sql_private_ip" {
  description = "IP privada de Cloud SQL."
  value       = module.cloud_sql.private_ip_address
}

output "redis_host" {
  description = "Host privado de Redis."
  value       = module.redis.host
}

output "redis_port" {
  description = "Puerto de Redis."
  value       = module.redis.port
}

output "bucket_name" {
  description = "Bucket multimedia de produccion."
  value       = module.storage.bucket_name
}

output "gke_cluster_name" {
  description = "Nombre del cluster GKE."
  value       = module.gke.cluster_name
}

output "gke_location" {
  description = "Region del cluster GKE."
  value       = module.gke.location
}

output "gke_namespace" {
  description = "Namespace esperado por los manifests."
  value       = "quetxal-tv-prod"
}

output "ingress_ip_name" {
  description = "Nombre de la IP estatica global del Ingress."
  value       = module.ingress_ip.name
}

output "ingress_ip_address" {
  description = "Direccion IP estatica global del Ingress."
  value       = module.ingress_ip.address
}

output "cicd_service_account_email" {
  description = "Service Account para GitHub Actions release."
  value       = module.service_accounts.cicd_service_account_email
}

output "media_service_account_email" {
  description = "Service Account para firmar URLs de Catalog."
  value       = module.service_accounts.media_service_account_email
}

