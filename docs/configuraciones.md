# Despliegue Develop en Google Cloud Platform

Esta guia prepara desde cero el entorno `develop` usando Google Cloud Platform con:

- 1 VPC con subred publica y subred privada.
- 3 VM de Compute Engine: frontend, API Gateway y microservicios.
- 1 instancia Cloud SQL PostgreSQL para las bases de datos relacionales.
- 1 instancia Memorystore Redis.
- 1 bucket de Cloud Storage para archivos multimedia.

Los comandos estan escritos para PowerShell.

## 0. Limpiar configuracion previa

Ejecutar esta seccion si el paso 5 fallo o si se desea reiniciar toda la infraestructura `qx-*`.

> Precaucion: estos comandos eliminan recursos de GCP. Verificar que el proyecto sea correcto antes de ejecutarlos.

```powershell
$env:PROJECT_ID="sa-derek-proyecto"
$env:REGION="us-central1"
$env:ZONE="us-central1-a"
$env:VPC_NAME="qx-vpc"
$env:BUCKET_NAME="qx-media-sa-derek-proyecto"

gcloud config set project $env:PROJECT_ID
gcloud config set compute/region $env:REGION
gcloud config set compute/zone $env:ZONE
```

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
```

Si algun recurso no existe, `gcloud` mostrara error. Continuar con el siguiente comando.

Validar que no queden recursos `qx-*`:

```powershell
gcloud compute instances list --filter="name~qx-"
gcloud redis instances list --region=$env:REGION
gcloud sql instances list
gcloud compute firewall-rules list --filter="name~qx-"
gcloud compute networks list --filter="name=$env:VPC_NAME"
gcloud compute addresses list --global --filter="name~qx-.*-range"
gcloud storage buckets list --filter="name:$env:BUCKET_NAME"
```

## 1. Configurar cuenta y proyecto

```powershell
gcloud auth login
gcloud init

$env:PROJECT_ID="sa-derek-proyecto"
$env:REGION="us-central1"
$env:ZONE="us-central1-a"
$env:VPC_NAME="qx-vpc"
$env:BUCKET_NAME="qx-media-sa-derek-proyecto"

gcloud config set project $env:PROJECT_ID
gcloud config set compute/region $env:REGION
gcloud config set compute/zone $env:ZONE
```

## 2. Activar APIs requeridas

```powershell
gcloud services enable compute.googleapis.com
gcloud services enable servicenetworking.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable iam.googleapis.com
```

## 3. Crear red base

```powershell
gcloud compute networks create $env:VPC_NAME --subnet-mode=custom --bgp-routing-mode=regional
gcloud compute networks subnets create qx-subnet-public --network=$env:VPC_NAME --range=10.0.1.0/24 --region=$env:REGION
gcloud compute networks subnets create qx-subnet-private --network=$env:VPC_NAME --range=10.0.2.0/24 --region=$env:REGION --enable-private-ip-google-access
```

## 4. Crear Cloud NAT para VMs privadas

Las VMs privadas no tienen IP publica. Cloud NAT permite instalar paquetes y descargar imagenes Docker desde internet.

```powershell
gcloud compute routers create qx-router --network=$env:VPC_NAME --region=$env:REGION
gcloud compute routers nats create qx-nat --router=qx-router --region=$env:REGION --nat-all-subnet-ip-ranges --auto-allocate-nat-external-ips
```

## 5. Crear acceso privado a servicios

Cloud SQL y Memorystore se conectaran por IP privada usando Private Service Access.

```powershell
gcloud compute addresses create qx-db-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango para Cloud SQL y Redis" --network=$env:VPC_NAME
gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com --ranges=qx-db-range --network=$env:VPC_NAME --project=$env:PROJECT_ID
```

Nota: se usa `/20` para evitar que Cloud SQL consuma el rango completo y Memorystore falle por espacio agotado.

## 6. Crear Cloud SQL PostgreSQL

Definir contrasenas antes de ejecutar. No subir estos valores al repositorio.

```powershell
$env:POSTGRES_ROOT_PASSWORD="admin1234"
$env:IDENTITY_DB_PASSWORD="admin1234"
$env:SUBSCRIPTION_DB_PASSWORD="admin1234"
$env:CATALOG_DB_PASSWORD="admin1234"
$env:ENGAGEMENT_DB_PASSWORD="admin1234"
```

Crear la instancia. Se usa `--edition=ENTERPRISE` para evitar el error de tier de `ENTERPRISE_PLUS`.

```powershell
gcloud sql instances create qx-postgres --database-version=POSTGRES_16 --edition=ENTERPRISE --cpu=1 --memory=4GB --region=$env:REGION --network=$env:VPC_NAME --no-assign-ip --root-password=$env:POSTGRES_ROOT_PASSWORD --availability-type=ZONAL --storage-size=20GB --storage-type=SSD --backup-start-time=03:00
```

Crear bases de datos del proyecto:

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

Obtener la IP privada de Cloud SQL:

```powershell
$env:CLOUD_SQL_PRIVATE_IP=(gcloud sql instances describe qx-postgres --format="value(ipAddresses[0].ipAddress)")
Write-Output $env:CLOUD_SQL_PRIVATE_IP
```

## 7. Crear Memorystore Redis

```powershell
gcloud redis instances create qx-redis --size=1 --region=$env:REGION --network=$env:VPC_NAME --connect-mode=PRIVATE_SERVICE_ACCESS --redis-version=redis_7_0 --tier=basic
```

Si aparece el error `The allocated private IP address space is exhausted`, agregar un rango adicional al peering y reintentar:

```powershell
gcloud redis instances delete qx-redis --region=$env:REGION --quiet
gcloud compute addresses create qx-redis-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango adicional para Memorystore Redis" --network=$env:VPC_NAME
gcloud services vpc-peerings update --service=servicenetworking.googleapis.com --ranges="qx-db-range,qx-redis-range" --network=$env:VPC_NAME --force
gcloud redis instances create qx-redis --size=1 --region=$env:REGION --network=$env:VPC_NAME --connect-mode=PRIVATE_SERVICE_ACCESS --redis-version=redis_7_0 --tier=basic
```

Obtener host y puerto:

```powershell
$env:REDIS_HOST=(gcloud redis instances describe qx-redis --region=$env:REGION --format="value(host)")
$env:REDIS_PORT=(gcloud redis instances describe qx-redis --region=$env:REGION --format="value(port)")
Write-Output "$env:REDIS_HOST`:$env:REDIS_PORT"
```

## 8. Crear bucket de Cloud Storage

```powershell
gcloud storage buckets create gs://$env:BUCKET_NAME --location=$env:REGION --uniform-bucket-level-access --public-access-prevention
```

Dar permisos de escritura al service account por defecto de Compute Engine:

```powershell
$env:PROJECT_NUMBER=(gcloud projects describe $env:PROJECT_ID --format="value(projectNumber)")
$env:COMPUTE_SA="$env:PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:COMPUTE_SA" --role="roles/storage.objectAdmin"
```

## 9. Crear maquinas virtuales

Crear VM publica para frontend:

```powershell
gcloud compute instances create qx-vm-frontend --zone=$env:ZONE --machine-type=e2-micro --network=$env:VPC_NAME --subnet=qx-subnet-public --tags="frontend,http-server" --image-family=debian-12 --image-project=debian-cloud
```

Crear VM privada para API Gateway:

```powershell
gcloud compute instances create qx-vm-gateway --zone=$env:ZONE --machine-type=e2-small --network=$env:VPC_NAME --subnet=qx-subnet-private --tags="gateway" --no-address --image-family=debian-12 --image-project=debian-cloud
```

Crear VM privada para microservicios:

```powershell
gcloud compute instances create qx-vm-services --zone=$env:ZONE --machine-type=e2-medium --network=$env:VPC_NAME --subnet=qx-subnet-private --tags="services" --no-address --image-family=debian-12 --image-project=debian-cloud
```

Obtener IPs internas y externa:

```powershell
gcloud compute instances list --filter="name~qx-vm-" --format="table(name,zone,networkInterfaces[0].networkIP,networkInterfaces[0].accessConfigs[0].natIP,status)"
```

## 10. Crear reglas de firewall

```powershell
gcloud compute firewall-rules create qx-allow-internal --network=$env:VPC_NAME --allow="tcp,udp,icmp" --source-ranges="10.0.1.0/24,10.0.2.0/24"
gcloud compute firewall-rules create qx-allow-iap-ssh --network=$env:VPC_NAME --allow="tcp:22" --source-ranges="35.235.240.0/20"
gcloud compute firewall-rules create qx-allow-http --network=$env:VPC_NAME --allow=tcp:80 --target-tags=http-server
gcloud compute firewall-rules create qx-allow-gateway --network=$env:VPC_NAME --allow="tcp:3000" --source-ranges="10.0.1.0/24" --target-tags=gateway
gcloud compute firewall-rules create qx-allow-grpc-services --network=$env:VPC_NAME --allow="tcp:50051-50057" --source-ranges="10.0.2.0/24" --target-tags=services
```

## 11. Preparar Docker en cada VM

Conectar por IAP:

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

Entrar nuevamente a la VM despues de `usermod`.

Validar dentro de cada VM:

```bash
docker --version
docker compose version
```

## 12. Configurar GitHub Environment `develop`

Para despliegue con CI/CD no se crean archivos `.env` manualmente en las VMs. El workflow `.github/workflows/deploy-develop.yml` genera los `.env` usando GitHub Environments y los copia por IAP.

Crear el environment:

1. Entrar a `Settings > Environments`.
2. Crear `develop`.
3. Agregar los Secrets y Variables de las siguientes secciones dentro de ese environment.

### 12.1 Obtener valores desde GCP

Configurar variables locales:

```powershell
$env:PROJECT_ID="sa-derek-proyecto"
$env:REGION="us-central1"
$env:ZONE="us-central1-a"

gcloud config set project $env:PROJECT_ID
gcloud config set compute/region $env:REGION
gcloud config set compute/zone $env:ZONE
```

Obtener proyecto, region y zona:

```powershell
gcloud config get-value project
gcloud config get-value compute/region
gcloud config get-value compute/zone
```

Obtener IP privada de Cloud SQL:

```powershell
gcloud sql instances describe qx-postgres --format="value(ipAddresses[0].ipAddress)"
```

Obtener host y puerto de Redis:

```powershell
gcloud redis instances describe qx-redis --region=$env:REGION --format="value(host)"
gcloud redis instances describe qx-redis --region=$env:REGION --format="value(port)"
```

Obtener IPs de las VMs:

```powershell
gcloud compute instances list --filter="name~qx-vm-" --format="table(name,networkInterfaces[0].networkIP,networkInterfaces[0].accessConfigs[0].natIP)"
```

Obtener bucket:

```powershell
gcloud storage buckets list
```

Obtener numero de proyecto:

```powershell
gcloud projects describe $env:PROJECT_ID --format="value(projectNumber)"
```

Generar un `JWT_SECRET`:

```powershell
[System.Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 12.2 Crear cuenta de servicio para GitHub Actions

```powershell
$env:PROJECT_ID="sa-derek-proyecto"
$env:CICD_SA_NAME="github-actions-deploy"
$env:CICD_SA="$env:CICD_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create $env:CICD_SA_NAME --display-name="GitHub Actions Deploy"
```

Asignar permisos:

```powershell
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/compute.instanceAdmin.v1"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/iap.tunnelResourceAccessor"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/compute.osAdminLogin"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/cloudsql.admin"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/redis.viewer"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/storage.objectViewer"
```

Permitir que GitHub Actions use el service account asignado a las VMs de Compute Engine:

```powershell
$env:PROJECT_NUMBER=(gcloud projects describe $env:PROJECT_ID --format="value(projectNumber)")
$env:COMPUTE_SA="$env:PROJECT_NUMBER-compute@developer.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding $env:COMPUTE_SA --member="serviceAccount:$env:CICD_SA" --role="roles/iam.serviceAccountUser" --project=$env:PROJECT_ID
```

Dar permiso al service account de Cloud SQL para escribir exports en el bucket:

```powershell
$env:CLOUD_SQL_SA=(gcloud sql instances describe qx-postgres --format="value(serviceAccountEmailAddress)")
gcloud storage buckets add-iam-policy-binding gs://qx-media-sa-derek-proyecto --member="serviceAccount:$env:CLOUD_SQL_SA" --role="roles/storage.objectCreator"
```

Crear llave JSON. El contenido del archivo se guarda como Secret `GCP_SERVICE_ACCOUNT_KEY` en el environment `develop`.

```powershell
gcloud iam service-accounts keys create gcp-github-actions-key.json --iam-account=$env:CICD_SA
Get-Content -Raw .\gcp-github-actions-key.json
```

Despues de copiarlo a GitHub, eliminar el archivo local:

```powershell
Remove-Item .\gcp-github-actions-key.json
```

### 12.3 Secrets del environment `develop`

Crear estos valores en `Settings > Environments > develop > Environment secrets`:

```text
GCP_SERVICE_ACCOUNT_KEY
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

Descripcion de valores:

- `GCP_SERVICE_ACCOUNT_KEY`: JSON de la cuenta de servicio creada en el paso 12.2.
- `GHCR_USERNAME`: usuario de GitHub con acceso a GHCR.
- `GHCR_TOKEN`: token personal de GitHub con permiso `read:packages`.
- `JWT_SECRET`: cadena aleatoria generada en el paso 12.1.
- `IDENTITY_DB_PASSWORD`: password usado al crear `identity_user`.
- `SUBSCRIPTION_DB_PASSWORD`: password usado al crear `subscription_user`.
- `CATALOG_DB_PASSWORD`: password usado al crear `catalog_user`.
- `ENGAGEMENT_DB_PASSWORD`: password usado al crear `engagement_user`.
- `SMTP_*`: valores del proveedor de correo. Si no se usara correo real, dejar `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD` vacios y `SMTP_FROM` con `no-reply@quetxaltv.com`.

### 12.4 Variables del environment `develop`

Crear estos valores en `Settings > Environments > develop > Environment variables`:

```text
GCP_PROJECT_ID=sa-derek-proyecto
GCP_REGION=us-central1
GCP_ZONE=us-central1-a
VM_FRONTEND_NAME=qx-vm-frontend
VM_GATEWAY_NAME=qx-vm-gateway
VM_SERVICES_NAME=qx-vm-services
GCS_BUCKET_NAME=qx-media-sa-derek-proyecto
SMTP_PORT=587
SMTP_STARTTLS=true
```

No es necesario guardar IPs de Cloud SQL, Redis o VMs como variables de GitHub. El workflow las consulta con `gcloud` en cada ejecucion.

## 13. Ejecutar CI/CD de `develop`

El workflow `.github/workflows/deploy-develop.yml` realiza:

- Validacion CI de frontend, API Gateway, Identity Service, Catalog Service y servicios Python.
- Backup de las bases de datos operacionales en Cloud Storage.
- Build de imagenes Docker.
- Push de imagenes a GHCR.
- Consulta de IPs reales de Cloud SQL, Redis y VMs.
- Generacion de `.env` para servicios, gateway y frontend.
- Copia de `docker-compose.yml` y `.env` a cada VM usando IAP.
- `sudo docker compose pull` y `sudo docker compose up -d` en cada VM.
- Smoke test de contenedores y frontend.

Orden de ejecucion:

```text
ci-checks -> backup-cloud-sql -> build-and-push -> deploy -> smoke-test
```

Nota: el requisito de cobertura minima del 75% queda pendiente hasta agregar pruebas unitarias reales de backend. El workflow ya corta el despliegue si falla compilacion, tests disponibles, backup, build, deploy o smoke test.

Se ejecuta automaticamente con cada push a `develop`.

Tambien se puede ejecutar manualmente:

1. Ir a `Actions`.
2. Seleccionar `Deploy develop to Compute Engine`.
3. Ejecutar `Run workflow`.

Validar en GCP:

```powershell
gcloud compute ssh qx-vm-services --tunnel-through-iap --zone=$env:ZONE --command="cd ~/quetxal-tv/services && sudo docker compose ps"
gcloud compute ssh qx-vm-gateway --tunnel-through-iap --zone=$env:ZONE --command="cd ~/quetxal-tv/gateway && sudo docker compose ps"
gcloud compute ssh qx-vm-frontend --tunnel-through-iap --zone=$env:ZONE --command="cd ~/quetxal-tv/frontend && sudo docker compose ps"
```

## 14. Despliegue manual opcional

Esta seccion solo aplica si se necesita probar sin GitHub Actions. En el flujo normal de CI/CD, omitirla.

Crear `.env` en la VM de servicios:

```bash
cat > .env << 'EOF'
NODE_ENV=production
JWT_SECRET=CAMBIAR_JWT_SECRET
JWT_EXPIRES_IN=1d

IDENTITY_GRPC_HOST=0.0.0.0
IDENTITY_GRPC_PORT=50051
FX_GRPC_PORT=50052
SUBSCRIPTION_GRPC_PORT=50053
NOTIFICATION_GRPC_PORT=50054
CATALOG_GRPC_PORT=50055
ENGAGEMENT_GRPC_PORT=50056
PAYMENT_GRPC_PORT=50057

IDENTITY_DB_HOST=IP_PRIVADA_CLOUD_SQL
IDENTITY_DB_PORT=5432
IDENTITY_DB_NAME=identity_db
IDENTITY_DB_USER=identity_user
IDENTITY_DB_PASSWORD=CAMBIAR_IDENTITY_PASSWORD

DB_HOST=IP_PRIVADA_CLOUD_SQL
DB_PORT=5432
DB_NAME=identity_db
DB_USER=identity_user
DB_PASSWORD=CAMBIAR_IDENTITY_PASSWORD

SUBSCRIPTION_DATABASE_URL=postgresql://subscription_user:CAMBIAR_SUBSCRIPTION_PASSWORD@IP_PRIVADA_CLOUD_SQL:5432/subscription_db
CATALOG_DATABASE_URL=postgresql://catalog_user:CAMBIAR_CATALOG_PASSWORD@IP_PRIVADA_CLOUD_SQL:5432/catalog_db
ENGAGEMENT_DATABASE_URL=postgresql://engagement_user:CAMBIAR_ENGAGEMENT_PASSWORD@IP_PRIVADA_CLOUD_SQL:5432/engagement_db

REDIS_URL=redis://IP_PRIVADA_REDIS:6379/0
NOTIFICATION_QUEUE_NAME=notification:queue
FX_CACHE_TTL=3600
FX_API_BASE_URL=https://api.frankfurter.dev/v2

GCS_BUCKET_NAME=qx-media-sa-derek-proyecto
GOOGLE_CLOUD_PROJECT=sa-derek-proyecto

PAYMENT_PROVIDER_NAME=QuetxalPay Sandbox
PAYMENT_APPROVAL_DELAY_MS=500

SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=no-reply@quetxaltv.com
SMTP_STARTTLS=true
EOF
```

Crear `.env` en la VM del API Gateway:

```bash
cat > .env << 'EOF'
NODE_ENV=production
API_GATEWAY_PORT=3000
FRONTEND_URL=http://IP_PUBLICA_FRONTEND
JWT_SECRET=CAMBIAR_JWT_SECRET
COOKIE_NAME=access_token
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax

IDENTITY_GRPC_URL=IP_INTERNA_SERVICES:50051
FX_GRPC_URL=IP_INTERNA_SERVICES:50052
SUBSCRIPTION_GRPC_URL=IP_INTERNA_SERVICES:50053
NOTIFICATION_GRPC_URL=IP_INTERNA_SERVICES:50054
CATALOG_GRPC_URL=IP_INTERNA_SERVICES:50055
ENGAGEMENT_GRPC_URL=IP_INTERNA_SERVICES:50056
PAYMENT_GRPC_URL=IP_INTERNA_SERVICES:50057
EOF
```

Crear `.env` en la VM del frontend:

```bash
cat > .env << 'EOF'
WEB_PORT=80
API_GATEWAY_UPSTREAM=IP_INTERNA_GATEWAY:3000
EOF
```

Reemplazar:

- `IP_PRIVADA_CLOUD_SQL` por la IP de `qx-postgres`.
- `IP_PRIVADA_REDIS` por la IP de `qx-redis`.
- `IP_INTERNA_SERVICES` por la IP interna de `qx-vm-services`.
- `IP_INTERNA_GATEWAY` por la IP interna de `qx-vm-gateway`.
- `IP_PUBLICA_FRONTEND` por la IP publica de `qx-vm-frontend`.

Si las imagenes son privadas, iniciar sesion en GHCR dentro de cada VM:

```bash
echo "GHCR_TOKEN" | docker login ghcr.io -u "GHCR_USERNAME" --password-stdin
```

Copiar el `docker-compose.yml` correspondiente a cada VM y ejecutar:

```bash
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

## 15. Configurar GitHub Environment `release`

Para Kubernetes se recomienda crear otro environment llamado `release`.

Usar los mismos nombres de Secrets y Variables que `develop`, pero con valores del entorno de GKE.

Secrets esperados:

```text
GCP_SERVICE_ACCOUNT_KEY
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

Variables esperadas:

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

Uso en `release`:

- Secrets de GitHub -> Kubernetes `Secret`.
- Variables de GitHub -> Kubernetes `ConfigMap`.
- Imagenes GHCR con tag semantico -> Deployments de Kubernetes.

## 16. Validacion final

```powershell
gcloud compute instances list --filter="name~qx-vm-"
gcloud sql instances describe qx-postgres --format="table(name,state,region,ipAddresses[0].ipAddress)"
gcloud redis instances describe qx-redis --region=$env:REGION --format="table(name,state,host,port)"
gcloud storage buckets describe gs://$env:BUCKET_NAME
```
