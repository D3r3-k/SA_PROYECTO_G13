variable "project_id" {
  description = "ID del proyecto GCP."
  type        = string
}

variable "zone" {
  description = "Zona donde se crean las VMs."
  type        = string
}

variable "public_subnet_self_link" {
  description = "Self link de la subred publica."
  type        = string
}

variable "private_subnet_self_link" {
  description = "Self link de la subred privada."
  type        = string
}

variable "instances" {
  description = "Mapa de VMs a crear."
  type = map(object({
    name         = string
    machine_type = string
    subnet       = string
    public_ip    = bool
    tags         = list(string)
  }))
}
