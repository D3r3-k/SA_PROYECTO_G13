variable "name" {
  description = "Nombre de la instancia Redis."
  type        = string
}

variable "region" {
  description = "Region de Redis."
  type        = string
}

variable "memory_size_gb" {
  description = "Memoria de Redis en GB."
  type        = number
}

variable "redis_version" {
  description = "Version de Redis."
  type        = string
}

variable "network_id" {
  description = "ID de la VPC."
  type        = string
}
