resource "google_sql_database_instance" "this" {
  name                = var.instance_name
  project             = var.project_id
  region              = var.region
  database_version    = var.database_version
  deletion_protection = var.deletion_protection
  root_password       = var.root_password

  settings {
    edition           = var.edition
    tier              = var.tier
    availability_type = var.availability_type
    disk_size         = var.disk_size_gb
    disk_type         = "PD_SSD"

    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.private_network_id
    }
  }
}

resource "google_sql_database" "databases" {
  for_each = var.databases

  name     = each.value.name
  project  = var.project_id
  instance = google_sql_database_instance.this.name
}

resource "google_sql_user" "users" {
  for_each = var.databases

  name     = each.value.user
  project  = var.project_id
  instance = google_sql_database_instance.this.name
  password = var.database_passwords[each.key]
}
