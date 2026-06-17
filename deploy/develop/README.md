# Deploy Develop en Google Cloud Platform

Esta guia deja el ambiente `develop` operativo desde cero hasta el despliegue automatizado con CI/CD.

## Arquitectura del entorno

| Componente     | Recurso GCP                                                                               |
| -------------- | ----------------------------------------------------------------------------------------- |
| Bases de datos | Cloud SQL PostgreSQL 16 (`identity_db`, `subscription_db`, `catalog_db`, `engagement_db`) |
| Cache / Colas  | Memorystore Redis 7                                                                       |
| VM Frontend    | `qx-vm-frontend` - publica, expone puerto 80                                              |
| VM Gateway     | `qx-vm-gateway` - privada, expone puerto 3000                                             |
| VM Servicios   | `qx-vm-services` - privada, expone puertos gRPC 50051-50057                               |
| Almacenamiento | Cloud Storage bucket `qx-media-sa-derek-proyecto`                                         |
| CI/CD          | GitHub Actions con GitHub Environment `develop`                                           |
| Imagenes       | Docker publicadas en GHCR (`ghcr.io/d3r3-k/sa_proyecto_g13`)                              |

> [!NOTE]
> Todos los comandos de esta guia estan escritos para PowerShell en Windows.

---

## Paso 0. Instalar y autenticarse en gcloud

Si es la primera vez, instale el SDK de Google Cloud desde https://cloud.google.com/sdk/docs/install, luego autentiquese y configure el proyecto:

```powershell
gcloud auth login
gcloud init
```

A continuacion, defina las variables de entorno que se usaran a lo largo de toda esta guia. Ejecute este bloque completo en la misma sesion de PowerShell:

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

> [!IMPORTANT]
> Las variables de entorno de PowerShell (`$env:*`) no persisten entre sesiones. Si se cierra la terminal, se deben volver a ejecutar antes de continuar con cualquier paso de esta guia.

---

## Paso 1. Activar APIs de GCP

Habilite los servicios de Google Cloud necesarios para el proyecto:

```powershell
gcloud services enable compute.googleapis.com
gcloud services enable servicenetworking.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable iam.googleapis.com
gcloud services enable iap.googleapis.com
```

---

## Paso 2. Crear la red, subredes y NAT

Cree la VPC personalizada con una subred publica para el frontend y una privada para los servicios internos. El router NAT permite que las VMs privadas accedan a internet sin IP publica:

```powershell
gcloud compute networks create $env:VPC_NAME --subnet-mode=custom --bgp-routing-mode=regional
gcloud compute networks subnets create qx-subnet-public --network=$env:VPC_NAME --range=10.0.1.0/24 --region=$env:REGION
gcloud compute networks subnets create qx-subnet-private --network=$env:VPC_NAME --range=10.0.2.0/24 --region=$env:REGION --enable-private-ip-google-access
gcloud compute routers create qx-router --network=$env:VPC_NAME --region=$env:REGION
gcloud compute routers nats create qx-nat --router=qx-router --region=$env:REGION --nat-all-subnet-ip-ranges --auto-allocate-nat-external-ips
```

---

## Paso 3. Crear el acceso privado a servicios (Private Service Access)

Cloud SQL y Memorystore se comunican con las VMs a traves de IP privada dentro de la VPC. El peering de servicios habilita esta conexion:

```powershell
gcloud compute addresses create qx-db-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango para Cloud SQL y Redis" --network=$env:VPC_NAME
gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com --ranges=qx-db-range --network=$env:VPC_NAME --project=$env:PROJECT_ID
```

> [!TIP]
> Si Memorystore falla posteriormente por espacio de direcciones agotado, ejecute tambien estos comandos para agregar un rango adicional:
> ```powershell
> gcloud compute addresses create qx-redis-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango adicional para Memorystore Redis" --network=$env:VPC_NAME
> gcloud services vpc-peerings update --service=servicenetworking.googleapis.com --ranges="qx-db-range,qx-redis-range" --network=$env:VPC_NAME --force
> ```

---

## Paso 4. Crear Cloud SQL PostgreSQL

Primero defina las contrasenas de las bases de datos. Guarde estos valores, ya que los necesitara en el Paso 9 al configurar GitHub Environment:

```powershell
$env:POSTGRES_ROOT_PASSWORD="CAMBIAR_ROOT_PASSWORD"
$env:IDENTITY_DB_PASSWORD="CAMBIAR_IDENTITY_PASSWORD"
$env:SUBSCRIPTION_DB_PASSWORD="CAMBIAR_SUBSCRIPTION_PASSWORD"
$env:CATALOG_DB_PASSWORD="CAMBIAR_CATALOG_PASSWORD"
$env:ENGAGEMENT_DB_PASSWORD="CAMBIAR_ENGAGEMENT_PASSWORD"
```

Cree la instancia de Cloud SQL:

```powershell
gcloud sql instances create qx-postgres --database-version=POSTGRES_16 --edition=ENTERPRISE --cpu=1 --memory=4GB --region=$env:REGION --network=$env:VPC_NAME --no-assign-ip --root-password=$env:POSTGRES_ROOT_PASSWORD --availability-type=ZONAL --storage-size=20GB --storage-type=SSD --backup-start-time=03:00
```

Cree las bases de datos:

```powershell
gcloud sql databases create identity_db --instance=qx-postgres
gcloud sql databases create subscription_db --instance=qx-postgres
gcloud sql databases create catalog_db --instance=qx-postgres
gcloud sql databases create engagement_db --instance=qx-postgres
```

Cree los usuarios:

```powershell
gcloud sql users create identity_user --instance=qx-postgres --password=$env:IDENTITY_DB_PASSWORD
gcloud sql users create subscription_user --instance=qx-postgres --password=$env:SUBSCRIPTION_DB_PASSWORD
gcloud sql users create catalog_user --instance=qx-postgres --password=$env:CATALOG_DB_PASSWORD
gcloud sql users create engagement_user --instance=qx-postgres --password=$env:ENGAGEMENT_DB_PASSWORD
```

Obtenga la IP privada (la necesitara como referencia, el workflow la obtiene automaticamente):

```powershell
gcloud sql instances describe qx-postgres --format="value(ipAddresses[0].ipAddress)"
```

---

## Paso 5. Crear Memorystore Redis

```powershell
gcloud redis instances create qx-redis --size=1 --region=$env:REGION --network=$env:VPC_NAME --connect-mode=PRIVATE_SERVICE_ACCESS --redis-version=redis_7_0 --tier=basic
```

Obtenga el host y puerto (referencia, el workflow los obtiene automaticamente):

```powershell
gcloud redis instances describe qx-redis --region=$env:REGION --format="value(host)"
gcloud redis instances describe qx-redis --region=$env:REGION --format="value(port)"
```

---

## Paso 6. Crear el bucket de Cloud Storage

Cree el bucket de almacenamiento para archivos multimedia y backups:

```powershell
gcloud storage buckets create gs://$env:BUCKET_NAME --location=$env:REGION --uniform-bucket-level-access --public-access-prevention
```

Otorgue permisos de administracion de objetos al service account de Compute Engine:

```powershell
$env:PROJECT_NUMBER=(gcloud projects describe $env:PROJECT_ID --format="value(projectNumber)")
$env:COMPUTE_SA="$env:PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:COMPUTE_SA" --role="roles/storage.objectAdmin"
```

Cree el service account que usara `catalog-service` para firmar las URLs de carga y lectura de medios:

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
> El contenido JSON impreso en consola por `Get-Content` debe guardarse como el secret `GCS_BACKEND_SERVICE_ACCOUNT_KEY` en GitHub Environment `develop` (Paso 9).

Configure las reglas CORS del bucket para que el frontend pueda realizar subidas directas con signed URLs:

```powershell
@'
[
  {
    "origin": [
      "http://localhost:5173",
      "https://localhost:5173",
      "http://34.66.234.222",
      "http://localhost:8080"
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

> [!NOTE]
> El bucket debe permanecer privado. No agregar `allUsers` ni `public read`. El acceso se realiza exclusivamente a traves de signed URLs firmadas por `catalog-media-signer`.

---

## Paso 7. Crear las maquinas virtuales (VMs)

VM del frontend (publica):

```powershell
gcloud compute instances create qx-vm-frontend --zone=$env:ZONE --machine-type=e2-micro --network=$env:VPC_NAME --subnet=qx-subnet-public --tags="frontend,http-server" --image-family=debian-12 --image-project=debian-cloud
```

VM del API Gateway (privada):

```powershell
gcloud compute instances create qx-vm-gateway --zone=$env:ZONE --machine-type=e2-small --network=$env:VPC_NAME --subnet=qx-subnet-private --tags="gateway" --no-address --image-family=debian-12 --image-project=debian-cloud
```

VM de los microservicios (privada):

```powershell
gcloud compute instances create qx-vm-services --zone=$env:ZONE --machine-type=e2-medium --network=$env:VPC_NAME --subnet=qx-subnet-private --tags="services" --no-address --image-family=debian-12 --image-project=debian-cloud
```

Valide las IPs asignadas:

```powershell
gcloud compute instances list --filter="name~qx-vm-" --format="table(name,zone,networkInterfaces[0].networkIP,networkInterfaces[0].accessConfigs[0].natIP,status)"
```

---

## Paso 8. Crear las reglas de firewall

```powershell
gcloud compute firewall-rules create qx-allow-internal --network=$env:VPC_NAME --allow="tcp,udp,icmp" --source-ranges="10.0.1.0/24,10.0.2.0/24"
gcloud compute firewall-rules create qx-allow-iap-ssh --network=$env:VPC_NAME --allow="tcp:22" --source-ranges="35.235.240.0/20"
gcloud compute firewall-rules create qx-allow-http --network=$env:VPC_NAME --allow=tcp:80 --target-tags=http-server
gcloud compute firewall-rules create qx-allow-gateway --network=$env:VPC_NAME --allow="tcp:3000" --source-ranges="10.0.1.0/24" --target-tags=gateway
gcloud compute firewall-rules create qx-allow-grpc-services --network=$env:VPC_NAME --allow="tcp:50051-50057" --source-ranges="10.0.2.0/24" --target-tags=services
```

---

## Paso 9. Instalar Docker en las VMs

Conectese a cada VM de manera individual mediante IAP (Identity-Aware Proxy) y ejecute los comandos de instalacion dentro de ella. Repita este proceso para las tres VMs.

Conexion a cada VM:

```powershell
gcloud compute ssh qx-vm-frontend --tunnel-through-iap --zone=$env:ZONE
```

```powershell
gcloud compute ssh qx-vm-gateway --tunnel-through-iap --zone=$env:ZONE
```

```powershell
gcloud compute ssh qx-vm-services --tunnel-through-iap --zone=$env:ZONE
```

Una vez dentro de cada VM, ejecute el siguiente script para instalar Docker:

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

Vuelva a conectarse a la VM y valide la instalacion:

```bash
docker --version
docker compose version
```

---

## Paso 10. Configurar GitHub Environment `develop`

El workflow de CI/CD genera y copia los archivos `.env` a las VMs de manera automatica; no es necesario crearlos manualmente.

### 10.1 Crear el service account para GitHub Actions

```powershell
$env:CICD_SA_NAME="github-actions-deploy"
$env:CICD_SA="$env:CICD_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create $env:CICD_SA_NAME --display-name="GitHub Actions Deploy"
```

Asigne los permisos necesarios:

```powershell
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/compute.instanceAdmin.v1"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/iap.tunnelResourceAccessor"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/compute.osAdminLogin"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/cloudsql.admin"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/redis.viewer"
gcloud projects add-iam-policy-binding $env:PROJECT_ID --member="serviceAccount:$env:CICD_SA" --role="roles/storage.objectViewer"
```

Permita que GitHub Actions utilice el service account de Compute Engine:

```powershell
$env:PROJECT_NUMBER=(gcloud projects describe $env:PROJECT_ID --format="value(projectNumber)")
$env:COMPUTE_SA="$env:PROJECT_NUMBER-compute@developer.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding $env:COMPUTE_SA --member="serviceAccount:$env:CICD_SA" --role="roles/iam.serviceAccountUser" --project=$env:PROJECT_ID
```

Permita que el service account de Cloud SQL escriba backups en el bucket:

```powershell
$env:CLOUD_SQL_SA=(gcloud sql instances describe qx-postgres --format="value(serviceAccountEmailAddress)")
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:CLOUD_SQL_SA" --role="roles/storage.objectCreator"
```

Genere y exporte la llave JSON del service account de CI/CD:

```powershell
gcloud iam service-accounts keys create gcp-github-actions-key.json --iam-account=$env:CICD_SA
Get-Content -Raw .\gcp-github-actions-key.json
```

```powershell
Remove-Item .\gcp-github-actions-key.json
```

> [!IMPORTANT]
> El contenido JSON impreso debe guardarse como el secret `GCP_SERVICE_ACCOUNT_KEY` en el siguiente paso.

### 10.2 Crear el GitHub Environment

1. Dentro del repositorio en GitHub, ir a **Settings > Environments**.
2. Crear un nuevo environment llamado `develop`.
3. Agregar los siguientes secrets y variables.

### 10.3 Secrets requeridos

Agregar en **Settings > Environments > develop > Environment secrets**:

| Secret                            | Descripcion                                              |
| --------------------------------- | -------------------------------------------------------- |
| `GCP_SERVICE_ACCOUNT_KEY`         | JSON generado en el paso 10.1                            |
| `GCS_BACKEND_SERVICE_ACCOUNT_KEY` | JSON del service account `catalog-media-signer` (Paso 6) |
| `GHCR_USERNAME`                   | Usuario de GitHub                                        |
| `GHCR_TOKEN`                      | Token de GitHub con permiso `read:packages`              |
| `JWT_SECRET`                      | Cadena aleatoria segura                                  |
| `IDENTITY_DB_PASSWORD`            | Password de `identity_user` (Paso 4)                     |
| `SUBSCRIPTION_DB_PASSWORD`        | Password de `subscription_user` (Paso 4)                 |
| `CATALOG_DB_PASSWORD`             | Password de `catalog_user` (Paso 4)                      |
| `ENGAGEMENT_DB_PASSWORD`          | Password de `engagement_user` (Paso 4)                   |
| `SMTP_HOST`                       | Host del servidor de correo                              |
| `SMTP_USERNAME`                   | Usuario del servidor de correo                           |
| `SMTP_PASSWORD`                   | Password del servidor de correo                          |
| `SMTP_FROM`                       | Direccion de correo remitente                            |

Para generar el `JWT_SECRET`:

```powershell
[System.Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 10.4 Variables requeridas

Agregar en **Settings > Environments > develop > Environment variables**:

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
ADMIN_EMAILS=[EMAIL_ADDRESS],[EMAIL_ADDRESS],[EMAIL_ADDRESS],[EMAIL_ADDRESS]
```

> [!NOTE]
> No agregar manualmente las IPs de Cloud SQL, Redis ni de las VMs. El workflow las obtiene automaticamente con `gcloud` en cada ejecucion.

---

## Paso 11. Ejecutar el despliegue (CI/CD)

Una vez completados todos los pasos anteriores, el proyecto esta listo para desplegarse mediante GitHub Actions.

### Despliegue automatico

El workflow `.github/workflows/deploy-develop.yml` se ejecuta de manera automatica cada vez que se hace merge a la rama `develop`. El flujo es el siguiente:

```text
ci-checks -> backup-cloud-sql -> build-and-push -> deploy -> smoke-test
```

| Etapa              | Que hace                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `ci-checks`        | Compila el frontend, API Gateway e Identity Service. Ejecuta tests de Catalog y valida los servicios Python con `compileall`. |
| `backup-cloud-sql` | Exporta las cuatro bases de datos al bucket de Cloud Storage.                                                                 |
| `build-and-push`   | Construye y publica las imagenes Docker en `ghcr.io/d3r3-k/sa_proyecto_g13`.                                                  |
| `deploy`           | Copia los `docker-compose.yml` y `.env` a las 3 VMs, ejecuta las migraciones de Identity y levanta los contenedores.          |
| `smoke-test`       | Valida que los contenedores esten en ejecucion, verifica los puertos gRPC y el frontend.                                      |

Para disparar el workflow, suba sus cambios y cree un Pull Request hacia `develop`:

```powershell
git add .
git commit -m "feat: descripcion del cambio"
git push origin HEAD
```

### Despliegue manual

Si necesita forzar un redespliegue sin integrar codigo nuevo:

1. Ir a la pestana **Actions** del repositorio en GitHub.
2. Seleccionar el workflow **Deploy develop to Compute Engine**.
3. Hacer clic en **Run workflow**.
4. Seleccionar la rama `develop` y confirmar la ejecucion.

---

## Migraciones de bases de datos

Las migraciones se ejecutan automaticamente durante el despliegue. No es necesario crearlas manualmente en Cloud SQL.

| Base de datos     | Comportamiento                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `identity_db`     | El workflow ejecuta los SQL de `services/identity-service/migrations` antes de levantar los contenedores. |
| `catalog_db`      | El servicio aplica las migraciones de `services/catalog-service/migrations` al iniciar.                   |
| `subscription_db` | El servicio inicializa su esquema al iniciar.                                                             |
| `engagement_db`   | El servicio aplica sus migraciones al iniciar.                                                            |

> [!TIP]
> Si el workflow falla antes de ejecutar `docker compose up`, revise el job **Deploy docker compose files** en la pestaña Actions para identificar el punto de falla.

---

## Limpiar datos (Bases de datos y Bucket)

> [!WARNING]
> Las bases de datos y el bucket de Cloud Storage son **compartidos** entre `develop` y `release`. Si limpia estos datos, afectara a ambos ambientes.

Si desea vaciar todos los registros de las bases de datos y los archivos subidos al bucket sin destruir la infraestructura, ejecute:

Borrar y recrear las bases de datos (los usuarios y contraseñas se mantienen intactos):

```powershell
gcloud sql databases delete identity_db --instance=qx-postgres --quiet
gcloud sql databases delete subscription_db --instance=qx-postgres --quiet
gcloud sql databases delete catalog_db --instance=qx-postgres --quiet
gcloud sql databases delete engagement_db --instance=qx-postgres --quiet

gcloud sql databases create identity_db --instance=qx-postgres
gcloud sql databases create subscription_db --instance=qx-postgres
gcloud sql databases create catalog_db --instance=qx-postgres
gcloud sql databases create engagement_db --instance=qx-postgres
```

Vaciar todos los archivos del bucket (mantiene las configuraciones CORS y permisos):

```powershell
gcloud storage rm gs://$env:BUCKET_NAME/**
```

> [!TIP]
> Despues de limpiar los datos, puede volver a ejecutar el pipeline de CI/CD para que los microservicios corran sus migraciones iniciales sobre las bases de datos vacias.

---

## Limpiar toda la infraestructura

> [!CAUTION]
> Ejecutar esta seccion destruira de manera irreversible todos los recursos del proyecto en GCP, incluyendo bases de datos, VMs, redes y el bucket. Solo debe llevarse a cabo si se desea reiniciar el ambiente completamente desde cero.

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

Si algun recurso no existe, ignore el error y continue con el siguiente comando.

Valide que la limpieza fue completa:

```powershell
gcloud compute instances list --filter="name~qx-"
gcloud redis instances list --region=$env:REGION
gcloud sql instances list
gcloud compute firewall-rules list --filter="name~qx-"
gcloud compute networks list --filter="name=$env:VPC_NAME"
gcloud compute addresses list --global --filter="name~qx-.*-range"
gcloud storage buckets list --filter="name:$env:BUCKET_NAME"
```
