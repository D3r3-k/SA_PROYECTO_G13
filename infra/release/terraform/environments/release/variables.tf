variable "project_id" {
  description = "ID del proyecto de GCP."
  type        = string
}

variable "region" {
  description = "Region principal de GCP."
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "Zona principal de GCP."
  type        = string
  default     = "us-central1-a"
}

variable "postgres_root_password" {
  description = "Password del usuario postgres/root de Cloud SQL."
  type        = string
  sensitive   = true
}

variable "identity_db_password" {
  description = "Password del usuario identity_user."
  type        = string
  sensitive   = true
}

variable "subscription_db_password" {
  description = "Password del usuario subscription_user."
  type        = string
  sensitive   = true
}

variable "catalog_db_password" {
  description = "Password del usuario catalog_user."
  type        = string
  sensitive   = true
}

variable "engagement_db_password" {
  description = "Password del usuario engagement_user."
  type        = string
  sensitive   = true
}

variable "gke_master_authorized_cidr_blocks" {
  description = "CIDR permitidos para acceder al plano de control de GKE."
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = [
    {
      cidr_block   = "0.0.0.0/0"
      display_name = "ci-cd-and-admin"
    }
  ]
}

variable "labels" {
  description = "Etiquetas comunes para los recursos."
  type        = map(string)
  default = {
    environment = "release"
    project     = "quetxal-tv"
    managed_by  = "terraform"
  }
}
