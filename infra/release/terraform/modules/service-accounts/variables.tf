variable "project_id" {
  description = "ID del proyecto GCP."
  type        = string
}

variable "cicd_account_id" {
  description = "ID del Service Account de CI/CD."
  type        = string
}

variable "cicd_display_name" {
  description = "Nombre visible del Service Account de CI/CD."
  type        = string
}

variable "media_account_id" {
  description = "ID del Service Account para Catalog/GCS."
  type        = string
}

variable "media_display_name" {
  description = "Nombre visible del Service Account para Catalog/GCS."
  type        = string
}

variable "cicd_roles" {
  description = "Roles de proyecto asignados al Service Account de CI/CD."
  type        = list(string)
  default = [
    "roles/compute.instanceAdmin.v1",
    "roles/iap.tunnelResourceAccessor",
    "roles/compute.osAdminLogin",
    "roles/cloudsql.admin",
    "roles/redis.viewer",
    "roles/storage.objectViewer"
  ]
}
