resource "google_compute_firewall" "this" {
  for_each = var.rules

  name          = each.value.name
  network       = var.network_name
  source_ranges = each.value.source_ranges
  target_tags   = each.value.target_tags

  allow {
    protocol = each.value.protocol
    ports    = each.value.protocol == "all" ? null : each.value.ports
  }
}
