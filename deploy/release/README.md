# Deploy Release en Google Kubernetes Engine

Esta guia describe el despliegue de produccion para la rama `release` usando Google Cloud Platform, `gcloud`, Google Kubernetes Engine (GKE) y GitHub Actions.

El objetivo es dejar documentado el proceso completo desde cero, incluyendo VPC, Cloud SQL, Memorystore Redis, Cloud Storage, GKE, Kubernetes, Ingress, CI/CD, rollout y rollback.

> [!IMPORTANT]
> Para este proyecto se reutilizaran los recursos ya creados para `develop` con el fin de ahorrar trabajo:
> - VPC: `qx-vpc`
> - Cloud SQL: `qx-postgres`
> - Redis: `qx-redis`
> - Bucket: `qx-media-sa-derek-proyecto`
>
> Los pasos se documentan como una construccion desde cero para produccion, pero cuando el recurso ya exista se debe validar y continuar reutilizandolo.

## Arquitectura del entorno

| Componente     | Recurso GCP / Kubernetes                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| Orquestacion   | Google Kubernetes Engine (`qx-gke-release`)                                               |
| Namespace      | `quetxal-tv-prod`                                                                         |
| Acceso externo | Ingress con IP estatica (`qx-release-ingress-ip`)                                         |
| Servicios      | Kubernetes Services tipo `ClusterIP`                                                      |
| Bases de datos | Cloud SQL PostgreSQL 16 (`identity_db`, `subscription_db`, `catalog_db`, `engagement_db`) |
| Cache / Colas  | Memorystore Redis 7 (`qx-redis`)                                                          |
| Almacenamiento | Cloud Storage bucket `qx-media-sa-derek-proyecto`                                         |
| Configuracion  | Kubernetes `ConfigMap`                                                                    |
| Secretos       | Kubernetes `Secret` + GitHub Environment `release`                                        |
| CI/CD          | GitHub Actions sobre rama `release`                                                       |
| Imagenes       | GHCR (`ghcr.io/d3r3-k/sa_proyecto_g13`)                                                   |

> [!NOTE]
> Todos los comandos de esta guia estan escritos para PowerShell en Windows.

---

## Paso 0. Instalar y autenticarse en gcloud

Si es la primera vez, instale el SDK de Google Cloud desde https://cloud.google.com/sdk/docs/install, luego autentiquese y configure el proyecto:

```powershell
gcloud auth login
gcloud init
```

Defina las variables de entorno que se usaran durante toda la guia:

```powershell
$env:PROJECT_ID="sa-derek-proyecto"
$env:REGION="us-central1"
$env:ZONE="us-central1-a"

$env:VPC_NAME="qx-vpc"
$env:PUBLIC_SUBNET_NAME="qx-subnet-public"
$env:PRIVATE_SUBNET_NAME="qx-subnet-private"
$env:GKE_SUBNET_NAME="qx-subnet-gke-release"

$env:CLOUD_SQL_INSTANCE="qx-postgres"
$env:REDIS_INSTANCE="qx-redis"
$env:BUCKET_NAME="qx-media-sa-derek-proyecto"

$env:GKE_CLUSTER_NAME="qx-gke-release"
$env:GKE_NAMESPACE="quetxal-tv-prod"
$env:INGRESS_IP_NAME="qx-release-ingress-ip"

$env:CICD_SA_NAME="github-actions-release-deploy"
$env:CICD_SA="$env:CICD_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"

gcloud config set project $env:PROJECT_ID
gcloud config set compute/region $env:REGION
gcloud config set compute/zone $env:ZONE
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

## Paso 2. Crear red, subredes, NAT y acceso privado desde cero

> [!NOTE]
> En este proyecto la VPC `qx-vpc` ya existe por el despliegue `develop`. Si el comando de creacion indica que el recurso ya existe, valide el recurso y continue con el siguiente paso.

Cree la VPC personalizada:

```powershell
gcloud compute networks create $env:VPC_NAME --subnet-mode=custom --bgp-routing-mode=regional
```

Cree las subredes base usadas por desarrollo:

```powershell
gcloud compute networks subnets create $env:PUBLIC_SUBNET_NAME --network=$env:VPC_NAME --range=10.0.1.0/24 --region=$env:REGION
gcloud compute networks subnets create $env:PRIVATE_SUBNET_NAME --network=$env:VPC_NAME --range=10.0.2.0/24 --region=$env:REGION --enable-private-ip-google-access
```

Cree Cloud Router y Cloud NAT para permitir salida a internet desde recursos privados:

```powershell
gcloud compute routers create qx-router --network=$env:VPC_NAME --region=$env:REGION
gcloud compute routers nats create qx-nat --router=qx-router --region=$env:REGION --nat-all-subnet-ip-ranges --auto-allocate-nat-external-ips
```

Configure Private Service Access para Cloud SQL y Redis:

```powershell
gcloud compute addresses create qx-db-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango para Cloud SQL y Redis" --network=$env:VPC_NAME
gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com --ranges=qx-db-range --network=$env:VPC_NAME --project=$env:PROJECT_ID
```

> [!TIP]
> Si Redis falla por falta de espacio de direcciones, agregue un segundo rango:
> ```powershell
> gcloud compute addresses create qx-redis-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango adicional para Memorystore Redis" --network=$env:VPC_NAME
> gcloud services vpc-peerings update --service=servicenetworking.googleapis.com --ranges="qx-db-range,qx-redis-range" --network=$env:VPC_NAME --force
> ```

---

## Paso 3. Crear Cloud SQL PostgreSQL desde cero

> [!NOTE]
> En este proyecto la instancia `qx-postgres` ya existe por el despliegue `develop`. Se reutilizara para ahorrar trabajo, manteniendo las mismas bases de datos, usuarios y contrasenas.

Defina las contrasenas:

```powershell
$env:POSTGRES_ROOT_PASSWORD="CAMBIAR_ROOT_PASSWORD"
$env:IDENTITY_DB_PASSWORD="CAMBIAR_IDENTITY_PASSWORD"
$env:SUBSCRIPTION_DB_PASSWORD="CAMBIAR_SUBSCRIPTION_PASSWORD"
$env:CATALOG_DB_PASSWORD="CAMBIAR_CATALOG_PASSWORD"
$env:ENGAGEMENT_DB_PASSWORD="CAMBIAR_ENGAGEMENT_PASSWORD"
```

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

Obtenga la IP privada:

```powershell
gcloud sql instances describe $env:CLOUD_SQL_INSTANCE --format="value(ipAddresses[0].ipAddress)"
```

---

## Paso 4. Crear Memorystore Redis desde cero

> [!NOTE]
> En este proyecto la instancia `qx-redis` ya existe por el despliegue `develop`. Se reutilizara como cache y cola compartida.

```powershell
gcloud redis instances create $env:REDIS_INSTANCE --size=1 --region=$env:REGION --network=$env:VPC_NAME --connect-mode=PRIVATE_SERVICE_ACCESS --redis-version=redis_7_0 --tier=basic
```

Obtenga host y puerto:

```powershell
gcloud redis instances describe $env:REDIS_INSTANCE --region=$env:REGION --format="value(host)"
gcloud redis instances describe $env:REDIS_INSTANCE --region=$env:REGION --format="value(port)"
```

---

## Paso 5. Crear bucket de Cloud Storage desde cero

> [!NOTE]
> En este proyecto el bucket `qx-media-sa-derek-proyecto` ya existe por el despliegue `develop`. Se reutilizara para los archivos multimedia.

Cree el bucket privado:

```powershell
gcloud storage buckets create gs://$env:BUCKET_NAME --location=$env:REGION --uniform-bucket-level-access --public-access-prevention
```

Cree el service account que firma URLs para `catalog-service`:

```powershell
$env:MEDIA_SA_NAME="catalog-media-signer"
$env:MEDIA_SA="$env:MEDIA_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create $env:MEDIA_SA_NAME --display-name="Catalog Media Signer"
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:MEDIA_SA" --role="roles/storage.objectAdmin"
gcloud iam service-accounts keys create gcs-backend-service-account.json --iam-account=$env:MEDIA_SA
Get-Content -Raw .\gcs-backend-service-account.json
Remove-Item .\gcs-backend-service-account.json
```

> [!IMPORTANT]
> El JSON impreso debe guardarse como secret `GCS_BACKEND_SERVICE_ACCOUNT_KEY` en GitHub Environment `release`. No debe subirse al repositorio.

Configure CORS:

```powershell
@'
[
  {
    "origin": [
      "http://localhost:5173",
      "https://localhost:5173",
      "http://REEMPLAZAR_IP_INGRESS"
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

> [!WARNING]
> El bucket debe permanecer privado. No agregue permisos `allUsers` ni lectura publica. La aplicacion usa URLs firmadas.

---

## Paso 6. Validar recursos compartidos con develop

Antes de crear GKE, valide que los recursos compartidos existan y esten disponibles:

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
```

> [!IMPORTANT]
> Aunque los recursos sean compartidos con `develop`, las credenciales y variables deben registrarse tambien en GitHub Environment `release`.

---

## Paso 7. Crear subred dedicada para GKE release

GKE necesita una subred con rangos secundarios para Pods y Services:

```powershell
gcloud compute networks subnets create $env:GKE_SUBNET_NAME --network=$env:VPC_NAME --region=$env:REGION --range=10.0.3.0/24 --enable-private-ip-google-access --secondary-range="qx-gke-pods=10.10.0.0/16,qx-gke-services=10.20.0.0/20"
```

> [!NOTE]
> Esta subred es independiente de las subredes usadas por las VMs de `develop`.

---

## Paso 8. Crear cluster GKE release

Cree el cluster GKE con IP alias, nodos privados y autoscaling basico:

```powershell
gcloud container clusters create $env:GKE_CLUSTER_NAME `
  --region=$env:REGION `
  --network=$env:VPC_NAME `
  --subnetwork=$env:GKE_SUBNET_NAME `
  --enable-ip-alias `
  --cluster-secondary-range-name=qx-gke-pods `
  --services-secondary-range-name=qx-gke-services `
  --enable-private-nodes `
  --master-ipv4-cidr=172.16.0.0/28 `
  --num-nodes=1 `
  --machine-type=e2-small `
  --enable-autoscaling `
  --min-nodes=1 `
  --max-nodes=3
```

> [!TIP]
> Si el presupuesto es limitado, use `e2-small` y maximo 3 nodos. Si el cluster queda sin recursos, aumente a `e2-medium`.

---

## Paso 9. Conectar kubectl y crear namespace

Instale el plugin de autenticacion requerido por GKE para `kubectl`:

```powershell
gcloud components install gke-gcloud-auth-plugin
$env:USE_GKE_GCLOUD_AUTH_PLUGIN="True"
[Environment]::SetEnvironmentVariable("USE_GKE_GCLOUD_AUTH_PLUGIN", "True", "User")
gke-gcloud-auth-plugin --version
```

> [!IMPORTANT]
> Si `gcloud components install` indica que los componentes no se pueden administrar desde `gcloud`, instale o actualice el SDK de Google Cloud desde el instalador oficial de Windows y vuelva a ejecutar este paso.

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

## Paso 10. Crear secretos Kubernetes

> [!IMPORTANT]
> Este paso muestra como crear secretos manualmente para validacion inicial. En el despliegue final, los secretos deben generarse desde GitHub Actions usando GitHub Environment `release`.

Defina secretos en PowerShell:

```powershell
$env:JWT_SECRET="CAMBIAR_JWT_SECRET"
$env:IDENTITY_DB_PASSWORD="CAMBIAR_IDENTITY_PASSWORD"
$env:SUBSCRIPTION_DB_PASSWORD="CAMBIAR_SUBSCRIPTION_PASSWORD"
$env:CATALOG_DB_PASSWORD="CAMBIAR_CATALOG_PASSWORD"
$env:ENGAGEMENT_DB_PASSWORD="CAMBIAR_ENGAGEMENT_PASSWORD"
$env:SMTP_HOST="CAMBIAR_SMTP_HOST"
$env:SMTP_USERNAME="CAMBIAR_SMTP_USERNAME"
$env:SMTP_PASSWORD="CAMBIAR_SMTP_PASSWORD"
$env:SMTP_FROM="CAMBIAR_SMTP_FROM"
```

Cree el secret general:

```powershell
kubectl create secret generic app-secrets `
  --namespace=$env:GKE_NAMESPACE `
  --from-literal=JWT_SECRET=$env:JWT_SECRET `
  --from-literal=IDENTITY_DB_PASSWORD=$env:IDENTITY_DB_PASSWORD `
  --from-literal=SUBSCRIPTION_DB_PASSWORD=$env:SUBSCRIPTION_DB_PASSWORD `
  --from-literal=CATALOG_DB_PASSWORD=$env:CATALOG_DB_PASSWORD `
  --from-literal=ENGAGEMENT_DB_PASSWORD=$env:ENGAGEMENT_DB_PASSWORD `
  --from-literal=SMTP_HOST=$env:SMTP_HOST `
  --from-literal=SMTP_USERNAME=$env:SMTP_USERNAME `
  --from-literal=SMTP_PASSWORD=$env:SMTP_PASSWORD `
  --from-literal=SMTP_FROM=$env:SMTP_FROM
```

Obtenga los hosts privados y cree un secret para cadenas de conexion completas:

```powershell
$env:CLOUD_SQL_PRIVATE_IP=(gcloud sql instances describe $env:CLOUD_SQL_INSTANCE --format="value(ipAddresses[0].ipAddress)")

kubectl create secret generic connection-secrets `
  --namespace=$env:GKE_NAMESPACE `
  --from-literal=SUBSCRIPTION_DATABASE_URL="postgresql://subscription_user:$($env:SUBSCRIPTION_DB_PASSWORD)@$($env:CLOUD_SQL_PRIVATE_IP):5432/subscription_db" `
  --from-literal=CATALOG_DATABASE_URL="postgresql://catalog_user:$($env:CATALOG_DB_PASSWORD)@$($env:CLOUD_SQL_PRIVATE_IP):5432/catalog_db" `
  --from-literal=ENGAGEMENT_DATABASE_URL="postgresql://engagement_user:$($env:ENGAGEMENT_DB_PASSWORD)@$($env:CLOUD_SQL_PRIVATE_IP):5432/engagement_db"
```

Cree el secret para la llave de GCS:

```powershell
kubectl create secret generic gcs-service-account --namespace=$env:GKE_NAMESPACE --from-file=gcp-service-account.json=.\gcs-backend-service-account.json
```

Cree el pull secret para GHCR:

```powershell
$env:GHCR_USERNAME="CAMBIAR_GITHUB_USER"
$env:GHCR_TOKEN="CAMBIAR_GITHUB_TOKEN" # Asegurese de que tenga permisos read:packages y write:packages

kubectl create secret docker-registry ghcr-pull-secret `
  --namespace=$env:GKE_NAMESPACE `
  --docker-server=ghcr.io `
  --docker-username=$env:GHCR_USERNAME `
  --docker-password=$env:GHCR_TOKEN
```

> [!WARNING]
> No suba `gcp-service-account.json` al repositorio. El archivo local debe eliminarse despues de crear el secret.

---

## Paso 11. Reservar IP estatica del Ingress

Reserve una IP global para el Ingress antes de crear el `ConfigMap`, ya que `FRONTEND_URL` depende de esta direccion:

```powershell
gcloud compute addresses create $env:INGRESS_IP_NAME --global
$env:INGRESS_IP=(gcloud compute addresses describe $env:INGRESS_IP_NAME --global --format="value(address)")
Write-Host "Ingress IP: $env:INGRESS_IP"
```

> [!NOTE]
> Si la IP ya existe, el comando de creacion puede indicar que el recurso ya esta creado. En ese caso ejecute solo el comando `describe` para cargar `$env:INGRESS_IP`.

---

## Paso 12. Crear ConfigMaps

Las variables no sensibles deben ir en `ConfigMap`. Las URLs internas usan nombres de Services de Kubernetes:

## Paso 10, 11 y 12. Creación de Secretos y ConfigMaps (Automatizado)

> [!IMPORTANT]
> **Todo este proceso ha sido automatizado.**
> Ya no es necesario crear manualmente los secretos (`app-secrets`, `connection-secrets`, `ghcr-pull-secret`, `gcs-service-account`) ni el `ConfigMap` (`app-config`) en la terminal.
> El pipeline de GitHub Actions (`deploy-release.yml`) ahora se encarga de leer las variables de entorno desde los *Secrets* y *Variables* configuradas en GitHub, conectarse a Google Cloud para obtener las IPs dinámicas (como la de Cloud SQL), e inyectar y crear todos los recursos en el clúster de Kubernetes en cada despliegue.

---

## Paso 13. Manifiestos requeridos de Kubernetes

La estructura recomendada para `deploy/release/k8s` es:

```text
k8s/
  README.md
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

Cada `Deployment` debe incluir:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
readinessProbe:
  tcpSocket:
    port: 50051
  initialDelaySeconds: 10
  periodSeconds: 10
livenessProbe:
  tcpSocket:
    port: 50051
  initialDelaySeconds: 30
  periodSeconds: 20
```

> [!NOTE]
> Para `api-gateway` se puede usar HTTP probe contra `/api/health` en el puerto `3000`. Para `web` se puede usar HTTP probe contra `/` en el puerto `80`. Para los servicios gRPC se puede usar `tcpSocket` mientras no exista un health endpoint HTTP dentro del contenedor.

Todos los Services internos deben ser `ClusterIP`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: identity-service
  namespace: quetxal-tv-prod
spec:
  type: ClusterIP
  selector:
    app: identity-service
  ports:
    - name: grpc
      port: 50051
      targetPort: 50051
```

> [!IMPORTANT]
> No use Services tipo `LoadBalancer` ni `NodePort` por microservicio. El unico acceso externo permitido para produccion debe ser el Ingress.

---

## Paso 14. Crear Ingress

Valide la IP global reservada para el Ingress:

```powershell
gcloud compute addresses describe $env:INGRESS_IP_NAME --global --format="value(address)"
```

Ejemplo base de `ingress.yml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: quetxal-tv-ingress
  namespace: quetxal-tv-prod
  annotations:
    kubernetes.io/ingress.global-static-ip-name: qx-release-ingress-ip
spec:
  rules:
    - http:
        paths:
          - path: /*
            pathType: ImplementationSpecific
            backend:
              service:
                name: web
                port:
                  number: 80
```

> [!NOTE]
> El frontend `web` redirige `/api/` hacia `api-gateway`, por lo que el Ingress solo necesita exponer `web`.

---

## Paso 15. Configurar GitHub Environment release

1. Ir al repositorio en GitHub.
2. Entrar a **Settings > Environments**.
3. Crear un environment llamado `release`.
4. Agregar los secrets y variables siguientes.

### Secrets requeridos

| Secret                            | Descripcion                                     |
| --------------------------------- | ----------------------------------------------- |
| `GCP_SERVICE_ACCOUNT_KEY`         | JSON del service account de CI/CD               |
| `GCS_BACKEND_SERVICE_ACCOUNT_KEY` | JSON del service account `catalog-media-signer` |
| `GHCR_USERNAME`                   | Usuario de GitHub                               |
| `GHCR_TOKEN`                      | Token de GitHub con permiso `read:packages` y `write:packages` |
| `JWT_SECRET`                      | Cadena segura para firmar JWT                   |
| `IDENTITY_DB_PASSWORD`            | Password de `identity_user`                     |
| `SUBSCRIPTION_DB_PASSWORD`        | Password de `subscription_user`                 |
| `CATALOG_DB_PASSWORD`             | Password de `catalog_user`                      |
| `ENGAGEMENT_DB_PASSWORD`          | Password de `engagement_user`                   |
| `SMTP_HOST`                       | Host del servidor SMTP                          |
| `SMTP_USERNAME`                   | Usuario SMTP                                    |
| `SMTP_PASSWORD`                   | Password SMTP                                   |
| `SMTP_FROM`                       | Correo remitente                                |

### Variables requeridas

```text
GCP_PROJECT_ID=sa-derek-proyecto
GCP_REGION=us-central1
GCP_ZONE=us-central1-a
VPC_NAME=qx-vpc
GKE_CLUSTER_NAME=qx-gke-release
GKE_NAMESPACE=quetxal-tv-prod
GKE_SUBNET_NAME=qx-subnet-gke-release
CLOUD_SQL_INSTANCE=qx-postgres
REDIS_INSTANCE=qx-redis
GCS_BUCKET_NAME=qx-media-sa-derek-proyecto
INGRESS_IP_NAME=qx-release-ingress-ip
GCS_SIGNED_UPLOAD_EXPIRES_MINUTES=15
GCS_SIGNED_READ_EXPIRES_MINUTES=60
GCS_ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/webp
GCS_ALLOWED_VIDEO_TYPES=video/mp4,video/webm
GCS_MAX_IMAGE_MB=10
GCS_MAX_VIDEO_MB=1024
SMTP_PORT=587
SMTP_STARTTLS=true
```

---

## Paso 16. Crear service account para GitHub Actions release

Cree el service account:

```powershell
gcloud iam service-accounts create $env:CICD_SA_NAME --display-name="GitHub Actions Release Deploy"
```

Asigne permisos:

```powershell
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/container.admin"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/cloudsql.admin"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/redis.viewer"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/storage.objectViewer"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/compute.networkViewer"
```

Permita backups de Cloud SQL al bucket:

```powershell
$env:CLOUD_SQL_SA=(gcloud sql instances describe $env:CLOUD_SQL_INSTANCE --format="value(serviceAccountEmailAddress)")
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:CLOUD_SQL_SA" --role="roles/storage.objectCreator"
```

Genere la llave para GitHub:

```powershell
gcloud iam service-accounts keys create gcp-github-actions-release-key.json --iam-account=$env:CICD_SA
Get-Content -Raw .\gcp-github-actions-release-key.json
Remove-Item .\gcp-github-actions-release-key.json
```

> [!IMPORTANT]
> El contenido JSON impreso debe guardarse como `GCP_SERVICE_ACCOUNT_KEY` en GitHub Environment `release`.

---

## Paso 17. Flujo esperado del pipeline release

El despliegue real de produccion debe ejecutarse por CI/CD al impactar la rama `release`.

> [!WARNING]
> El enunciado prohibe despliegues manuales para GKE. Los comandos manuales de `kubectl` en esta guia son de referencia, validacion o recuperacion controlada. El despliegue oficial debe ocurrir desde GitHub Actions.

El workflow recomendado para `.github/workflows/deploy-release.yml` debe ejecutar:

```text
ci-checks -> backup-cloud-sql -> build-and-push -> tag-release -> deploy-gke -> smoke-test
```

| Etapa              | Que hace                                                                               |
| ------------------ | -------------------------------------------------------------------------------------- |
| `ci-checks`        | Compila frontend, gateway y servicios. Ejecuta pruebas y corta el flujo si algo falla. |
| `backup-cloud-sql` | Exporta `identity_db`, `subscription_db`, `catalog_db` y `engagement_db` al bucket.    |
| `build-and-push`   | Construye imagenes Docker y publica en GHCR con `latest`, SHA y tag semantico.         |
| `tag-release`      | Crea version semantica de produccion, por ejemplo `v2.0.0`.                            |
| `deploy-gke`       | Aplica manifests con `kubectl apply` en namespace `quetxal-tv-prod`.                   |
| `rollout-status`   | Espera `kubectl rollout status` por cada Deployment.                                   |
| `rollback`         | Ejecuta `kubectl rollout undo` si un Deployment falla o entra en estado no saludable.  |
| `smoke-test`       | Valida Ingress, frontend y `/api/health`.                                              |

Ejemplo de comandos clave dentro del workflow (que deberia configurarse para ejecutarse en ramas `release/*` y `test/*`):

```bash
gcloud container clusters get-credentials "${GKE_CLUSTER_NAME}" --region="${GCP_REGION}" --project="${GCP_PROJECT_ID}"
kubectl apply -f deploy/release/k8s/services/
kubectl apply -f deploy/release/k8s/deployments/
kubectl apply -f deploy/release/k8s/ingress.yml

for deployment in web api-gateway identity-service fx-service subscription-service notification-service catalog-service engagement-service payment-gateway-service
do
  if ! kubectl rollout status deployment/${deployment} -n "${GKE_NAMESPACE}" --timeout=180s; then
    kubectl rollout undo deployment/${deployment} -n "${GKE_NAMESPACE}"
    exit 1
  fi
done
```

> [!NOTE]
> Se omiten `namespace.yml` y `configmap.yml` del flujo automatizado, ya que estos recursos se deben crear manualmente por motivos de permisos (`roles/container.admin` maneja recursos dentro del namespace) e inyeccion de valores dimanicos (Paso 12). Se recomienda usar `GITHUB_TOKEN` para la tarea de `docker-push` dentro del flujo.

> [!TIP]
> El backup debe ejecutarse antes de aplicar nuevos manifests para poder restaurar datos si una version afecta el estado operacional.

---

## Paso 18. Verificacion del despliegue

Valide el cluster:

```powershell
kubectl get nodes
kubectl get pods -n $env:GKE_NAMESPACE
kubectl get services -n $env:GKE_NAMESPACE
kubectl get ingress -n $env:GKE_NAMESPACE
```

Valide rollouts:

```powershell
kubectl rollout status deployment/web -n $env:GKE_NAMESPACE
kubectl rollout status deployment/api-gateway -n $env:GKE_NAMESPACE
kubectl rollout status deployment/identity-service -n $env:GKE_NAMESPACE
kubectl rollout status deployment/fx-service -n $env:GKE_NAMESPACE
kubectl rollout status deployment/subscription-service -n $env:GKE_NAMESPACE
kubectl rollout status deployment/notification-service -n $env:GKE_NAMESPACE
kubectl rollout status deployment/catalog-service -n $env:GKE_NAMESPACE
kubectl rollout status deployment/engagement-service -n $env:GKE_NAMESPACE
kubectl rollout status deployment/payment-gateway-service -n $env:GKE_NAMESPACE
```

Obtenga la IP externa:

```powershell
gcloud compute addresses describe $env:INGRESS_IP_NAME --global --format="value(address)"
```

Pruebe el frontend y health del gateway:

```powershell
$env:INGRESS_IP=(gcloud compute addresses describe $env:INGRESS_IP_NAME --global --format="value(address)")
Invoke-WebRequest -Uri "http://$env:INGRESS_IP" -UseBasicParsing
Invoke-WebRequest -Uri "http://$env:INGRESS_IP/api/health" -UseBasicParsing
```

Revise logs si algun pod falla:

```powershell
kubectl logs deployment/api-gateway -n $env:GKE_NAMESPACE
kubectl logs deployment/catalog-service -n $env:GKE_NAMESPACE
kubectl describe pod -n $env:GKE_NAMESPACE
```

---

## Paso 19. Rollback manual de emergencia

> [!NOTE]
> El rollback normal debe ejecutarse automaticamente desde el pipeline. Este paso se deja como referencia operativa.

Para revertir un Deployment:

```powershell
kubectl rollout undo deployment/api-gateway -n $env:GKE_NAMESPACE
kubectl rollout status deployment/api-gateway -n $env:GKE_NAMESPACE
```

Ver historial:

```powershell
kubectl rollout history deployment/api-gateway -n $env:GKE_NAMESPACE
```

---

## Paso 20. Limpiar infraestructura release

> [!CAUTION]
> Esta limpieza elimina solo recursos de Kubernetes release. No elimina Cloud SQL, Redis ni el bucket porque tambien son usados por `develop`.

Elimine el cluster:

```powershell
gcloud container clusters delete $env:GKE_CLUSTER_NAME --region=$env:REGION --quiet
```

Elimine la IP estatica:

```powershell
gcloud compute addresses delete $env:INGRESS_IP_NAME --global --quiet
```

Elimine la subred de GKE:

```powershell
gcloud compute networks subnets delete $env:GKE_SUBNET_NAME --region=$env:REGION --quiet
```

Elimine el service account de CI/CD release:

```powershell
gcloud iam service-accounts delete $env:CICD_SA --quiet
```

Valide que no queden recursos release:

```powershell
gcloud container clusters list --region=$env:REGION
gcloud compute addresses list --global --filter="name=$env:INGRESS_IP_NAME"
gcloud compute networks subnets list --regions=$env:REGION --filter="name=$env:GKE_SUBNET_NAME"
```

> [!WARNING]
> No ejecute comandos de borrado contra `qx-postgres`, `qx-redis` ni `qx-media-sa-derek-proyecto` mientras el ambiente `develop` los siga usando.
