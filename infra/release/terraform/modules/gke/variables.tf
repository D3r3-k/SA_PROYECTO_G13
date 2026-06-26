variable "project_id" {
  description = "ID del proyecto GCP."
  type        = string
}

variable "region" {
  description = "Region del cluster GKE."
  type        = string
}

variable "node_locations" {
  description = "Zonas donde se crean nodos."
  type        = list(string)
}

variable "cluster_name" {
  description = "Nombre del cluster GKE."
  type        = string
}

variable "network_id" {
  description = "ID de la VPC."
  type        = string
}

variable "subnetwork_name" {
  description = "Nombre de la subred de GKE."
  type        = string
}

variable "subnetwork_cidr" {
  description = "CIDR primario de la subred GKE."
  type        = string
}

variable "pods_range_name" {
  description = "Nombre del rango secundario para Pods."
  type        = string
}

variable "pods_range_cidr" {
  description = "CIDR secundario para Pods."
  type        = string
}

variable "services_range_name" {
  description = "Nombre del rango secundario para Services."
  type        = string
}

variable "services_range_cidr" {
  description = "CIDR secundario para Services."
  type        = string
}

variable "master_ipv4_cidr_block" {
  description = "CIDR del master privado."
  type        = string
}

variable "node_machine_type" {
  description = "Tipo de maquina de los nodos."
  type        = string
}

variable "initial_node_count" {
  description = "Cantidad inicial de nodos."
  type        = number
}

variable "min_node_count" {
  description = "Minimo de nodos."
  type        = number
}

variable "max_node_count" {
  description = "Maximo de nodos."
  type        = number
}

variable "master_authorized_cidr_blocks" {
  description = "CIDR autorizados para acceder al plano de control."
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
}
