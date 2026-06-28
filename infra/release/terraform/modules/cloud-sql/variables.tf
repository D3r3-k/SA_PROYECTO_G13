variable "project_id" {
  description = "ID del proyecto GCP."
  type        = string
}

variable "region" {
  description = "Region de Cloud SQL."
  type        = string
}

variable "instance_name" {
  description = "Nombre de la instancia Cloud SQL."
  type        = string
}

variable "database_version" {
  description = "Version de PostgreSQL."
  type        = string
}

variable "edition" {
  description = "Edicion de Cloud SQL."
  type        = string
  default     = "ENTERPRISE"
}

variable "tier" {
  description = "Tipo de maquina Cloud SQL."
  type        = string
}

variable "availability_type" {
  description = "Disponibilidad de la instancia."
  type        = string
}

variable "disk_size_gb" {
  description = "Tamanio del disco en GB."
  type        = number
}

variable "root_password" {
  description = "Password root/postgres."
  type        = string
  sensitive   = true
}

variable "private_network_id" {
  description = "ID de la VPC para IP privada."
  type        = string
}

variable "deletion_protection" {
  description = "Proteccion contra borrado."
  type        = bool
  default     = true
}

variable "databases" {
  description = "Bases de datos y usuarios a crear."
  type = map(object({
    name = string
    user = string
  }))
}

variable "database_passwords" {
  description = "Passwords de usuarios por llave de base de datos."
  type        = map(string)
  sensitive   = true
}
