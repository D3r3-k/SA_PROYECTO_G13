variable "network_name" {
  description = "Nombre de la VPC."
  type        = string
}

variable "rules" {
  description = "Reglas de firewall."
  type = map(object({
    name          = string
    protocol      = string
    ports         = list(string)
    source_ranges = list(string)
    target_tags   = list(string)
  }))
}
