# Terraform Release

Terraform crea la infraestructura de produccion en GCP.

## Ejecutar

Desde PowerShell:

```powershell
cd infra/release/terraform/environments/release
Copy-Item terraform.tfvars.example terraform.tfvars
notepad terraform.tfvars
terraform init
terraform fmt -recursive ..\..
terraform validate
terraform plan -var-file="terraform.tfvars"
terraform apply -var-file="terraform.tfvars"
terraform output
```

## Destruir

> [!WARNING]
> Elimina toda la infraestructura de produccion creada por Terraform.

```powershell
terraform destroy -var-file="terraform.tfvars"
```
