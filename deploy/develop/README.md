# Deploy Develop en Google Cloud Platform

Esta guia deja el ambiente `develop` operativo desde cero hasta el despliegue automatizado con CI/CD.

## Arquitectura del entorno

| Componente     | Recurso GCP                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Bases de datos | Cloud SQL PostgreSQL 16 (`identity_db`, `subscription_db`, `catalog_db`, `engagement_db`) -> Instancia `dev-postgres` |
| Cache / Colas  | Memorystore Redis 7 -> Instancia `dev-redis`                                                                          |
| VM Frontend    | `dev-vm-frontend` - publica, expone puerto 80                                                                         |
| VM Gateway     | `dev-vm-gateway` - privada, expone puerto 3000                                                                        |
| VM Servicios   | `dev-vm-services` - privada, expone puertos gRPC 50051-50057                                                          |
| Almacenamiento | Cloud Storage bucket `dev-media-sa-derek-proyecto`                                                                    |
| CI/CD          | GitHub Actions con GitHub Environment `develop`                                                                       |
| Imagenes       | Docker publicadas en GHCR (`ghcr.io/d3r3-k/sa_proyecto_g13`)                                                          |

> [!NOTE]
> Todos los comandos de esta guia estan escritos para PowerShell en Windows.

---

## Paso 0. Definir variables y autenticarse en gcloud

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
$env:VPC_NAME="dev-vpc"
$env:BUCKET_NAME="dev-media-sa-derek-proyecto"
$env:CICD_SA_NAME="github-actions-dev"
$env:CICD_SA="$env:CICD_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"
$env:MEDIA_SA_NAME="dev-catalog-media-signer"
$env:MEDIA_SA="$env:MEDIA_SA_NAME@$env:PROJECT_ID.iam.gserviceaccount.com"

# Variables de Recursos GCP
$env:SQL_INSTANCE_NAME="dev-postgres"
$env:REDIS_INSTANCE_NAME="dev-redis"

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
gcloud storage service-agent
gcloud services enable iam.googleapis.com
gcloud services enable iap.googleapis.com
```

---

## Paso 2. Crear la red, subredes y NAT

Cree la VPC personalizada con una subred publica para el frontend y una privada para los servicios internos. El router NAT permite que las VMs privadas accedan a internet sin IP publica:

```powershell
gcloud compute networks create $env:VPC_NAME --subnet-mode=custom --bgp-routing-mode=regional
gcloud compute networks subnets create dev-subnet-public --network=$env:VPC_NAME --range=10.0.1.0/24 --region=$env:REGION
gcloud compute networks subnets create dev-subnet-private --network=$env:VPC_NAME --range=10.0.2.0/24 --region=$env:REGION --enable-private-ip-google-access
gcloud compute routers create dev-router --network=$env:VPC_NAME --region=$env:REGION
gcloud compute routers nats create dev-nat --router=dev-router --region=$env:REGION --nat-all-subnet-ip-ranges --auto-allocate-nat-external-ips
```

---

## Paso 3. Crear el acceso privado a servicios (Private Service Access)

Cloud SQL y Memorystore se comunican con las VMs a traves de IP privada dentro de la VPC. El peering de servicios habilita esta conexion reservando rangos de IP dedicados para las bases de datos y Redis:

```powershell
gcloud compute addresses create dev-db-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango para Cloud SQL" --network=$env:VPC_NAME
gcloud compute addresses create dev-redis-range --global --purpose=VPC_PEERING --prefix-length=20 --description="Rango para Memorystore Redis" --network=$env:VPC_NAME
gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com --ranges="dev-db-range,dev-redis-range" --network=$env:VPC_NAME --project=$env:PROJECT_ID
```

---

## Paso 4. Crear Cloud SQL PostgreSQL

Cree la instancia de Cloud SQL usando las contraseñas definidas en el Paso 0:

```powershell
gcloud sql instances create $env:SQL_INSTANCE_NAME --database-version=POSTGRES_16 --edition=ENTERPRISE --cpu=1 --memory=4GB --region=$env:REGION --network=$env:VPC_NAME --no-assign-ip --root-password=$env:POSTGRES_ROOT_PASSWORD --availability-type=ZONAL --storage-size=20GB --storage-type=SSD --backup-start-time=03:00
```

> [!TIP]
> Si el comando anterior falla con `[INTERNAL_ERROR]`, es posible que la instancia se este creando en segundo plano debido a un retraso de respuesta de la API de GCP. 
> Antes de reintentar, valide su estado ejecutando `gcloud sql instances list`. Proceda cuando el estado pase de `PENDING_CREATE` a `RUNNABLE`.

Cree las bases de datos:

```powershell
gcloud sql databases create identity_db --instance=$env:SQL_INSTANCE_NAME
gcloud sql databases create subscription_db --instance=$env:SQL_INSTANCE_NAME
gcloud sql databases create catalog_db --instance=$env:SQL_INSTANCE_NAME
gcloud sql databases create engagement_db --instance=$env:SQL_INSTANCE_NAME
```

Cree los usuarios utilizando las contraseñas del Paso 0:

```powershell
gcloud sql users create identity_user --instance=$env:SQL_INSTANCE_NAME --password=$env:IDENTITY_DB_PASSWORD
gcloud sql users create subscription_user --instance=$env:SQL_INSTANCE_NAME --password=$env:SUBSCRIPTION_DB_PASSWORD
gcloud sql users create catalog_user --instance=$env:SQL_INSTANCE_NAME --password=$env:CATALOG_DB_PASSWORD
gcloud sql users create engagement_user --instance=$env:SQL_INSTANCE_NAME --password=$env:ENGAGEMENT_DB_PASSWORD
```

Obtenga la IP privada (referencia, el workflow la obtiene automaticamente):

```powershell
gcloud sql instances describe $env:SQL_INSTANCE_NAME --format="value(ipAddresses[0].ipAddress)"
```

---

## Paso 5. Crear Memorystore Redis

```powershell
gcloud redis instances create $env:REDIS_INSTANCE_NAME --size=1 --region=$env:REGION --network=$env:VPC_NAME --connect-mode=PRIVATE_SERVICE_ACCESS --redis-version=redis_7_0 --tier=basic
```

Obtenga el host y puerto (referencia, el workflow los obtiene automaticamente):

```powershell
gcloud redis instances describe $env:REDIS_INSTANCE_NAME --region=$env:REGION --format="value(host)"
gcloud redis instances describe $env:REDIS_INSTANCE_NAME --region=$env:REGION --format="value(port)"
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
gcloud iam service-accounts create $env:MEDIA_SA_NAME --display-name="Catalog Media Signer"
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:MEDIA_SA" --role="roles/storage.objectAdmin"
```

Configure las reglas CORS del bucket para que el frontend pueda realizar subidas directas con signed URLs (reemplace las IPs/URLs según corresponda):

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
gcloud compute instances create dev-vm-frontend --zone=$env:ZONE --machine-type=e2-micro --network=$env:VPC_NAME --subnet=dev-subnet-public --tags="frontend,http-server" --image-family=debian-12 --image-project=debian-cloud
```

VM del API Gateway (privada):

```powershell
gcloud compute instances create dev-vm-gateway --zone=$env:ZONE --machine-type=e2-small --network=$env:VPC_NAME --subnet=dev-subnet-private --tags="gateway" --no-address --image-family=debian-12 --image-project=debian-cloud
```

VM de los microservicios (privada):

```powershell
gcloud compute instances create dev-vm-services --zone=$env:ZONE --machine-type=e2-medium --network=$env:VPC_NAME --subnet=dev-subnet-private --tags="services" --no-address --image-family=debian-12 --image-project=debian-cloud
```

Valide las IPs asignadas:

```powershell
gcloud compute instances list --filter="name~dev-vm-" --format="table(name,zone,networkInterfaces[0].networkIP,networkInterfaces[0].accessConfigs[0].natIP,status)"
```

---

## Paso 8. Crear las reglas de firewall

```powershell
gcloud compute firewall-rules create dev-allow-internal --network=$env:VPC_NAME --allow="tcp,udp,icmp" --source-ranges="10.0.1.0/24,10.0.2.0/24"
gcloud compute firewall-rules create dev-allow-iap-ssh --network=$env:VPC_NAME --allow="tcp:22" --source-ranges="35.235.240.0/20"
gcloud compute firewall-rules create dev-allow-http --network=$env:VPC_NAME --allow=tcp:80 --target-tags=http-server
gcloud compute firewall-rules create dev-allow-gateway --network=$env:VPC_NAME --allow="tcp:3000" --source-ranges="10.0.1.0/24" --target-tags=gateway
gcloud compute firewall-rules create dev-allow-grpc-services --network=$env:VPC_NAME --allow="tcp:50051-50057" --source-ranges="10.0.2.0/24" --target-tags=services
```

---

## Paso 9. Instalar Docker en las VMs

Conectese a cada VM de manera individual mediante IAP (Identity-Aware Proxy) y ejecute los comandos de instalacion dentro de ella. Repita este proceso para las tres VMs.

Conexion a cada VM:

```powershell
gcloud compute ssh dev-vm-frontend --tunnel-through-iap --zone=$env:ZONE
```

```powershell
gcloud compute ssh dev-vm-gateway --tunnel-through-iap --zone=$env:ZONE
```

```powershell
gcloud compute ssh dev-vm-services --tunnel-through-iap --zone=$env:ZONE
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
gcloud iam service-accounts create $env:CICD_SA_NAME --display-name="GitHub Actions Dev"
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
$env:CLOUD_SQL_SA=(gcloud sql instances describe $env:SQL_INSTANCE_NAME --format="value(serviceAccountEmailAddress)")
gcloud storage buckets add-iam-policy-binding gs://$env:BUCKET_NAME --member="serviceAccount:$env:CLOUD_SQL_SA" --role="roles/storage.objectCreator"
```

### 10.2 Crear el GitHub Environment

1. Dentro del repositorio en GitHub, ir a **Settings > Environments**.
2. Crear un nuevo environment llamado `develop`.
3. Agregar los siguientes secrets y variables descritos en las tablas de abajo.

### 10.3 Secrets requeridos

Agregar en **Settings > Environments > develop > Environment secrets**:

| Secret | Descripcion |
| :--- | :--- |
| `CATALOG_DB_PASSWORD` | Contraseña del usuario `catalog_user` |
| `ENGAGEMENT_DB_PASSWORD` | Contraseña del usuario `engagement_user` |
| `GCP_SERVICE_ACCOUNT_KEY` | Llave privada JSON de la SA del CI/CD (`github-actions-dev`) |
| `GCS_BACKEND_SERVICE_ACCOUNT_KEY` | Llave privada JSON de la SA del Catalog Media Signer (`dev-catalog-media-signer`) |
| `GHCR_TOKEN` | Personal Access Token (classic) con permiso `write:packages` / `read:packages` |
| `GHCR_USERNAME` | Usuario de GitHub (e.g., `d3r3-k`) |
| `IDENTITY_DB_PASSWORD` | Contraseña del usuario `identity_user` |
| `JWT_SECRET` | Cadena aleatoria segura para firmar tokens JWT |
| `SMTP_FROM` | Dirección de correo del remitente |
| `SMTP_HOST` | Host del servidor SMTP de correo |
| `SMTP_PASSWORD` | Contraseña o App Password de correo |
| `SMTP_USERNAME` | Usuario del servidor SMTP |
| `SUBSCRIPTION_DB_PASSWORD` | Contraseña del usuario `subscription_user` |

#### Instrucciones para obtener o generar los valores de los Secrets:

* **Obtener `GCP_SERVICE_ACCOUNT_KEY`:**
  Ejecute en su PowerShell local para generar e imprimir la llave (copie todo el JSON impreso):
  ```powershell
  gcloud iam service-accounts keys create gcp-github-actions-key.json --iam-account=$env:CICD_SA
  Get-Content -Raw .\gcp-github-actions-key.json
  Remove-Item .\gcp-github-actions-key.json
  ```

* **Obtener `GCS_BACKEND_SERVICE_ACCOUNT_KEY`:**
  Ejecute en su PowerShell local para generar e imprimir la llave (copie todo el JSON impreso):
  ```powershell
  gcloud iam service-accounts keys create gcs-backend-service-account.json --iam-account=$env:MEDIA_SA
  Get-Content -Raw .\gcs-backend-service-account.json
  Remove-Item .\gcs-backend-service-account.json
  ```

* **Generar `JWT_SECRET`:**
  Ejecute en su PowerShell local para generar una clave aleatoria:
  ```powershell
  [System.Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
  ```

* **Obtener las contraseñas de las Bases de Datos:**
  Para consultar los valores asignados en el Paso 0 de su sesión activa, ejecute en PowerShell:
  ```powershell
  Write-Output "IDENTITY: $env:IDENTITY_DB_PASSWORD"
  Write-Output "SUBSCRIPTION: $env:SUBSCRIPTION_DB_PASSWORD"
  Write-Output "CATALOG: $env:CATALOG_DB_PASSWORD"
  Write-Output "ENGAGEMENT: $env:ENGAGEMENT_DB_PASSWORD"
  ```

### 10.4 Variables requeridas

Agregar en **Settings > Environments > develop > Environment variables**:

| Variable                            | Valor Recomendado / Comando para obtener el valor                                         |
| :---------------------------------- | :---------------------------------------------------------------------------------------- |
| `ADMIN_EMAILS`                      | Correo(s) administrador separados por coma (e.g., `admin@example.com`)                    |
| `GCP_PROJECT_ID`                    | `sa-derek-proyecto` *(Obtener con `$env:PROJECT_ID` o `gcloud config get-value project`)* |
| `GCP_REGION`                        | `us-central1` *(Obtener con `$env:REGION`)*                                               |
| `GCP_ZONE`                          | `us-central1-a` *(Obtener con `$env:ZONE`)*                                               |
| `GCS_ALLOWED_IMAGE_TYPES`           | `image/jpeg,image/png,image/webp`                                                         |
| `GCS_ALLOWED_VIDEO_TYPES`           | `video/mp4,video/webm`                                                                    |
| `GCS_BUCKET_NAME`                   | `dev-media-sa-derek-proyecto` *(Obtener con `$env:BUCKET_NAME`)*                          |
| `GCS_MAX_IMAGE_MB`                  | `10`                                                                                      |
| `GCS_MAX_VIDEO_MB`                  | `1024`                                                                                    |
| `GCS_SIGNED_READ_EXPIRES_MINUTES`   | `60`                                                                                      |
| `GCS_SIGNED_UPLOAD_EXPIRES_MINUTES` | `15`                                                                                      |
| `SMTP_PORT`                         | `587`                                                                                     |
| `SMTP_STARTTLS`                     | `true`                                                                                    |
| `VM_FRONTEND_NAME`                  | `dev-vm-frontend`                                                                         |
| `VM_GATEWAY_NAME`                   | `dev-vm-gateway`                                                                          |
| `VM_SERVICES_NAME`                  | `dev-vm-services` |

> [!NOTE]
> No agregar manualmente las IPs de Cloud SQL, Redis ni de las VMs. El workflow las obtiene automaticamente con `gcloud` en cada ejecucion.

---

## Paso 11. Ejecutar el despliegue (CI/CD)

Una vez completados todos los pasos anteriores, el proyecto esta listo para desplegarse mediante GitHub Actions.

### Despliegue automatico

El workflow `.github/workflows/deploy-develop.yml` se ejecuta de manera automatica cada vez que se hace merge a la rama `develop`. El flujo es el siguiente:

```text
ci-checks -> backup-cloud-sql -> build-and-push -> migrate-databases -> deploy -> smoke-test
```

*(Nota: el flujo incluye el nuevo paso `migrate-databases` para ejecutar las migraciones SQL externamente).*

| Etapa               | Que hace                                                                                                                   |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------- |
| `ci-checks`         | Compila el frontend, API Gateway e Identity Service. Ejecuta tests de Catalog y valida los servicios Python.               |
| `backup-cloud-sql`  | Exporta las cuatro bases de datos al bucket de Cloud Storage.                                                              |
| `build-and-push`    | Construye y publica las imagenes Docker en `ghcr.io/d3r3-k/sa_proyecto_g13`.                                               |
| `migrate-databases` | Ejecuta el script `scripts/migrate-develop.sh` para correr las migraciones en la base de datos de manera externa y limpia. |
| `deploy`            | Copia los `docker-compose.yml` y `.env` a las 3 VMs y levanta los contenedores con `RUN_MIGRATIONS=false`.                 |
| `smoke-test`        | Valida que los contenedores esten en ejecucion, verifica los puertos gRPC y el frontend.                                   |

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

Las migraciones se ejecutan de manera externa antes del despliegue de los contenedores a traves de la etapa `migrate-databases` del workflow de CI/CD.

| Base de datos     | Ubicacion de los SQL de migracion          |
| :---------------- | :----------------------------------------- |
| `identity_db`     | `services/identity-service/migrations`     |
| `catalog_db`      | `services/catalog-service/migrations`      |
| `subscription_db` | `services/subscription-service/migrations` |
| `engagement_db`   | `services/engagement-service/migrations`   |

---

## Limpiar datos (Bases de datos y Bucket)

> [!WARNING]
> Estas operaciones son **destructivas** sobre los datos almacenados en el ambiente de desarrollo (`develop`). No afectaran al ambiente de produccion/release ya que la infraestructura se encuentra separada.

Si desea vaciar todos los registros de las bases de datos y los archivos subidos al bucket de desarrollo sin destruir la infraestructura, ejecute:

Borrar y recrear las bases de datos (los usuarios y contraseñas se mantienen intactos):

```powershell
gcloud sql databases delete identity_db --instance=$env:SQL_INSTANCE_NAME --quiet
gcloud sql databases delete subscription_db --instance=$env:SQL_INSTANCE_NAME --quiet
gcloud sql databases delete catalog_db --instance=$env:SQL_INSTANCE_NAME --quiet
gcloud sql databases delete engagement_db --instance=$env:SQL_INSTANCE_NAME --quiet

gcloud sql databases create identity_db --instance=$env:SQL_INSTANCE_NAME
gcloud sql databases create subscription_db --instance=$env:SQL_INSTANCE_NAME
gcloud sql databases create catalog_db --instance=$env:SQL_INSTANCE_NAME
gcloud sql databases create engagement_db --instance=$env:SQL_INSTANCE_NAME
```

Vaciar todos los archivos del bucket (mantiene las configuraciones CORS y permisos):

```powershell
gcloud storage rm gs://$env:BUCKET_NAME/**
```

---

## Limpiar toda la infraestructura

> [!CAUTION]
> Ejecutar esta seccion destruira de manera irreversible todos los recursos del proyecto de desarrollo en GCP, incluyendo bases de datos, VMs, redes y el bucket. Solo debe llevarse a cabo si se desea reiniciar el ambiente completamente desde cero.

```powershell
gcloud compute instances delete dev-vm-frontend dev-vm-gateway dev-vm-services --zone=$env:ZONE --quiet
gcloud redis instances delete $env:REDIS_INSTANCE_NAME --region=$env:REGION --quiet
gcloud sql instances delete $env:SQL_INSTANCE_NAME --quiet
gcloud compute firewall-rules delete dev-allow-internal dev-allow-iap-ssh dev-allow-http dev-allow-gateway dev-allow-grpc-services --quiet
gcloud compute routers nats delete dev-nat --router=dev-router --region=$env:REGION --quiet
gcloud compute routers delete dev-router --region=$env:REGION --quiet
gcloud services vpc-peerings delete --service=servicenetworking.googleapis.com --network=$env:VPC_NAME --quiet
gcloud compute addresses delete dev-redis-range --global --quiet
gcloud compute addresses delete dev-db-range --global --quiet
gcloud compute networks subnets delete dev-subnet-public --region=$env:REGION --quiet
gcloud compute networks subnets delete dev-subnet-private --region=$env:REGION --quiet
gcloud compute networks delete $env:VPC_NAME --quiet
gcloud storage rm -r gs://$env:BUCKET_NAME
gcloud iam service-accounts delete $env:CICD_SA --quiet
```

Si algun recurso no existe, ignore el error y continue con el siguiente comando.

Valide que la limpieza fue completa:

```powershell
gcloud compute instances list --filter="name~dev-"
gcloud redis instances list --region=$env:REGION
gcloud sql instances list
gcloud compute firewall-rules list --filter="name~dev-"
gcloud compute networks list --filter="name=$env:VPC_NAME"
gcloud compute addresses list --global --filter="name~dev-.*-range"
gcloud storage buckets list --filter="name:$env:BUCKET_NAME"
```
