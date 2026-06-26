output "host" {
  description = "Host privado de Redis."
  value       = google_redis_instance.this.host
}

output "port" {
  description = "Puerto de Redis."
  value       = google_redis_instance.this.port
}
