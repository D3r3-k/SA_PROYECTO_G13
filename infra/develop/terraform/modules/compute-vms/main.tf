resource "google_compute_instance" "this" {
  for_each = var.instances

  project      = var.project_id
  name         = each.value.name
  zone         = var.zone
  machine_type = each.value.machine_type
  tags         = each.value.tags

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 20
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = each.value.subnet == "public" ? var.public_subnet_self_link : var.private_subnet_self_link

    dynamic "access_config" {
      for_each = each.value.public_ip ? [1] : []
      content {}
    }
  }

  service_account {
    scopes = ["cloud-platform"]
  }
}
