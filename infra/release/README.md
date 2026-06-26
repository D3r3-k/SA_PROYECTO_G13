# Release con Terraform y Ansible

> [!IMPORTANT]
> Terraform crea y destruye toda la infraestructura de produccion. Ansible solo valida el acceso local al cluster GKE y crea el namespace si no existe.

## Recursos que crea Terraform

| Recurso                | Nombre                                                          |
| ---------------------- | --------------------------------------------------------------- |
| VPC                    | `prod-vpc`                                                      |
| Subred publica         | `prod-subnet-public`                                            |
| Subred privada         | `prod-subnet-private`                                           |
| Subred GKE             | `prod-subnet-gke-release`                                       |
| Rangos secundarios GKE | `prod-gke-pods`, `prod-gke-services`                            |
| Cloud Router/NAT       | `prod-router`, `prod-nat`                                       |
| Private Service Access | `prod-db-range`, `prod-redis-range`                             |
| Cloud SQL PostgreSQL   | `prod-postgres`                                                 |
| Bases de datos         | `identity_db`, `subscription_db`, `catalog_db`, `engagement_db` |
| Redis                  | `prod-redis`                                                    |
| Bucket multimedia      | `prod-media-sa-proyecto-derek`                                  |
| GKE                    | `prod-gke-release`                                              |
| IP estatica global     | `prod-release-ingress-ip`                                       |
| Service Accounts       | `github-actions-prod`, `prod-catalog-media-signer`              |

## Paso 1. Preparar variables

Ejecutar en PowerShell desde la raiz del proyecto:

```powershell
Copy-Item infra/release/terraform/environments/release/terraform.tfvars.example infra/release/terraform/environments/release/terraform.tfvars
notepad infra/release/terraform/environments/release/terraform.tfvars
```

Editar contrasenas:

```text
postgres_root_password
identity_db_password
subscription_db_password
catalog_db_password
engagement_db_password
```

> [!IMPORTANT]
> `terraform.tfvars` no debe subirse a GitHub.

## Paso 2. Inicializar Terraform

Ejecutar en PowerShell:

```powershell
cd infra/release/terraform/environments/release
terraform init
```

Si el bucket de state no existe:

```powershell
$env:PROJECT_ID="sa-proyecto-derek"
$env:REGION="us-central1"
$env:TF_STATE_BUCKET="sa-proyecto-derek-tfstate"

gcloud config set project $env:PROJECT_ID
gcloud services enable storage.googleapis.com
gcloud storage buckets create gs://$env:TF_STATE_BUCKET --location=$env:REGION --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://$env:TF_STATE_BUCKET --versioning
```

Luego:

```powershell
terraform init -reconfigure
```

## Paso 3. Validar Terraform

Ejecutar:

```powershell
terraform fmt -recursive ..\..
terraform validate
```

## Paso 4. Revisar plan

Ejecutar:

```powershell
terraform plan -var-file="terraform.tfvars"
```

Revisar que aparezcan recursos `prod-*`, especialmente:

```text
prod-vpc
prod-postgres
prod-redis
prod-media-sa-proyecto-derek
prod-gke-release
prod-release-ingress-ip
```

Si aparece este error:

```text
Invalid count argument
```

Actualizar el codigo del repositorio y volver a ejecutar:

```powershell
terraform fmt -recursive ..\..
terraform validate
terraform plan -var-file="terraform.tfvars"
```

Ese error ocurre cuando Terraform intenta decidir cuantas reglas IAM crear usando un valor que todavia se conoce hasta el `apply`.

## Paso 5. Crear infraestructura release

Ejecutar:

```powershell
terraform apply -var-file="terraform.tfvars"
```

Cuando pregunte:

```text
Do you want to perform these actions?
```

Escribir:

```text
yes
```

Si GKE falla con:

```text
Quota 'SSD_TOTAL_GB' exceeded
```

Actualizar el codigo del repositorio y volver a ejecutar:

```powershell
terraform fmt -recursive ..\..
terraform validate
terraform plan -var-file="terraform.tfvars"
terraform apply -var-file="terraform.tfvars"
```

La configuracion de GKE debe usar:

```text
node_locations = ["us-central1-a"]
disk_type      = "pd-standard"
```

Esto evita consumir cuota SSD regional para los nodos.

## Paso 6. Ver outputs

Ejecutar:

```powershell
terraform output
```

Guardar estos valores para GitHub Actions:

```text
bucket_name
cicd_service_account_email
cloud_sql_private_ip
gke_cluster_name
gke_location
gke_namespace
ingress_ip_address
ingress_ip_name
media_service_account_email
redis_host
redis_port
```

## Paso 7. Validar GKE con Ansible

Abrir Ubuntu/WSL desde PowerShell:

```powershell
wsl -d Ubuntu
```

Entrar al proyecto dentro de WSL:

```bash
cd /mnt/d/Proyectos/Universidad/2026-1V/SA_PROYECTO_G13
```

Validar que `gcloud`, `kubectl` y `ansible` existan dentro de WSL:

```bash
gcloud --version
kubectl version --client
ansible --version
```

Configurar proyecto desde WSL:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project sa-proyecto-derek
gcloud config set compute/region us-central1
gcloud config set compute/zone us-central1-a
```

Crear archivos reales desde los ejemplos:

```bash
cp infra/release/ansible/inventories/release/hosts.ini.example infra/release/ansible/inventories/release/hosts.ini
cp infra/release/ansible/inventories/release/group_vars/all.yml.example infra/release/ansible/inventories/release/group_vars/all.yml
```

Entrar a la carpeta de Ansible release:

```bash
cd infra/release/ansible
```

Validar inventario:

```bash
ANSIBLE_CONFIG=$PWD/ansible.cfg ansible-inventory -i inventories/release/hosts.ini --list
```

Ejecutar validacion:

```bash
ANSIBLE_CONFIG=$PWD/ansible.cfg ansible-playbook -i inventories/release/hosts.ini playbooks/validate-release.yml
```

Este playbook valida:

```text
gcloud
kubectl
credenciales del cluster
nodos GKE
namespace quetxal-tv-prod
IP estatica global del Ingress
```

## Paso 8. Configurar GitHub Environment `release`

Crear el environment `release` en GitHub:

```text
Settings > Environments > New environment > release
```

### Secrets

| Secret                            | Valor                                                  |
| --------------------------------- | ------------------------------------------------------ |
| `CATALOG_DB_PASSWORD`             | Password de `catalog_user`                             |
| `ENGAGEMENT_DB_PASSWORD`          | Password de `engagement_user`                          |
| `GCP_SERVICE_ACCOUNT_KEY`         | Llave JSON de `github-actions-prod`                    |
| `GCS_BACKEND_SERVICE_ACCOUNT_KEY` | Llave JSON de `prod-catalog-media-signer`              |
| `GHCR_TOKEN`                      | Token de GitHub con `read:packages` y `write:packages` |
| `GHCR_USERNAME`                   | Usuario de GitHub                                      |
| `IDENTITY_DB_PASSWORD`            | Password de `identity_user`                            |
| `JWT_SECRET`                      | Token JWT seguro                                       |
| `SMTP_FROM`                       | Correo remitente                                       |
| `SMTP_HOST`                       | Host SMTP                                              |
| `SMTP_PASSWORD`                   | Password SMTP                                          |
| `SMTP_USERNAME`                   | Usuario SMTP                                           |
| `SUBSCRIPTION_DB_PASSWORD`        | Password de `subscription_user`                        |

Generar llave de `GCP_SERVICE_ACCOUNT_KEY`:

```powershell
gcloud iam service-accounts keys create gcp-github-actions-release-key.json --iam-account=github-actions-prod@sa-proyecto-derek.iam.gserviceaccount.com
Get-Content -Raw .\gcp-github-actions-release-key.json
Remove-Item .\gcp-github-actions-release-key.json
```

Generar llave de `GCS_BACKEND_SERVICE_ACCOUNT_KEY`:

```powershell
gcloud iam service-accounts keys create gcs-backend-service-account.json --iam-account=prod-catalog-media-signer@sa-proyecto-derek.iam.gserviceaccount.com
Get-Content -Raw .\gcs-backend-service-account.json
Remove-Item .\gcs-backend-service-account.json
```

Generar `JWT_SECRET`:

```powershell
[System.Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### Variables

| Variable                            | Valor                                      |
| ----------------------------------- | ------------------------------------------ |
| `ADMIN_EMAILS`                      | Correo(s) administrador separados por coma |
| `CLOUD_SQL_INSTANCE`                | `prod-postgres`                            |
| `GCP_PROJECT_ID`                    | `sa-proyecto-derek`                        |
| `GCP_REGION`                        | `us-central1`                              |
| `GCP_ZONE`                          | `us-central1-a`                            |
| `GCS_ALLOWED_IMAGE_TYPES`           | `image/jpeg,image/png,image/webp`          |
| `GCS_ALLOWED_VIDEO_TYPES`           | `video/mp4,video/webm`                     |
| `GCS_BUCKET_NAME`                   | Output `bucket_name`                       |
| `GCS_MAX_IMAGE_MB`                  | `10`                                       |
| `GCS_MAX_VIDEO_MB`                  | `1024`                                     |
| `GCS_SIGNED_READ_EXPIRES_MINUTES`   | `60`                                       |
| `GCS_SIGNED_UPLOAD_EXPIRES_MINUTES` | `15`                                       |
| `GKE_CLUSTER_NAME`                  | Output `gke_cluster_name`                  |
| `GKE_NAMESPACE`                     | `quetxal-tv-prod`                          |
| `INGRESS_IP_NAME`                   | Output `ingress_ip_name`                   |
| `REDIS_INSTANCE`                    | `prod-redis`                               |
| `SMTP_PORT`                         | `587`                                      |
| `SMTP_STARTTLS`                     | `true`                                     |
| `VPC_NAME`                          | `prod-vpc`                                 |

## Paso 9. Validar infraestructura release

Ejecutar en PowerShell:

```powershell
cd D:\Proyectos\Universidad\2026-1V\SA_PROYECTO_G13\infra\release\terraform\environments\release
```

```powershell
gcloud container clusters get-credentials prod-gke-release --region=us-central1 --project=sa-proyecto-derek
```

```powershell
kubectl get nodes
```

```powershell
kubectl get namespace quetxal-tv-prod
```

```powershell
terraform output gke_cluster_name
```

```powershell
terraform output gke_namespace
```

```powershell
terraform output ingress_ip_address
```

```powershell
terraform output cloud_sql_private_ip
```

```powershell
terraform output redis_host
```

El comando `kubectl get nodes` debe mostrar al menos un nodo en estado:

```text
Ready
```

Validar que el namespace exista:

```powershell
kubectl get namespace quetxal-tv-prod
```

> [!IMPORTANT]
> Si los comandos `kubectl get pods`, `kubectl get services` o `kubectl get ingress` responden `No resources found in quetxal-tv-prod namespace`, no es un error de Terraform ni de Ansible. Significa que la infraestructura ya existe, pero todavia no hay workloads, services ni ingress creados dentro del namespace.

Validar estado de Terraform:

```powershell
terraform state list
```

## Paso 10. Destruir release

> [!WARNING]
> Este comando elimina la infraestructura de produccion: GKE, Cloud SQL, Redis, bucket, VPC, subredes, NAT, IP estatica y Service Accounts.

Validar proyecto:

```powershell
gcloud config get-value project
```

Debe responder:

```text
sa-proyecto-derek
```

Entrar al ambiente:

```powershell
cd D:\Proyectos\Universidad\2026-1V\SA_PROYECTO_G13\infra\release\terraform\environments\release
```

Destruir:

```powershell
terraform destroy -var-file="terraform.tfvars"
```

Confirmar:

```text
yes
```
