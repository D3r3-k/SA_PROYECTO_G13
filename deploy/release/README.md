# Deploy Release en Google Kubernetes Engine

Esta guia describe el despliegue de produccion para la rama `release` usando Google Cloud Platform, `gcloud`, Google Kubernetes Engine (GKE) y GitHub Actions.

El objetivo es dejar documentado el proceso completo desde cero, incluyendo VPC, Cloud SQL, Memorystore Redis, Cloud Storage, GKE, Kubernetes, Ingress, CI/CD, rollout y rollback.

> [!IMPORTANT]
> El entorno de producción (`release`) es completamente independiente del de desarrollo (`develop`). Ningún recurso o dato es compartido entre ambos ambientes.

## Arquitectura del entorno
 
| Componente     | Recurso GCP / Kubernetes                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| Orquestacion   | Google Kubernetes Engine (`prod-gke-release`)                                             |
| Namespace      | `quetxal-tv-prod`                                                                         |
| Acceso externo | Ingress HTTPS con IP estatica (`prod-release-ingress-ip`)                                 |
| Servicios      | Kubernetes Services tipo `ClusterIP`                                                      |
| Bases de datos | Cloud SQL PostgreSQL 16 (`identity_db`, `subscription_db`, `catalog_db`, `engagement_db`) |
| Cache / Colas  | Memorystore Redis 7 (`prod-redis`)                                                        |
| Almacenamiento | Cloud Storage bucket `prod-media-sa-derek-proyecto`                                       |
| Configuracion  | Kubernetes `ConfigMap`                                                                    |
| Secretos       | Kubernetes `Secret` + GitHub Environment `release`                                        |
| CI/CD          | GitHub Actions sobre rama `release`                                                       |
| Imagenes       | GHCR (`ghcr.io/d3r3-k/sa_proyecto_g13`)                                                   |

> [!NOTE]
> Todos los comandos de esta guia estan escritos para PowerShell en Windows.

## HTTPS mediante IP publica

El workflow instala cert-manager 1.20.2 y solicita a Let’s Encrypt un certificado `shortlived` para la IP global `prod-release-ingress-ip`. cert-manager guarda y renueva la clave y el certificado en un Secret TLS; ninguna clave privada pasa por GitHub Actions.

Configure en el GitHub Environment `release`:

| Variable | Valor inicial |
| -------- | ------------- |
| `ACME_EMAIL` | Correo operativo para la cuenta ACME |
| `ACME_ENVIRONMENT` | `staging` |

Ejecute una primera entrega con `staging`. Después de verificar `Certificate Ready=True`, cambie la variable a `production` y repita el despliegue. El Ingress cambia al Secret `quetxal-tv-tls-production` y elimina los recursos staging.

Diagnostico:

```powershell
kubectl get clusterissuer
kubectl get certificate,certificaterequest,order,challenge -n quetxal-tv-prod
kubectl describe certificate quetxal-tv-ip-production -n quetxal-tv-prod
kubectl describe ingress quetxal-tv-ingress -n quetxal-tv-prod
```

El puerto 80 permanece habilitado para HTTP-01 y redirige el trafico normal a HTTPS. `/healthz` queda excluido de la redireccion para las comprobaciones del balanceador.

---

## Paso 0. Instalar y autenticarse en gcloud

Si es la primera vez, instale el SDK de Google Cloud desde https://cloud.google.com/sdk/docs/install, luego autentiquese y configure el proyecto:

```powershell
gcloud auth login
gcloud init
```

A continuacion, defina las variables de entorno que se usaran a lo largo de toda esta guia. Ejecute este bloque completo en la misma sesion de PowerShell (asegurese de cambiar los valores indicados con contrasenas seguras):

```powershell
# Variables de Proyecto e Infraestructura
$env:PROJECT_ID="sa-derek-proyecto"
$env:REGION="us-central1"
$env:ZONE="us-central1-a"
$env:VPC_NAME="prod-vpc"
$env:PUBLIC_SUBNET_NAME="prod-subnet-public"
$env:PRIVATE_SUBNET_NAME="prod-subnet-private"
$env:GKE_SUBNET_NAME="prod-subnet-gke-release"
$env:BUCKET_NAME="prod-media-sa-derek-proyecto"
$env:GKE_CLUSTER_NAME="prod-gke-release"
$env:GKE_NAMESPACE="quetxal-tv-prod"
$env:INGRESS_IP_NAME="prod-release-ingress-ip"

# Service Accounts
$env:CICD_SA_NAME="github-actions-prod"
$env:CICD_SA="$env:CICD_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"
$env:MEDIA_SA_NAME="prod-catalog-media-signer"
$env:MEDIA_SA="$env:MEDIA_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"

# Variables de Recursos GCP
$env:CLOUD_SQL_INSTANCE="prod-postgres"
$env:REDIS_INSTANCE="prod-redis"

# Contraseñas de Base de Datos (Definir aquí para su uso en toda la guía)
$env:POSTGRES_ROOT_PASSWORD="admin1234"
$env:IDENTITY_DB_PASSWORD="admin1234"
$env:SUBSCRIPTION_DB_PASSWORD="admin1234"
$env:CATALOG_DB_PASSWORD="admin1234"
$env:ENGAGEMENT_DB_PASSWORD="admin1234"

# Configurar gcloud CLI
gcloud config set project $env:PROJECT_ID
gcloud config set compute/region $env:REGION
gcloud config set compute/zone $env:ZONE

# Recomendado: Configurar DNS Zonal y habilitar OS Login para evitar warnings y fallos de metadatos SSH
gcloud compute project-info add-metadata --metadata default-dns-type=zonal
gcloud compute project-info add-metadata --metadata enable-oslogin=TRUE
```

> [!IMPORTANT]
> Las variables `$env:*` no persisten entre sesiones de PowerShell. Si se cierra la terminal, debe volver a ejecutar el bloque anterior.

---

## Paso 1. Activar APIs de GCP

Habilite los servicios requeridos para Compute Engine, Cloud SQL, Redis, Cloud Storage, IAM y GKE:

```powershell
gcloud services enable compute.googleapis.com
gcloud services enable servicenetworking.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable iam.googleapis.com
gcloud services enable container.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

---

## Paso 2. Crear red, subredes, NAT, acceso privado e IP estática de Ingress

Cree la VPC personalizada:

```powershell
gcloud compute networks create $env:VPC_NAME --subnet-mode=custom --bgp-routing-mode=regional
```

Cree las subredes base:

```powershell
gcloud compute networks subnets create $env:PUBLIC_SUBNET_NAME --network=$env:VPC_NAME --range=10.0.1.0/24 --region=$env:REGION
gcloud compute networks subnets create $env:PRIVATE_SUBNET_NAME --network=$env:VPC_NAME --range=10.0.2.0/24 --region=$env:REGION --enable-private-ip-google-access
```

Cree Cloud Router y Cloud NAT para permitir salida a internet desde recursos privados:

```powershell
gcloud compute routers create prod-router --network=$env:VPC_NAME --region=$env:REGION
gcloud compute routers nats create prod-nat --router=prod-router --region=$env:REGION --nat-all-subnet-ip-ranges --auto-allocate-nat-external-ips
```

Configure Private Service Access para Cloud SQL y Redis reservando los rangos correspondientes de antemano:

```powershell
gcloud compute addresses create prod-db-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango para Cloud SQL" --network=$env:VPC_NAME
gcloud compute addresses create prod-redis-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango para Memorystore Redis" --network=$env:VPC_NAME
gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com --ranges="prod-db-range,prod-redis-range" --network=$env:VPC_NAME --project=$env:PROJECT_ID
```

Reserve de una vez la IP global estática para el Ingress de producción (se utilizará en la configuración de CORS del Paso 5):

```powershell
gcloud compute addresses create $env:INGRESS_IP_NAME --global
```

---

## Paso 3. Crear Cloud SQL PostgreSQL desde cero

Cree la instancia:

```powershell
gcloud sql instances create $env:CLOUD_SQL_INSTANCE --database-version=POSTGRES_16 --edition=ENTERPRISE --cpu=1 --memory=4GB --region=$env:REGION --network=$env:VPC_NAME --no-assign-ip --root-password=$env:POSTGRES_ROOT_PASSWORD --availability-type=ZONAL --storage-size=20GB --storage-type=SSD --backup-start-time=03:00
```

Cree las bases de datos:

```powershell
gcloud sql databases create identity_db --instance=$env:CLOUD_SQL_INSTANCE
gcloud sql databases create subscription_db --instance=$env:CLOUD_SQL_INSTANCE
gcloud sql databases create catalog_db --instance=$env:CLOUD_SQL_INSTANCE
gcloud sql databases create engagement_db --instance=$env:CLOUD_SQL_INSTANCE
```

Cree los usuarios:

```powershell
gcloud sql users create identity_user --instance=$env:CLOUD_SQL_INSTANCE --password=$env:IDENTITY_DB_PASSWORD
gcloud sql users create subscription_user --instance=$env:CLOUD_SQL_INSTANCE --password=$env:SUBSCRIPTION_DB_PASSWORD
gcloud sql users create catalog_user --instance=$env:CLOUD_SQL_INSTANCE --password=$env:CATALOG_DB_PASSWORD
gcloud sql users create engagement_user --instance=$env:CLOUD_SQL_INSTANCE --password=$env:ENGAGEMENT_DB_PASSWORD
```

Obtenga la IP privada, ya que se usara mas adelante para validar la conexion:

```powershell
gcloud sql instances describe $env:CLOUD_SQL_INSTANCE --format="value(ipAddresses[0].ipAddress)"
```

---

## Paso 4. Crear Memorystore Redis desde cero

Cree la instancia Memorystore Redis:

```powershell
gcloud redis instances create $env:REDIS_INSTANCE --size=1 --region=$env:REGION --network=$env:VPC_NAME --connect-mode=PRIVATE_SERVICE_ACCESS --redis-version=redis_7_0 --tier=basic
```

Obtenga host y puerto:

```powershell
gcloud redis instances describe $env:REDIS_INSTANCE --region=$env:REGION --format="value(host)"
gcloud redis instances describe $env:REDIS_INSTANCE --region=$env:REGION --format="value(port)"
```

---

## Paso 5. Crear bucket de Cloud Storage y configurar CORS

Cree el bucket privado:

```powershell
gcloud storage buckets create gs://$env:BUCKET_NAME --location=$env:REGION --uniform-bucket-level-access --public-access-prevention
```

Cree el service account que firma URLs para `catalog-service`:

```powershell
gcloud iam service-accounts create $env:MEDIA_SA_NAME --display-name="Catalog Media Signer"
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:MEDIA_SA" --role="roles/storage.objectAdmin"
```

> [!IMPORTANT]
> La llave privada de esta cuenta de servicio se generará en el Paso 10.3 para ser configurada como secret `GCS_BACKEND_SERVICE_ACCOUNT_KEY` en GitHub Environment `release`.

Obtenga la IP de Ingress previamente reservada y configure CORS usando interpolación de variables en PowerShell:

```powershell
$env:INGRESS_IP=(gcloud compute addresses describe $env:INGRESS_IP_NAME --global --format="value(address)")

@"
[
  {
    "origin": [
      "http://localhost:5173",
      "https://localhost:5173",
      "http://$env:INGRESS_IP"
    ],
    "method": ["GET", "PUT", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Length", "x-goog-content-length-range"],
    "maxAgeSeconds": 3600
  }
]
"@ | Set-Content -Encoding utf8 .\cors.json

gcloud storage buckets update gs://$env:BUCKET_NAME --cors-file=.\cors.json
Remove-Item .\cors.json
```

> [!WARNING]
> El bucket debe permanecer privado. No agregue permisos `allUsers` ni lectura publica. La aplicacion usa URLs firmadas.

---

## Paso 6. Validar creación de recursos

Valide que los recursos creados estén disponibles:

```powershell
gcloud compute networks describe $env:VPC_NAME
gcloud sql instances describe $env:CLOUD_SQL_INSTANCE
gcloud redis instances describe $env:REDIS_INSTANCE --region=$env:REGION
gcloud storage buckets describe gs://$env:BUCKET_NAME
```

Obtenga los valores que usara el pipeline:

```powershell
$env:CLOUD_SQL_PRIVATE_IP=(gcloud sql instances describe $env:CLOUD_SQL_INSTANCE --format="value(ipAddresses[0].ipAddress)")
$env:REDIS_HOST=(gcloud redis instances describe $env:REDIS_INSTANCE --region=$env:REGION --format="value(host)")
$env:REDIS_PORT=(gcloud redis instances describe $env:REDIS_INSTANCE --region=$env:REGION --format="value(port)")

Write-Host "Cloud SQL IP: $env:CLOUD_SQL_PRIVATE_IP"
Write-Host "Redis: $($env:REDIS_HOST):$($env:REDIS_PORT)"
Write-Host "Ingress IP: $env:INGRESS_IP"
```

---

## Paso 7. Crear subred dedicada para GKE release

GKE necesita una subred con rangos secundarios para Pods y Services:

```powershell
gcloud compute networks subnets create $env:GKE_SUBNET_NAME --network=$env:VPC_NAME --region=$env:REGION --range=10.0.3.0/24 --enable-private-ip-google-access --secondary-range="prod-gke-pods=10.10.0.0/16,prod-gke-services=10.20.0.0/20"
```

---

## Paso 8. Crear cluster GKE release

Cree el cluster GKE con IP alias, nodos privados y autoscaling basico:

```powershell
gcloud container clusters create $env:GKE_CLUSTER_NAME `
  --region=$env:REGION `
  --network=$env:VPC_NAME `
  --subnetwork=$env:GKE_SUBNET_NAME `
  --enable-ip-alias `
  --cluster-secondary-range-name=prod-gke-pods `
  --services-secondary-range-name=prod-gke-services `
  --enable-private-nodes `
  --master-ipv4-cidr=172.16.0.0/28 `
  --num-nodes=1 `
  --machine-type=e2-small `
  --enable-autoscaling `
  --min-nodes=1 `
  --max-nodes=3
```

---

## Paso 9. Conectar kubectl y crear namespace

Instale el plugin de autenticacion requerido por GKE para `kubectl`:

```powershell
gcloud components install gke-gcloud-auth-plugin
$env:USE_GKE_GCLOUD_AUTH_PLUGIN="True"
[Environment]::SetEnvironmentVariable("USE_GKE_GCLOUD_AUTH_PLUGIN", "True", "User")
gke-gcloud-auth-plugin --version
```

Obtenga credenciales del cluster:

```powershell
gcloud container clusters get-credentials $env:GKE_CLUSTER_NAME --region=$env:REGION --project=$env:PROJECT_ID
```

Cree el namespace:

```powershell
kubectl create namespace $env:GKE_NAMESPACE
```

Valide:

```powershell
kubectl get namespaces
kubectl get nodes
```

> [!TIP]
> Si `kubectl` o GitHub Actions muestran timeout (i/o timeout) contra la IP del master, abra el acceso al plano de control a todas las IPs para evitar problemas con los runners de GitHub (el cluster seguira protegido por autenticacion de Service Account):
> ```powershell
> gcloud container clusters update $env:GKE_CLUSTER_NAME --region=$env:REGION --enable-master-authorized-networks --master-authorized-networks=0.0.0.0/0
> ```

---

## Paso 10. Configurar GitHub Environment release

El pipeline automatizado requiere que los secretos y variables maestras vivan en GitHub.

### 10.1 Crear el service account para GitHub Actions release

Este Service Account es el que usará el pipeline de CI/CD de GitHub para conectarse a GCP y desplegar automáticamente.

Cree el service account:

```powershell
gcloud iam service-accounts create $env:CICD_SA_NAME --display-name="GitHub Actions Release Deploy"
```

Asigne los permisos necesarios:

```powershell
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/container.admin"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/cloudsql.admin"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/redis.viewer"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/storage.objectViewer"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/compute.networkViewer"
```

Permita que el service account de Cloud SQL de producción pueda escribir los backups en el bucket:

```powershell
$env:CLOUD_SQL_SA=(gcloud sql instances describe $env:CLOUD_SQL_INSTANCE --format="value(serviceAccountEmailAddress)")
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:CLOUD_SQL_SA" --role="roles/storage.objectCreator"
```

### 10.2 Crear el GitHub Environment

1. Dentro del repositorio en GitHub, vaya a **Settings > Environments**.
2. Cree un nuevo environment llamado `release`.
3. Agregue los secrets y variables siguientes.

### 10.3 Secrets requeridos

Agregar en **Settings > Environments > release > Environment secrets**:

| Secret                            | Descripcion                                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| `CATALOG_DB_PASSWORD`             | Contraseña del usuario `catalog_user`                                |
| `ENGAGEMENT_DB_PASSWORD`          | Contraseña del usuario `engagement_user`                             |
| `GCP_SERVICE_ACCOUNT_KEY`         | Llave privada JSON de la SA del CI/CD (`github-actions-prod`)        |
| `GCS_BACKEND_SERVICE_ACCOUNT_KEY` | Llave privada JSON de la SA del Catalog Media Signer (`prod-catalog-media-signer`) |
| `GHCR_TOKEN`                      | Personal Access Token con permiso `read:packages` y `write:packages` |
| `GHCR_USERNAME`                   | Usuario de GitHub                                                    |
| `IDENTITY_DB_PASSWORD`            | Contraseña del usuario `identity_user`                               |
| `JWT_SECRET`                      | Cadena aleatoria segura para firmar tokens JWT                       |
| `SMTP_FROM`                       | Correo remitente                                                     |
| `SMTP_HOST`                       | Host del servidor SMTP                                               |
| `SMTP_PASSWORD`                   | Password SMTP                                                        |
| `SMTP_USERNAME`                   | Usuario SMTP                                                         |
| `SUBSCRIPTION_DB_PASSWORD`        | Contraseña del usuario `subscription_user`                           |

#### Instrucciones para obtener o generar los valores de los Secrets:

* **Obtener `GCP_SERVICE_ACCOUNT_KEY`:**
  Ejecute en su PowerShell local para generar e imprimir la llave (copie todo el JSON impreso):
  ```powershell
  gcloud iam service-accounts keys create gcp-github-actions-release-key.json --iam-account=$env:CICD_SA
  Get-Content -Raw .\gcp-github-actions-release-key.json
  Remove-Item .\gcp-github-actions-release-key.json
  ```

* **Obtener `GCS_BACKEND_SERVICE_ACCOUNT_KEY`:**
  Ejecute en su PowerShell local para generar e imprimir la llave (copie todo el JSON impreso):
  ```powershell
  gcloud iam service-accounts keys create gcs-backend-service-account.json --iam-account=$env:MEDIA_SA
  Get-Content -Raw .\gcs-backend-service-account.json
  Remove-Item .\gcs-backend-service-account.json
  ```

* **Generar `JWT_SECRET`:**
  Ejecute en su PowerShell local para generar una clave aleatoria segura:
  ```powershell
  [System.Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
  ```

* **Consultar secretos desde su sesión activa de PowerShell:**
  ```powershell
  Write-Output "IDENTITY_DB_PASSWORD: $env:IDENTITY_DB_PASSWORD"
  Write-Output "SUBSCRIPTION_DB_PASSWORD: $env:SUBSCRIPTION_DB_PASSWORD"
  Write-Output "CATALOG_DB_PASSWORD: $env:CATALOG_DB_PASSWORD"
  Write-Output "ENGAGEMENT_DB_PASSWORD: $env:ENGAGEMENT_DB_PASSWORD"
  ```

### 10.4 Variables requeridas

Agregar en **Settings > Environments > release > Environment variables**:

| Variable                            | Valor Recomendado / Comando para obtener el valor                                         |
| :---------------------------------- | :---------------------------------------------------------------------------------------- |
| `ADMIN_EMAILS`                      | Correo(s) administrador separados por coma (e.g., `admin@example.com`)                    |
| `CLOUD_SQL_INSTANCE`                | `prod-postgres` *(Obtener con `$env:CLOUD_SQL_INSTANCE`)*                                 |
| `GCP_PROJECT_ID`                    | `sa-derek-proyecto` *(Obtener con `$env:PROJECT_ID` o `gcloud config get-value project`)* |
| `GCP_REGION`                        | `us-central1` *(Obtener con `$env:REGION`)*                                               |
| `GCP_ZONE`                          | `us-central1-a` *(Obtener con `$env:ZONE`)*                                               |
| `GCS_ALLOWED_IMAGE_TYPES`           | `image/jpeg,image/png,image/webp`                                                         |
| `GCS_ALLOWED_VIDEO_TYPES`           | `video/mp4,video/webm`                                                                    |
| `GCS_BUCKET_NAME`                   | `prod-media-sa-derek-proyecto` *(Obtener con `$env:BUCKET_NAME`)*                         |
| `GCS_MAX_IMAGE_MB`                  | `10`                                                                                      |
| `GCS_MAX_VIDEO_MB`                  | `1024`                                                                                    |
| `GCS_SIGNED_READ_EXPIRES_MINUTES`   | `60`                                                                                      |
| `GCS_SIGNED_UPLOAD_EXPIRES_MINUTES` | `15`                                                                                      |
| `GKE_CLUSTER_NAME`                  | `prod-gke-release` *(Obtener con `$env:GKE_CLUSTER_NAME`)*                                |
| `GKE_NAMESPACE`                     | `quetxal-tv-prod` *(Obtener con `$env:GKE_NAMESPACE`)*                                    |
| `GKE_SUBNET_NAME`                   | `prod-subnet-gke-release` *(Obtener con `$env:GKE_SUBNET_NAME`)*                          |
| `INGRESS_IP_NAME`                   | `prod-release-ingress-ip` *(Obtener con `$env:INGRESS_IP_NAME`)*                          |
| `REDIS_INSTANCE`                    | `prod-redis` *(Obtener con `$env:REDIS_INSTANCE`)*                                        |
| `SMTP_PORT`                         | `587`                                                                                     |
| `SMTP_STARTTLS`                     | `true`                                                                                    |
| `VPC_NAME`                          | `prod-vpc` *(Obtener con `$env:VPC_NAME`)*                                                |

#### Instrucciones para obtener los valores de las Variables:

* **Consultar variables de Proyecto e Infraestructura del Paso 0:**
  ```powershell
  Write-Output "GCP_PROJECT_ID: $env:PROJECT_ID"
  Write-Output "GCP_REGION: $env:REGION"
  Write-Output "GCP_ZONE: $env:ZONE"
  Write-Output "VPC_NAME: $env:VPC_NAME"
  ```

* **Consultar variables de Kubernetes y GKE del Paso 0:**
  ```powershell
  Write-Output "GKE_CLUSTER_NAME: $env:GKE_CLUSTER_NAME"
  Write-Output "GKE_NAMESPACE: $env:GKE_NAMESPACE"
  Write-Output "GKE_SUBNET_NAME: $env:GKE_SUBNET_NAME"
  ```

* **Consultar variables de Recursos de Almacenamiento y BD del Paso 0:**
  ```powershell
  Write-Output "CLOUD_SQL_INSTANCE: $env:CLOUD_SQL_INSTANCE"
  Write-Output "REDIS_INSTANCE: $env:REDIS_INSTANCE"
  Write-Output "GCS_BUCKET_NAME: $env:BUCKET_NAME"
  Write-Output "INGRESS_IP_NAME: $env:INGRESS_IP_NAME"
  ```

---

## Paso 11. Arquitectura de los Manifiestos de Kubernetes

El repositorio contiene los manifiestos de Kubernetes listos para producción en la ruta `deploy/release/k8s`. 
La estructura incluye los Deployments, Services (ClusterIP) y el Ingress:

```text
k8s/
  namespace.yml
  configmap.yml
  secrets.example.yml
  deployments/
    web.yml
    api-gateway.yml
    identity-service.yml
    fx-service.yml
    subscription-service.yml
    notification-service.yml
    catalog-service.yml
    engagement-service.yml
    payment-gateway-service.yml
  services/
    web.yml
    api-gateway.yml
    identity-service.yml
    fx-service.yml
    subscription-service.yml
    notification-service.yml
    catalog-service.yml
    engagement-service.yml
    payment-gateway-service.yml
  ingress.yml
```

Todos los Services internos son del tipo `ClusterIP`. No se exponen puertos de forma externa excepto mediante el recurso `Ingress`.

---

## Paso 12. Despliegue automatizado por CI/CD

El despliegue de produccion se ejecuta **100% de forma automatica** por CI/CD al empujar cambios o tags semánticos a la rama `release`.

El workflow configurado en `.github/workflows/deploy-release.yml` ejecuta la siguiente cadena:

```text
ci-checks -> backup-cloud-sql -> build-and-push -> migrate-databases -> deploy-gke -> smoke-test
```

| Etapa               | Que hace                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ci-checks`         | Compila frontend, gateway y servicios. Ejecuta pruebas unitarias.                                                   |
| `backup-cloud-sql`  | Exporta las bases de datos de producción al bucket de Cloud Storage.                                                |
| `build-and-push`    | Construye imagenes Docker y publica en GHCR.                                                                        |
| `migrate-databases` | Corre un Job efímero de Kubernetes para aplicar las migraciones SQL en cada base de datos usando túnel interno.     |
| `deploy-gke`        | **Crea dinamicamente ConfigMaps y Secrets**, y aplica manifests con `kubectl apply` en namespace `quetxal-tv-prod`. |
| `smoke-test`        | Valida Ingress con llamadas HTTP a la IP Publica del Balanceador Global.                                            |

---

## Paso 13. Verificacion del despliegue

Valide el estado del cluster en el namespace de producción:

```powershell
kubectl get nodes
kubectl get pods -n $env:GKE_NAMESPACE
kubectl get services -n $env:GKE_NAMESPACE
kubectl get ingress -n $env:GKE_NAMESPACE
```

Obtenga la IP externa y valide el acceso HTTP:

```powershell
$env:INGRESS_IP=(gcloud compute addresses describe $env:INGRESS_IP_NAME --global --format="value(address)")
Invoke-WebRequest -Uri "http://$env:INGRESS_IP" -UseBasicParsing
```

---

## Paso 14. Rollback manual de emergencia

Para revertir un Deployment a la versión anterior en caso de fallas graves en producción:

```powershell
kubectl rollout undo deployment/api-gateway -n $env:GKE_NAMESPACE
kubectl rollout status deployment/api-gateway -n $env:GKE_NAMESPACE
```

---

## Paso 15. Limpiar infraestructura release

> [!CAUTION]
> Ejecutar esta sección destruirá de manera irreversible toda la infraestructura de producción (`release`) en GCP, incluyendo GKE, base de datos, Redis, bucket, VPC, subredes, peerings y cuentas de servicio. Solo debe realizarse si desea reiniciar el ambiente por completo.

Ejecute en su PowerShell local para borrar todos los recursos:

1. Eliminar el cluster GKE:
```powershell
gcloud container clusters delete $env:GKE_CLUSTER_NAME --region=$env:REGION --quiet
```

2. Eliminar la IP estática global del Ingress:
```powershell
gcloud compute addresses delete $env:INGRESS_IP_NAME --global --quiet
```

3. Eliminar la instancia de Memorystore Redis:
```powershell
gcloud redis instances delete $env:REDIS_INSTANCE --region=$env:REGION --quiet
```

4. Eliminar la instancia de Cloud SQL:
```powershell
gcloud sql instances delete $env:CLOUD_SQL_INSTANCE --quiet
```

5. Eliminar el bucket de Cloud Storage:
```powershell
gcloud storage rm -r gs://$env:BUCKET_NAME --quiet
```

6. Eliminar el Peering de VPC:
```powershell
gcloud services vpc-peerings delete --service=servicenetworking.googleapis.com --network=$env:VPC_NAME --quiet
```

7. Eliminar los rangos de IP globales de PSA:
```powershell
gcloud compute addresses delete prod-db-range --global --quiet
gcloud compute addresses delete prod-redis-range --global --quiet
```

8. Eliminar Cloud NAT y Cloud Router:
```powershell
gcloud compute routers nats delete prod-nat --router=prod-router --region=$env:REGION --quiet
gcloud compute routers delete prod-router --region=$env:REGION --quiet
```

9. Eliminar las subredes de producción:
```powershell
gcloud compute networks subnets delete $env:GKE_SUBNET_NAME --region=$env:REGION --quiet
gcloud compute networks subnets delete $env:PUBLIC_SUBNET_NAME --region=$env:REGION --quiet
gcloud compute networks subnets delete $env:PRIVATE_SUBNET_NAME --region=$env:REGION --quiet
```

10. Eliminar la VPC:
```powershell
gcloud compute networks delete $env:VPC_NAME --quiet
```

11. Eliminar las cuentas de servicio de producción:
```powershell
gcloud iam service-accounts delete $env:CICD_SA --quiet
gcloud iam service-accounts delete $env:MEDIA_SA --quiet
```

Si algún recurso no existe o fue borrado previamente, ignore el error y continúe con el siguiente comando.

Valide que la limpieza fue completa:

```powershell
gcloud container clusters list --region=$env:REGION
gcloud compute addresses list --global --filter="name~prod-"
gcloud redis instances list --region=$env:REGION --filter="name~prod-"
gcloud sql instances list --filter="name~prod-"
gcloud storage buckets list --filter="name:$env:BUCKET_NAME"
gcloud compute networks list --filter="name=$env:VPC_NAME"
gcloud iam service-accounts list --filter="name~prod-"
```

---

## Paso 16. Limpiar datos (Bases de datos y Bucket de producción)

Si desea reiniciar la base de datos y el bucket de producción vaciando todo su contenido:

1. Borrar las bases de datos:
```powershell
gcloud sql databases delete identity_db --instance=$env:CLOUD_SQL_INSTANCE --quiet
gcloud sql databases delete subscription_db --instance=$env:CLOUD_SQL_INSTANCE --quiet
gcloud sql databases delete catalog_db --instance=$env:CLOUD_SQL_INSTANCE --quiet
gcloud sql databases delete engagement_db --instance=$env:CLOUD_SQL_INSTANCE --quiet
```

2. Recrear las bases de datos vacías:
```powershell
gcloud sql databases create identity_db --instance=$env:CLOUD_SQL_INSTANCE
gcloud sql databases create subscription_db --instance=$env:CLOUD_SQL_INSTANCE
gcloud sql databases create catalog_db --instance=$env:CLOUD_SQL_INSTANCE
gcloud sql databases create engagement_db --instance=$env:CLOUD_SQL_INSTANCE
```

3. Vaciar todos los archivos del bucket de producción:
```powershell
gcloud storage rm gs://$env:BUCKET_NAME/**
```
