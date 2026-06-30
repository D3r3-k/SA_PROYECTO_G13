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
