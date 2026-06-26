variable "name_prefix" {
  description = "Prefijo del ambiente."
  type        = string
}

variable "region" {
  description = "Region donde se crean subredes, router y NAT."
  type        = string
}

variable "vpc_name" {
  description = "Nombre de la VPC."
  type        = string
}

variable "public_subnet_name" {
  description = "Nombre de la subred publica."
  type        = string
}

variable "public_subnet_cidr" {
  description = "CIDR de la subred publica."
  type        = string
}

variable "private_subnet_name" {
  description = "Nombre de la subred privada."
  type        = string
}

variable "private_subnet_cidr" {
  description = "CIDR de la subred privada."
  type        = string
}

variable "router_name" {
  description = "Nombre del Cloud Router."
  type        = string
}

variable "nat_name" {
  description = "Nombre del Cloud NAT."
  type        = string
}

variable "private_google_access" {
  description = "Habilita acceso privado a APIs de Google en la subred privada."
  type        = bool
  default     = true
}
