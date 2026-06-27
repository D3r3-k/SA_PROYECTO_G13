output "frontend_public_ip" {
  description = "IP publica de la VM frontend."
  value       = module.compute_vms.frontend_public_ip
}

output "gateway_private_ip" {
  description = "IP privada de la VM gateway."
  value       = module.compute_vms.gateway_private_ip
}

output "services_private_ip" {
  description = "IP privada de la VM de servicios."
  value       = module.compute_vms.services_private_ip
}

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
  description = "Bucket multimedia de desarrollo."
  value       = module.storage.bucket_name
}

output "cicd_service_account_email" {
  description = "Service Account para GitHub Actions develop."
  value       = module.service_accounts.cicd_service_account_email
}

output "media_service_account_email" {
  description = "Service Account para firmar URLs de Catalog."
  value       = module.service_accounts.media_service_account_email
}
