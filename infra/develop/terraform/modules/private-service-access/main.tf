resource "google_compute_global_address" "db" {
  name          = var.db_range_name
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.range_prefix_length
  network       = var.network_id
}

resource "google_compute_global_address" "redis" {
  name          = var.redis_range_name
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.range_prefix_length
  network       = var.network_id
}

resource "google_service_networking_connection" "this" {
  network = var.network_self_link
  service = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [
    google_compute_global_address.db.name,
    google_compute_global_address.redis.name
  ]
}
