# Terraform

Esta carpeta se usara para definir la infraestructura declarativa de Google Cloud Platform.

> [!IMPORTANT]
> El ambiente `develop` ya tiene archivos Terraform. El ambiente `release` se generara mas adelante.

## Responsabilidad

Terraform sera responsable de crear, modificar y destruir:

- VPC y subredes.
- Reglas de firewall.
- Cloud Router y Cloud NAT.
- Private Service Access.
- Cloud SQL PostgreSQL.
- Bases de datos y usuarios.
- Memorystore Redis.
- Buckets de Cloud Storage.
- Service Accounts e IAM.
- VMs de desarrollo.
- Cluster GKE de produccion.
- IP estatica global para Ingress.

## Estructura

```text
infra/terraform/
  environments/
    develop/
      backend.tf
      main.tf
      variables.tf
      outputs.tf
      terraform.tfvars.example
    release/
      backend.tf
      main.tf
      variables.tf
      outputs.tf
      terraform.tfvars.example
  modules/
    network/
    private-service-access/
    cloud-sql/
    redis/
    storage/
    service-accounts/
    compute-vms/
    gke/
    ingress-ip/
    firewall/
```

> [!NOTE]
> La carpeta `release` todavia no existe. Se creara cuando se trabaje el despliegue de produccion.

## Comandos base para `develop`

```powershell
cd infra/terraform/environments/develop
Copy-Item terraform.tfvars.example terraform.tfvars
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -var-file="terraform.tfvars"
terraform apply -var-file="terraform.tfvars"
terraform output
```

Para destruir recursos:

```powershell
terraform destroy -var-file="terraform.tfvars"
```

> [!WARNING]
> No ejecutar `destroy` sin confirmar el ambiente. Puede eliminar bases de datos, buckets, VMs y clusters reales.

## Archivos que no deben versionarse

```text
*.tfvars
*.tfstate
*.tfstate.backup
.terraform/
.terraform.lock.hcl
```

> [!NOTE]
> `.terraform.lock.hcl` puede versionarse en equipos que quieren fijar versiones de providers. Para este proyecto se decidira cuando se genere el primer ambiente.
