data "google_project" "current" {
  project_id = var.project_id
}

resource "google_service_account" "cicd" {
  project      = var.project_id
  account_id   = var.cicd_account_id
  display_name = var.cicd_display_name
}

resource "google_service_account" "media" {
  project      = var.project_id
  account_id   = var.media_account_id
  display_name = var.media_display_name
}

resource "google_project_iam_member" "cicd_roles" {
  for_each = toset([
    "roles/compute.instanceAdmin.v1",
    "roles/iap.tunnelResourceAccessor",
    "roles/compute.osAdminLogin",
    "roles/cloudsql.admin",
    "roles/redis.viewer",
    "roles/storage.objectViewer"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

resource "google_service_account_iam_member" "cicd_can_use_compute_default_sa" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${data.google_project.current.number}-compute@developer.gserviceaccount.com"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cicd.email}"
}
