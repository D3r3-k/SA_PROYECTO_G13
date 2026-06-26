variable "network_id" {
  description = "ID de la VPC."
  type        = string
}

variable "network_self_link" {
  description = "Self link de la VPC."
  type        = string
}

variable "db_range_name" {
  description = "Nombre del rango reservado para Cloud SQL."
  type        = string
}

variable "redis_range_name" {
  description = "Nombre del rango reservado para Redis."
  type        = string
}

variable "range_prefix_length" {
  description = "Tamanio de los rangos reservados."
  type        = number
  default     = 20
}
