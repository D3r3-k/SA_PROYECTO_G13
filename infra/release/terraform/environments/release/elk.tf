# IP estática pública para el servidor ELK
resource "google_compute_address" "elk_ip" {
  name   = "${local.name_prefix}-elk-ip"
  region = var.region
}

# Firewall para permitir acceso externo a SSH, Kibana y Elasticsearch
resource "google_compute_firewall" "elk_firewall" {
  name    = "${local.name_prefix}-elk-firewall"
  network = module.network.network_self_link

  allow {
    protocol = "tcp"
    ports    = ["22", "5601", "9200"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["elk-server"]
}

# Máquina Virtual de Compute Engine para Elasticsearch, Logstash y Kibana
resource "google_compute_instance" "elk_server" {
  name         = "${local.name_prefix}-elk-server"
  machine_type = "e2-medium"
  zone         = var.zone

  tags = ["elk-server"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 30
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = module.network.public_subnet_self_link

    access_config {
      nat_ip = google_compute_address.elk_ip.address
    }
  }

  depends_on = [module.network]
}

output "elk_server_ip" {
  description = "IP pública del servidor ELK para configurar Ansible y acceder a Kibana"
  value       = google_compute_address.elk_ip.address
}
