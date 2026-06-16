# Despliegue develop en Google Cloud Platform

Esta guia deja el ambiente `develop` desde cero hasta el despliegue correcto con CI/CD.

Arquitectura final:

- Cloud SQL PostgreSQL para `identity_db`, `subscription_db`, `catalog_db` y `engagement_db`.
- Memorystore Redis para cache/colas.
- 3 VMs de Compute Engine:
  - `qx-vm-frontend`: frontend publico.
  - `qx-vm-gateway`: API Gateway privado.
  - `qx-vm-services`: microservicios privados.
- Cloud Storage bucket para archivos y backups.
- GitHub Actions con GitHub Environment `develop`.
- Imagenes Docker publicadas en GHCR.

Los comandos estan preparados para PowerShell.

## 0. Variables base

Autenticarse y seleccionar el proyecto:

```powershell
gcloud auth login
gcloud init
```

```powershell
$env:PROJECT_ID="sa-derek-proyecto"
$env:REGION="us-central1"
$env:ZONE="us-central1-a"
$env:VPC_NAME="qx-vpc"
$env:BUCKET_NAME="qx-media-sa-derek-proyecto"
$env:CICD_SA_NAME="github-actions-deploy"
$env:CICD_SA="$env:CICD_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"

gcloud config set project $env:PROJECT_ID
gcloud config set compute/region $env:REGION
gcloud config set compute/zone $env:ZONE
```

## 1. Limpiar todo el proyecto

Ejecutar esta seccion si se desea reiniciar la infraestructura `qx-*`.

> Precaucion: estos comandos eliminan recursos de GCP.

```powershell
gcloud compute instances delete qx-vm-frontend qx-vm-gateway qx-vm-services --zone=$env:ZONE --quiet
gcloud redis instances delete qx-redis --region=$env:REGION --quiet
gcloud sql instances delete qx-postgres --quiet
gcloud compute firewall-rules delete qx-allow-internal qx-allow-iap-ssh qx-allow-http qx-allow-gateway qx-allow-grpc-services --quiet
gcloud compute routers nats delete qx-nat --router=qx-router --region=$env:REGION --quiet
gcloud compute routers delete qx-router --region=$env:REGION --quiet
gcloud services vpc-peerings delete --service=servicenetworking.googleapis.com --network=$env:VPC_NAME --quiet
gcloud compute addresses delete qx-redis-range --global --quiet
gcloud compute addresses delete qx-db-range --global --quiet
gcloud compute networks subnets delete qx-subnet-public --region=$env:REGION --quiet
gcloud compute networks subnets delete qx-subnet-private --region=$env:REGION --quiet
gcloud compute networks delete $env:VPC_NAME --quiet
gcloud storage rm -r gs://$env:BUCKET_NAME
gcloud iam service-accounts delete $env:CICD_SA --quiet
```

Si algun recurso no existe, continuar con el siguiente comando.

Validar limpieza:

```powershell
gcloud compute instances list --filter="name~qx-"
gcloud redis instances list --region=$env:REGION
gcloud sql instances list
gcloud compute firewall-rules list --filter="name~qx-"
gcloud compute networks list --filter="name=$env:VPC_NAME"
gcloud compute addresses list --global --filter="name~qx-.*-range"
gcloud storage buckets list --filter="name:$env:BUCKET_NAME"
```

## 2. Activar APIs

```powershell
gcloud services enable compute.googleapis.com
gcloud services enable servicenetworking.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable iam.googleapis.com
gcloud services enable iap.googleapis.com
```

## 3. Crear red, subredes y NAT

```powershell
gcloud compute networks create $env:VPC_NAME --subnet-mode=custom --bgp-routing-mode=regional
gcloud compute networks subnets create qx-subnet-public --network=$env:VPC_NAME --range=10.0.1.0/24 --region=$env:REGION
gcloud compute networks subnets create qx-subnet-private --network=$env:VPC_NAME --range=10.0.2.0/24 --region=$env:REGION --enable-private-ip-google-access
gcloud compute routers create qx-router --network=$env:VPC_NAME --region=$env:REGION
gcloud compute routers nats create qx-nat --router=qx-router --region=$env:REGION --nat-all-subnet-ip-ranges --auto-allocate-nat-external-ips
```

## 4. Crear Private Service Access

Cloud SQL y Memorystore usan IP privada dentro de la VPC.

```powershell
gcloud compute addresses create qx-db-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango para Cloud SQL y Redis" --network=$env:VPC_NAME
gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com --ranges=qx-db-range --network=$env:VPC_NAME --project=$env:PROJECT_ID
```

Si Memorystore falla despues por espacio agotado, agregar el rango adicional:

```powershell
gcloud compute addresses create qx-redis-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango adicional para Memorystore Redis" --network=$env:VPC_NAME
gcloud services vpc-peerings update --service=servicenetworking.googleapis.com --ranges="qx-db-range,qx-redis-range" --network=$env:VPC_NAME --force
```

## 5. Crear Cloud SQL PostgreSQL

Definir contrasenas locales. Usar los mismos valores en GitHub Environment `develop`.

```powershell
$env:POSTGRES_ROOT_PASSWORD="CAMBIAR_ROOT_PASSWORD"
$env:IDENTITY_DB_PASSWORD="CAMBIAR_IDENTITY_PASSWORD"
$env:SUBSCRIPTION_DB_PASSWORD="CAMBIAR_SUBSCRIPTION_PASSWORD"
$env:CATALOG_DB_PASSWORD="CAMBIAR_CATALOG_PASSWORD"
$env:ENGAGEMENT_DB_PASSWORD="CAMBIAR_ENGAGEMENT_PASSWORD"
```

Crear instancia:

```powershell
gcloud sql instances create qx-postgres --database-version=POSTGRES_16 --edition=ENTERPRISE --cpu=1 --memory=4GB --region=$env:REGION --network=$env:VPC_NAME --no-assign-ip --root-password=$env:POSTGRES_ROOT_PASSWORD --availability-type=ZONAL --storage-size=20GB --storage-type=SSD --backup-start-time=03:00
```

Crear bases de datos:

```powershell
gcloud sql databases create identity_db --instance=qx-postgres
gcloud sql databases create subscription_db --instance=qx-postgres
gcloud sql databases create catalog_db --instance=qx-postgres
gcloud sql databases create engagement_db --instance=qx-postgres
```

Crear usuarios:

```powershell
gcloud sql users create identity_user --instance=qx-postgres --password=$env:IDENTITY_DB_PASSWORD
gcloud sql users create subscription_user --instance=qx-postgres --password=$env:SUBSCRIPTION_DB_PASSWORD
gcloud sql users create catalog_user --instance=qx-postgres --password=$env:CATALOG_DB_PASSWORD
gcloud sql users create engagement_user --instance=qx-postgres --password=$env:ENGAGEMENT_DB_PASSWORD
```

Obtener IP privada:

```powershell
gcloud sql instances describe qx-postgres --format="value(ipAddresses[0].ipAddress)"
```

## 6. Crear Memorystore Redis

```powershell
gcloud redis instances create qx-redis --size=1 --region=$env:REGION --network=$env:VPC_NAME --connect-mode=PRIVATE_SERVICE_ACCESS --redis-version=redis_7_0 --tier=basic
```

Obtener host y puerto:

```powershell
gcloud redis instances describe qx-redis --region=$env:REGION --format="value(host)"
gcloud redis instances describe qx-redis --region=$env:REGION --format="value(port)"
```

## 7. Crear bucket

```powershell
gcloud storage buckets create gs://$env:BUCKET_NAME --location=$env:REGION --uniform-bucket-level-access --public-access-prevention
```

Dar permisos al service account de Compute Engine:

```powershell
$env:PROJECT_NUMBER=(gcloud projects describe $env:PROJECT_ID --format="value(projectNumber)")
$env:COMPUTE_SA="$env:PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:COMPUTE_SA" --role="roles/storage.objectAdmin"
```

Crear service account para que `catalog-service` firme URLs de carga y lectura:

```powershell
$env:MEDIA_SA_NAME="catalog-media-signer"
$env:MEDIA_SA="$env:MEDIA_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create $env:MEDIA_SA_NAME --display-name="Catalog Media Signer"
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:MEDIA_SA" --role="roles/storage.objectAdmin"
gcloud iam service-accounts keys create gcs-backend-service-account.json --iam-account=$env:MEDIA_SA
Get-Content -Raw .\gcs-backend-service-account.json
Remove-Item .\gcs-backend-service-account.json
```

El JSON se guarda como secret `GCS_BACKEND_SERVICE_ACCOUNT_KEY` en GitHub Environment `develop`.

Configurar CORS del bucket para que el frontend pueda subir directo con signed URLs:

```powershell
@'
[
  {
    "origin": [
      "http://localhost:5173",
      "https://localhost:5173",
      "http://34.66.234.222"
    ],
    "method": ["GET", "PUT", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Length", "x-goog-content-length-range"],
    "maxAgeSeconds": 3600
  }
]
'@ | Set-Content -Encoding utf8 .\cors.json

gcloud storage buckets update gs://$env:BUCKET_NAME --cors-file=.\cors.json
Remove-Item .\cors.json
```

El bucket debe permanecer privado: no agregar `allUsers` ni `public read`.

## 8. Crear VMs

Frontend publico:

```powershell
gcloud compute instances create qx-vm-frontend --zone=$env:ZONE --machine-type=e2-micro --network=$env:VPC_NAME --subnet=qx-subnet-public --tags="frontend,http-server" --image-family=debian-12 --image-project=debian-cloud
```

API Gateway privado:

```powershell
gcloud compute instances create qx-vm-gateway --zone=$env:ZONE --machine-type=e2-small --network=$env:VPC_NAME --subnet=qx-subnet-private --tags="gateway" --no-address --image-family=debian-12 --image-project=debian-cloud
```

Microservicios privados:

```powershell
gcloud compute instances create qx-vm-services --zone=$env:ZONE --machine-type=e2-medium --network=$env:VPC_NAME --subnet=qx-subnet-private --tags="services" --no-address --image-family=debian-12 --image-project=debian-cloud
```

Validar IPs:

```powershell
gcloud compute instances list --filter="name~qx-vm-" --format="table(name,zone,networkInterfaces[0].networkIP,networkInterfaces[0].accessConfigs[0].natIP,status)"
```

## 9. Crear reglas de firewall

```powershell
gcloud compute firewall-rules create qx-allow-internal --network=$env:VPC_NAME --allow="tcp,udp,icmp" --source-ranges="10.0.1.0/24,10.0.2.0/24"
gcloud compute firewall-rules create qx-allow-iap-ssh --network=$env:VPC_NAME --allow="tcp:22" --source-ranges="35.235.240.0/20"
gcloud compute firewall-rules create qx-allow-http --network=$env:VPC_NAME --allow=tcp:80 --target-tags=http-server
gcloud compute firewall-rules create qx-allow-gateway --network=$env:VPC_NAME --allow="tcp:3000" --source-ranges="10.0.1.0/24" --target-tags=gateway
gcloud compute firewall-rules create qx-allow-grpc-services --network=$env:VPC_NAME --allow="tcp:50051-50057" --source-ranges="10.0.2.0/24" --target-tags=services
```

## 10. Instalar Docker en las VMs

Conectarse a cada VM:

```powershell
gcloud compute ssh qx-vm-frontend --tunnel-through-iap --zone=$env:ZONE
gcloud compute ssh qx-vm-gateway --tunnel-through-iap --zone=$env:ZONE
gcloud compute ssh qx-vm-services --tunnel-through-iap --zone=$env:ZONE
```

Ejecutar dentro de cada VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
exit
```

Entrar nuevamente a la VM y validar:

```bash
docker --version
docker compose version
```

## 11. Conexion a VMs

Conexion directa:

```powershell
gcloud compute ssh qx-vm-frontend --tunnel-through-iap --zone=$env:ZONE
gcloud compute ssh qx-vm-gateway --tunnel-through-iap --zone=$env:ZONE
gcloud compute ssh qx-vm-services --tunnel-through-iap --zone=$env:ZONE
```

Tuneles para Terminus:

```powershell
gcloud compute start-iap-tunnel qx-vm-frontend 22 --local-host-port=localhost:2221 --zone=$env:ZONE
gcloud compute start-iap-tunnel qx-vm-gateway 22 --local-host-port=localhost:2222 --zone=$env:ZONE
gcloud compute start-iap-tunnel qx-vm-services 22 --local-host-port=localhost:2223 --zone=$env:ZONE
```

Configurar en Terminus:

```text
Frontend:
Host: 127.0.0.1
Port: 2221
User: D3r3k
Private key: C:\Users\D3r3k\.ssh\google_compute_engine

Gateway:
Host: 127.0.0.1
Port: 2222
User: D3r3k
Private key: C:\Users\D3r3k\.ssh\google_compute_engine

Services:
Host: 127.0.0.1
Port: 2223
User: D3r3k
Private key: C:\Users\D3r3k\.ssh\google_compute_engine
```

## 12. Configurar GitHub Environment develop

El workflow no requiere crear `.env` manualmente en las VMs. GitHub Actions genera los `.env`, los copia por IAP y ejecuta `docker compose`.

Crear environment:

1. Ir a `Settings > Environments`.
2. Crear `develop`.
3. Agregar los secrets y variables de esta seccion.

### 12.1 Crear service account para GitHub Actions

```powershell
$env:CICD_SA_NAME="github-actions-deploy"
$env:CICD_SA="$env:CICD_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create $env:CICD_SA_NAME --display-name="GitHub Actions Deploy"
```

Permisos del service account:

```powershell
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/compute.instanceAdmin.v1"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/iap.tunnelResourceAccessor"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/compute.osAdminLogin"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/cloudsql.admin"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/redis.viewer"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/storage.objectViewer"
```

Permitir que GitHub Actions use el service account de Compute Engine:

```powershell
$env:PROJECT_NUMBER=(gcloud projects describe $env:PROJECT_ID --format="value(projectNumber)")
$env:COMPUTE_SA="$env:PROJECT_NUMBER-compute@developer.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding $env:COMPUTE_SA --member="serviceAccount:$env:CICD_SA" --role="roles/iam.serviceAccountUser" --project=$env:PROJECT_ID
```

Permitir backups de Cloud SQL en el bucket:

```powershell
$env:CLOUD_SQL_SA=(gcloud sql instances describe qx-postgres --format="value(serviceAccountEmailAddress)")
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:CLOUD_SQL_SA" --role="roles/storage.objectCreator"
```

Crear llave JSON para GitHub:

```powershell
gcloud iam service-accounts keys create gcp-github-actions-key.json --iam-account=$env:CICD_SA
Get-Content -Raw .\gcp-github-actions-key.json
```

```powershell
Remove-Item .\gcp-github-actions-key.json
```

El contenido JSON se guarda como secret `GCP_SERVICE_ACCOUNT_KEY`.

### 12.2 Secrets requeridos

Agregar en `Settings > Environments > develop > Environment secrets`:

```text
GCP_SERVICE_ACCOUNT_KEY
GCS_BACKEND_SERVICE_ACCOUNT_KEY
GHCR_USERNAME
GHCR_TOKEN
JWT_SECRET
IDENTITY_DB_PASSWORD
SUBSCRIPTION_DB_PASSWORD
CATALOG_DB_PASSWORD
ENGAGEMENT_DB_PASSWORD
SMTP_HOST
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
```

Valores:

- `GCP_SERVICE_ACCOUNT_KEY`: JSON del paso 12.1.
- `GCS_BACKEND_SERVICE_ACCOUNT_KEY`: JSON del service account `catalog-media-signer` creado en el paso 7.
- `GHCR_USERNAME`: usuario de GitHub.
- `GHCR_TOKEN`: token de GitHub con permiso `read:packages`.
- `JWT_SECRET`: cadena aleatoria.
- `IDENTITY_DB_PASSWORD`: password de `identity_user`.
- `SUBSCRIPTION_DB_PASSWORD`: password de `subscription_user`.
- `CATALOG_DB_PASSWORD`: password de `catalog_user`.
- `ENGAGEMENT_DB_PASSWORD`: password de `engagement_user`.
- `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`: datos SMTP.

Generar `JWT_SECRET`:

```powershell
[System.Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 12.3 Variables requeridas

Agregar en `Settings > Environments > develop > Environment variables`:

```text
GCP_PROJECT_ID=sa-derek-proyecto
GCP_REGION=us-central1
GCP_ZONE=us-central1-a
VM_FRONTEND_NAME=qx-vm-frontend
VM_GATEWAY_NAME=qx-vm-gateway
VM_SERVICES_NAME=qx-vm-services
GCS_BUCKET_NAME=qx-media-sa-derek-proyecto
GCS_SIGNED_UPLOAD_EXPIRES_MINUTES=15
GCS_SIGNED_READ_EXPIRES_MINUTES=60
GCS_ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/webp
GCS_ALLOWED_VIDEO_TYPES=video/mp4,video/webm
GCS_MAX_IMAGE_MB=10
GCS_MAX_VIDEO_MB=1024
SMTP_PORT=587
SMTP_STARTTLS=true
```

No agregar IPs de Cloud SQL, Redis o VMs. El workflow las obtiene con `gcloud` durante cada ejecucion.

## 13. Subir cambios y ejecutar CI/CD

El workflow `.github/workflows/deploy-develop.yml` se ejecuta con push a `develop` o manualmente desde `Actions`.

Flujo del workflow:

```text
ci-checks -> backup-cloud-sql -> build-and-push -> deploy -> smoke-test
```

Que hace cada etapa:

- `ci-checks`: compila frontend, API Gateway, Identity Service, ejecuta tests de Catalog y valida servicios Python con `compileall`.
- `backup-cloud-sql`: exporta `identity_db`, `subscription_db`, `catalog_db` y `engagement_db` al bucket.
- `build-and-push`: construye y sube imagenes a `ghcr.io/d3r3-k/sa_proyecto_g13`.
- `deploy`: copia `docker-compose.yml` y `.env` a las 3 VMs, corre migraciones de Identity y levanta contenedores.
- `smoke-test`: valida contenedores, puertos gRPC y frontend.

Subir cambios:

```powershell
git status
git add .env.example .github/workflows/deploy-develop.yml deploy infra proto apps services docs/configuraciones.md
git commit -m "feat: add gcs media upload flow"
git push origin HEAD
```

Crear PR hacia `develop`, aprobarlo y hacer merge. Al hacer merge, GitHub Actions ejecutara el despliegue.

Tambien se puede ejecutar manualmente:

1. Ir a `Actions`.
2. Seleccionar `Deploy develop to Compute Engine`.
3. Clic en `Run workflow`.
4. Seleccionar la rama que contiene el workflow.

## 14. Migraciones de bases de datos

Comportamiento final:

- `identity_db`: el workflow ejecuta los SQL de `services/identity-service/migrations` antes de levantar contenedores.
- `catalog_db`: el servicio aplica `services/catalog-service/migrations` al iniciar.
- `subscription_db`: el servicio inicializa su esquema al iniciar.
- `engagement_db`: el servicio aplica sus migraciones al iniciar.

Por eso no se debe crear tablas manualmente en Cloud SQL para el despliegue normal.

Si el workflow falla antes de `docker compose up`, revisar el job `Deploy docker compose files`.

## 15. Release con Kubernetes

Para release se recomienda crear otro GitHub Environment llamado `release`.

Usar los mismos nombres de secrets que `develop`, pero con valores productivos:

```text
GCP_SERVICE_ACCOUNT_KEY
GCS_BACKEND_SERVICE_ACCOUNT_KEY
GHCR_USERNAME
GHCR_TOKEN
JWT_SECRET
IDENTITY_DB_PASSWORD
SUBSCRIPTION_DB_PASSWORD
CATALOG_DB_PASSWORD
ENGAGEMENT_DB_PASSWORD
SMTP_HOST
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
```

Variables esperadas para `release`:

```text
GCP_PROJECT_ID=sa-derek-proyecto
GCP_REGION=us-central1
GCP_ZONE=us-central1-a
GKE_CLUSTER=qx-gke-release
GKE_NAMESPACE=quetxal-tv-release
GCS_BUCKET_NAME=qx-media-sa-derek-proyecto
SMTP_PORT=587
SMTP_STARTTLS=true
```

En Kubernetes:

- GitHub Secrets se convierten en Kubernetes `Secret`.
- GitHub Variables se convierten en Kubernetes `ConfigMap`.
- Imagenes GHCR se despliegan con tag de release.
