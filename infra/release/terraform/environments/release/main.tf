locals {
  name_prefix = "prod"

  required_services = [
    "serviceusage.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "container.googleapis.com",
    "artifactregistry.googleapis.com"
  ]

  databases = {
    identity = {
      name = "identity_db"
      user = "identity_user"
    }
    subscription = {
      name = "subscription_db"
      user = "subscription_user"
    }
    catalog = {
      name = "catalog_db"
      user = "catalog_user"
    }
    engagement = {
      name = "engagement_db"
      user = "engagement_user"
    }
  }

  database_passwords = {
    identity     = var.identity_db_password
    subscription = var.subscription_db_password
    catalog      = var.catalog_db_password
    engagement   = var.engagement_db_password
  }
}

resource "google_project_service" "required" {
  for_each = toset(local.required_services)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

module "network" {
  source = "../../modules/network"

  name_prefix           = local.name_prefix
  region                = var.region
  vpc_name              = "prod-vpc"
  public_subnet_name    = "prod-subnet-public"
  public_subnet_cidr    = "10.0.1.0/24"
  private_subnet_name   = "prod-subnet-private"
  private_subnet_cidr   = "10.0.2.0/24"
  router_name           = "prod-router"
  nat_name              = "prod-nat"
  private_google_access = true

  depends_on = [google_project_service.required]
}

module "private_service_access" {
  source = "../../modules/private-service-access"

  network_id          = module.network.network_id
  network_self_link   = module.network.network_self_link
  db_range_name       = "prod-db-range"
  redis_range_name    = "prod-redis-range"
  range_prefix_length = 20

  depends_on = [module.network]
}

module "service_accounts" {
  source = "../../modules/service-accounts"

  project_id         = var.project_id
  cicd_account_id    = "github-actions-prod"
  cicd_display_name  = "GitHub Actions Release Deploy"
  media_account_id   = "prod-catalog-media-signer"
  media_display_name = "Catalog Media Signer Prod"
  cicd_roles = [
    "roles/container.admin",
    "roles/cloudsql.admin",
    "roles/redis.viewer",
    "roles/storage.objectViewer",
    "roles/compute.networkViewer"
  ]

  depends_on = [google_project_service.required]
}

module "cloud_sql" {
  source = "../../modules/cloud-sql"

  project_id          = var.project_id
  region              = var.region
  instance_name       = "prod-postgres"
  database_version    = "POSTGRES_16"
  edition             = "ENTERPRISE"
  tier                = "db-custom-1-4096"
  availability_type   = "ZONAL"
  disk_size_gb        = 20
  root_password       = var.postgres_root_password
  private_network_id  = module.network.network_id
  deletion_protection = false
  databases           = local.databases
  database_passwords  = local.database_passwords

  depends_on = [module.private_service_access]
}

module "redis" {
  source = "../../modules/redis"

  name           = "prod-redis"
  region         = var.region
  memory_size_gb = 1
  redis_version  = "REDIS_7_0"
  network_id     = module.network.network_id

  depends_on = [module.private_service_access]
}

module "ingress_ip" {
  source = "../../modules/ingress-ip"

  name = "prod-release-ingress-ip"
}

module "storage" {
  source = "../../modules/storage"

  project_id                      = var.project_id
  region                          = var.region
  bucket_name                     = "prod-media-sa-proyecto-derek"
  media_service_account_email     = module.service_accounts.media_service_account_email
  cloud_sql_service_account_email = module.cloud_sql.service_account_email
  cors_origins = [
    "http://localhost:5173",
    "https://localhost:5173",
    "https://${module.ingress_ip.address}"
  ]
  labels = var.labels
}

module "gke" {
  source = "../../modules/gke"

  project_id                    = var.project_id
  region                        = var.region
  node_locations                = [var.zone]
  cluster_name                  = "prod-gke-release"
  network_id                    = module.network.network_id
  subnetwork_name               = "prod-subnet-gke-release"
  subnetwork_cidr               = "10.0.3.0/24"
  pods_range_name               = "prod-gke-pods"
  pods_range_cidr               = "10.10.0.0/16"
  services_range_name           = "prod-gke-services"
  services_range_cidr           = "10.20.0.0/20"
  master_ipv4_cidr_block        = "172.16.0.0/28"
  node_machine_type             = "e2-medium"
  initial_node_count            = 1
  min_node_count                = 1
  max_node_count                = 2
  master_authorized_cidr_blocks = var.gke_master_authorized_cidr_blocks

  depends_on = [module.network]
}

resource "google_container_node_pool" "observability" {
  project        = var.project_id
  name           = "prod-observability-pool"
  location       = var.region
  cluster        = module.gke.cluster_name
  node_locations = [var.zone]

  node_count = 1

  node_config {
    machine_type = "e2-standard-4"
    disk_size_gb = 50
    disk_type    = "pd-standard"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      workload = "observability"
    }

    taint {
      key    = "workload"
      value  = "observability"
      effect = "NO_SCHEDULE"
    }
  }

  depends_on = [module.gke]
}

module "firewall" {
  source = "../../modules/firewall"

  network_name = module.network.network_name

  rules = {
    allow_internal = {
      name          = "prod-allow-internal"
      protocol      = "all"
      ports         = []
      source_ranges = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24", "10.10.0.0/16", "10.20.0.0/20"]
      target_tags   = []
    }
  }
}

data "google_project" "project" {}

resource "google_project_iam_member" "gke_monitoring_viewer" {
  project = var.project_id
  role    = "roles/monitoring.viewer"
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
}

