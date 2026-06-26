variable "project_id" {
  description = "ID del proyecto GCP."
  type        = string
}

variable "region" {
  description = "Region del bucket."
  type        = string
}

variable "bucket_name" {
  description = "Nombre del bucket."
  type        = string
}

variable "media_service_account_email" {
  description = "Email del Service Account que firmara URLs."
  type        = string
}

variable "cors_origins" {
  description = "Origenes permitidos por CORS."
  type        = list(string)
}

variable "labels" {
  description = "Etiquetas del bucket."
  type        = map(string)
  default     = {}
}
