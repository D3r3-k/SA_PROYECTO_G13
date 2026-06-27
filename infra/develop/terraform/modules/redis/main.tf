resource "google_redis_instance" "this" {
  name               = var.name
  region             = var.region
  tier               = "BASIC"
  memory_size_gb     = var.memory_size_gb
  redis_version      = var.redis_version
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  authorized_network = var.network_id
}
