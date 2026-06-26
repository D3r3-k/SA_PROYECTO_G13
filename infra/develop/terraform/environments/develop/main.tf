locals {
  name_prefix = "dev"

  required_services = [
    "serviceusage.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "iap.googleapis.com"
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

resource "google_compute_project_metadata_item" "default_dns_type" {
  project = var.project_id
  key     = "default-dns-type"
  value   = "zonal"

  depends_on = [google_project_service.required]
}

resource "google_compute_project_metadata_item" "enable_oslogin" {
  project = var.project_id
  key     = "enable-oslogin"
  value   = "TRUE"

  depends_on = [google_project_service.required]
}

module "network" {
  source = "../../modules/network"

  name_prefix           = local.name_prefix
  region                = var.region
  vpc_name              = "dev-vpc"
  public_subnet_name    = "dev-subnet-public"
  public_subnet_cidr    = "10.0.1.0/24"
  private_subnet_name   = "dev-subnet-private"
  private_subnet_cidr   = "10.0.2.0/24"
  router_name           = "dev-router"
  nat_name              = "dev-nat"
  private_google_access = true

  depends_on = [google_project_service.required]
}

module "private_service_access" {
  source = "../../modules/private-service-access"

  network_id          = module.network.network_id
  network_self_link   = module.network.network_self_link
  db_range_name       = "dev-db-range"
  redis_range_name    = "dev-redis-range"
  range_prefix_length = 20

  depends_on = [module.network]
}

module "service_accounts" {
  source = "../../modules/service-accounts"

  project_id         = var.project_id
  cicd_account_id    = "github-actions-dev"
  cicd_display_name  = "GitHub Actions Dev"
  media_account_id   = "dev-catalog-media-signer"
  media_display_name = "Catalog Media Signer Dev"

  depends_on = [google_project_service.required]
}

module "cloud_sql" {
  source = "../../modules/cloud-sql"

  project_id          = var.project_id
  region              = var.region
  instance_name       = "dev-postgres"
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

  name           = "dev-redis"
  region         = var.region
  memory_size_gb = 1
  redis_version  = "REDIS_7_0"
  network_id     = module.network.network_id

  depends_on = [module.private_service_access]
}

module "storage" {
  source = "../../modules/storage"

  project_id                  = var.project_id
  region                      = var.region
  bucket_name                 = "dev-media-sa-proyecto-derek"
  media_service_account_email = module.service_accounts.media_service_account_email
  cloud_sql_service_account_email = module.cloud_sql.service_account_email
  cors_origins = [
    "http://localhost:5173",
    "https://localhost:5173",
    "http://localhost:8080"
  ]
  labels = var.labels
}

module "compute_vms" {
  source = "../../modules/compute-vms"

  project_id               = var.project_id
  zone                     = var.zone
  public_subnet_self_link  = module.network.public_subnet_self_link
  private_subnet_self_link = module.network.private_subnet_self_link

  instances = {
    frontend = {
      name         = "dev-vm-frontend"
      machine_type = "e2-micro"
      subnet       = "public"
      public_ip    = true
      tags         = ["frontend", "http-server"]
    }
    gateway = {
      name         = "dev-vm-gateway"
      machine_type = "e2-small"
      subnet       = "private"
      public_ip    = false
      tags         = ["gateway"]
    }
    services = {
      name         = "dev-vm-services"
      machine_type = "e2-medium"
      subnet       = "private"
      public_ip    = false
      tags         = ["services"]
    }
  }

  depends_on = [
    google_compute_project_metadata_item.default_dns_type,
    google_compute_project_metadata_item.enable_oslogin
  ]
}

module "firewall" {
  source = "../../modules/firewall"

  network_name = module.network.network_name

  rules = {
    allow_internal = {
      name          = "dev-allow-internal"
      protocol      = "all"
      ports         = []
      source_ranges = ["10.0.1.0/24", "10.0.2.0/24"]
      target_tags   = []
    }
    allow_iap_ssh = {
      name          = "dev-allow-iap-ssh"
      protocol      = "tcp"
      ports         = ["22"]
      source_ranges = ["35.235.240.0/20"]
      target_tags   = []
    }
    allow_http = {
      name          = "dev-allow-http"
      protocol      = "tcp"
      ports         = ["80"]
      source_ranges = ["0.0.0.0/0"]
      target_tags   = ["http-server"]
    }
    allow_gateway = {
      name          = "dev-allow-gateway"
      protocol      = "tcp"
      ports         = ["3000"]
      source_ranges = ["10.0.1.0/24"]
      target_tags   = ["gateway"]
    }
    allow_grpc_services = {
      name          = "dev-allow-grpc-services"
      protocol      = "tcp"
      ports         = ["50051-50057"]
      source_ranges = ["10.0.2.0/24"]
      target_tags   = ["services"]
    }
  }
}
