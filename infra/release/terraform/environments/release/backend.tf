terraform {
  backend "gcs" {
    bucket = "sa-proyecto-derek-tfstate"
    prefix = "release"
  }
}
