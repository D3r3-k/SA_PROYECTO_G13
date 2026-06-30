resource "google_compute_subnetwork" "gke" {
  name                     = var.subnetwork_name
  ip_cidr_range            = var.subnetwork_cidr
  region                   = var.region
  network                  = var.network_id
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = var.pods_range_name
    ip_cidr_range = var.pods_range_cidr
  }

  secondary_ip_range {
    range_name    = var.services_range_name
    ip_cidr_range = var.services_range_cidr
  }
}

resource "google_container_cluster" "this" {
  project        = var.project_id
  name           = var.cluster_name
  location       = var.region
  node_locations = var.node_locations

  network    = var.network_id
  subnetwork = google_compute_subnetwork.gke.self_link

  remove_default_node_pool = true
  initial_node_count       = 1
  deletion_protection      = false

  networking_mode = "VPC_NATIVE"

  ip_allocation_policy {
    cluster_secondary_range_name  = var.pods_range_name
    services_secondary_range_name = var.services_range_name
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = var.master_ipv4_cidr_block
  }

  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.master_authorized_cidr_blocks
      content {
        cidr_block   = cidr_blocks.value.cidr_block
        display_name = cidr_blocks.value.display_name
      }
    }
  }

  node_config {
    disk_size_gb = 20
    disk_type    = "pd-standard"
  }

  lifecycle {
    ignore_changes = [
      node_config,
      node_pool,
      initial_node_count
    ]
  }
}

resource "google_container_node_pool" "primary" {
  project        = var.project_id
  name           = "${var.cluster_name}-pool"
  location       = var.region
  cluster        = google_container_cluster.this.name
  node_locations = var.node_locations

  initial_node_count = var.initial_node_count

  autoscaling {
    min_node_count = var.min_node_count
    max_node_count = var.max_node_count
  }

  node_config {
    machine_type = var.node_machine_type
    disk_size_gb = 30
    disk_type    = "pd-standard"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
  }
}
