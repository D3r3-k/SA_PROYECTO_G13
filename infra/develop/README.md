# Infraestructura con Terraform y Ansible

> [!IMPORTANT]
> Terraform debe crear, modificar y destruir la infraestructura de GCP. Ansible solo configurara las VMs de desarrollo despues de que Terraform las cree.

## Convencion de comandos

| Si el bloque dice | Ejecutar en                        |
| ----------------- | ---------------------------------- |
| `powershell`      | PowerShell de Windows              |
| `bash`            | Ubuntu dentro de WSL               |
| `text`            | Solo leer o copiar como referencia |

Herramientas por entorno:

| Entorno            | Herramientas                                                                |
| ------------------ | --------------------------------------------------------------------------- |
| Windows PowerShell | `gcloud`, `terraform`, `kubectl`, `gke-gcloud-auth-plugin`, `docker`, `git` |
| WSL Ubuntu         | `ansible`, `ssh`, validaciones de Ansible                                   |

## Ambientes

| Ambiente  | Plataforma                      | Uso                                              |
| --------- | ------------------------------- | ------------------------------------------------ |
| `develop` | Compute Engine + Docker Compose | 3 VMs: frontend, gateway y servicios             |
| `release` | GKE + Kubernetes                | Produccion con manifests de `deploy/release/k8s` |

## Paso 1. Instalar herramientas

### 1.1 Instalar Google Cloud SDK en Windows

1. Abrir el instalador oficial:

```powershell
https://cloud.google.com/sdk/docs/install
```

2. Instalar Google Cloud SDK.
3. Cerrar y volver a abrir PowerShell.
4. Validar:

```powershell
gcloud --version
```

Si PowerShell no reconoce `gcloud`, reiniciar la terminal o la computadora.

### 1.2 Instalar Terraform en Windows

1. Abrir la guia oficial:

```powershell
https://developer.hashicorp.com/terraform/install
```

2. Instalar Terraform.
3. Cerrar y volver a abrir PowerShell.
4. Validar:

```powershell
terraform version
```

### 1.3 Instalar WSL Ubuntu y Ansible

Ansible se ejecutara desde Ubuntu en WSL, no desde PowerShell.

Primero validar si ya existe una distribucion WSL:

```powershell
wsl --list --verbose
```

Si aparece `Ubuntu`, no ejecutar `wsl --install` otra vez. Entrar a Ubuntu con:

```powershell
wsl -d Ubuntu
```

Si aparece otra distribucion, usar su nombre exacto:

```powershell
wsl -d <NOMBRE_DISTRIBUCION>
```

Si no aparece ninguna distribucion, instalar Ubuntu:

```powershell
wsl --install -d Ubuntu
```

Si aparece este error:

```text
Ya existe una distribucion con el nombre proporcionado.
Codigo de error: Wsl/InstallDistro/ERROR_ALREADY_EXISTS
```

No es un error critico. Significa que Ubuntu ya existe. Ejecutar:

```powershell
wsl --list --verbose
wsl -d Ubuntu
```

Cuando ya estes dentro de Ubuntu, el prompt cambia a algo similar a:

```text
usuario@equipo:~$
```

Instalar Ansible dentro de Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ansible python3-pip sshpass
ansible --version
```

### 1.4 Instalar kubectl y plugin de GKE en Windows

Este paso se ejecuta en PowerShell, no en WSL.

```powershell
gcloud components install kubectl
gcloud components install gke-gcloud-auth-plugin
$env:USE_GKE_GCLOUD_AUTH_PLUGIN="True"
[Environment]::SetEnvironmentVariable("USE_GKE_GCLOUD_AUTH_PLUGIN", "True", "User")
kubectl version --client
gke-gcloud-auth-plugin --version
```

### 1.5 Instalar Docker Desktop y Git en Windows

Docker Desktop se instala en Windows. WSL solo usara la integracion de Docker Desktop.

1. Instalar Docker Desktop.
2. Abrir Docker Desktop.
3. Ir a `Settings > General`.
4. Activar `Use the WSL 2 based engine`.
5. Ir a `Settings > Resources > WSL integration`.
6. Activar la integracion con `Ubuntu`.
7. Aplicar cambios y reiniciar Docker Desktop si lo solicita.

Validar desde PowerShell:

```powershell
docker --version
docker compose version
git --version
```

Validar desde Ubuntu/WSL:

```bash
docker --version
docker compose version
```

## Paso 2. Autenticarse en GCP

Ejecutar en PowerShell.

Iniciar sesion:

```powershell
gcloud auth login
gcloud auth application-default login
gcloud init
```

Configurar el proyecto nuevo:

```powershell
$env:PROJECT_ID="sa-proyecto-derek"
$env:REGION="us-central1"
$env:ZONE="us-central1-a"

gcloud config set project $env:PROJECT_ID
gcloud config set compute/region $env:REGION
gcloud config set compute/zone $env:ZONE
```

Validar que quedo seleccionado el proyecto correcto:

```powershell
gcloud config get-value project
```

Debe responder:

```text
sa-proyecto-derek
```

## Paso 3. Activar APIs de GCP

Ejecutar en PowerShell.

```powershell
gcloud services enable compute.googleapis.com
gcloud services enable serviceusage.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com
gcloud services enable servicenetworking.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable iam.googleapis.com
gcloud services enable container.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable iap.googleapis.com
```

Validar APIs activas:

```powershell
gcloud services list --enabled
```

## Paso 4. Preparar el state de Terraform

Terraform necesita un bucket para guardar su estado.

Ejecutar en PowerShell:

```powershell
$env:TF_STATE_BUCKET="sa-proyecto-derek-tfstate"

gcloud storage buckets create gs://$env:TF_STATE_BUCKET --location=$env:REGION --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://$env:TF_STATE_BUCKET --versioning
gcloud storage buckets describe gs://$env:TF_STATE_BUCKET
```

Si el bucket ya existe, no crearlo otra vez. Solo validar:

```powershell
gcloud storage buckets describe gs://sa-proyecto-derek-tfstate
```

## Paso 5. Crear Terraform para `develop`

Los archivos Terraform de `develop` ya estan creados.

Estructura creada:

```text
infra/develop/terraform/
  environments/
    develop/
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
    firewall/
```

Terraform debe crear en `develop`:

| Recurso                | Nombre                                                          |
| ---------------------- | --------------------------------------------------------------- |
| VPC                    | `dev-vpc`                                                       |
| Subred publica         | `dev-subnet-public`                                             |
| Subred privada         | `dev-subnet-private`                                            |
| Cloud Router/NAT       | `dev-router`, `dev-nat`                                         |
| Private Service Access | rangos para Cloud SQL y Redis                                   |
| Cloud SQL PostgreSQL   | `dev-postgres`                                                  |
| Bases de datos         | `identity_db`, `subscription_db`, `catalog_db`, `engagement_db` |
| Redis                  | `dev-redis`                                                     |
| Bucket multimedia      | `dev-media-sa-proyecto-derek`                                   |
| VMs                    | `dev-vm-frontend`, `dev-vm-gateway`, `dev-vm-services`          |
| Firewalls              | HTTP, SSH por IAP, trafico interno, gateway y gRPC              |
| Service Accounts       | CI/CD y firma de URLs de Catalog                                |

Outputs requeridos:

```text
frontend_public_ip
gateway_private_ip
services_private_ip
cloud_sql_private_ip
redis_host
redis_port
bucket_name
```

### 5.1 Preparar variables de Terraform

Ejecutar en PowerShell desde la raiz del proyecto:

```powershell
Copy-Item infra/develop/terraform/environments/develop/terraform.tfvars.example infra/develop/terraform/environments/develop/terraform.tfvars
notepad infra/develop/terraform/environments/develop/terraform.tfvars
```

Editar `terraform.tfvars` y cambiar todas las contrasenas:

```text
postgres_root_password
identity_db_password
subscription_db_password
catalog_db_password
engagement_db_password
```

> [!IMPORTANT]
> `terraform.tfvars` no debe subirse a GitHub. Ya esta ignorado por `.gitignore`.

### 5.2 Inicializar Terraform

Ejecutar en PowerShell:

```powershell
cd infra/develop/terraform/environments/develop
terraform init
```

Si el bucket `sa-proyecto-derek-tfstate` no existe, volver al Paso 4 y crearlo antes de continuar.

Si aparece un error como:

```text
Failed to get existing workspaces: querying Cloud Storage failed
storage: bucket doesn't exist
The requested project was not found
```

Ejecutar estas validaciones en PowerShell:

```powershell
gcloud config get-value project
gcloud projects describe sa-proyecto-derek
gcloud storage buckets describe gs://sa-proyecto-derek-tfstate
```

El primer comando debe responder:

```text
sa-proyecto-derek
```

Si responde otro proyecto, corregirlo:

```powershell
gcloud config set project sa-proyecto-derek
gcloud auth application-default set-quota-project sa-proyecto-derek
```

Si el bucket no existe, crearlo desde PowerShell:

```powershell
$env:PROJECT_ID="sa-proyecto-derek"
$env:REGION="us-central1"
$env:TF_STATE_BUCKET="sa-proyecto-derek-tfstate"

gcloud config set project $env:PROJECT_ID
gcloud services enable storage.googleapis.com
gcloud storage buckets create gs://$env:TF_STATE_BUCKET --location=$env:REGION --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://$env:TF_STATE_BUCKET --versioning
gcloud storage buckets describe gs://$env:TF_STATE_BUCKET
```

Luego volver a inicializar Terraform:

```powershell
terraform init -reconfigure
```

### 5.3 Validar archivos

Ejecutar en PowerShell:

```powershell
terraform fmt -check -recursive ..\..
terraform validate
```

Si `terraform fmt -check` muestra archivos con formato pendiente, ejecutar:

```powershell
terraform fmt -recursive ..\..
```

Luego validar otra vez:

```powershell
terraform fmt -check -recursive ..\..
terraform validate
```

### 5.4 Revisar el plan

Ejecutar:

```powershell
terraform plan -var-file="terraform.tfvars"
```

Revisar que el plan muestre recursos de `develop`, por ejemplo:

```text
dev-vpc
dev-subnet-public
dev-subnet-private
dev-postgres
dev-redis
dev-media-sa-proyecto-derek
dev-vm-frontend
dev-vm-gateway
dev-vm-services
```

### 5.5 Crear infraestructura de `develop`

Ejecutar:

```powershell
terraform apply -var-file="terraform.tfvars"
```

Cuando Terraform pregunte:

```text
Do you want to perform these actions?
```

Escribir:

```text
yes
```

Si falla Cloud SQL con este error:

```text
Invalid Tier (db-custom-1-4096) for (ENTERPRISE_PLUS) Edition
```

Actualizar el codigo del repositorio y volver a ejecutar:

```powershell
terraform plan -var-file="terraform.tfvars"
terraform apply -var-file="terraform.tfvars"
```

La instancia `dev-postgres` debe usar:

```text
edition = "ENTERPRISE"
tier    = "db-custom-1-4096"
```

No destruir la infraestructura si ya se crearon Redis, VPC, subredes u otros recursos. Terraform continuara creando lo pendiente.

### 5.6 Ver outputs

Ejecutar:

```powershell
terraform output
```

Guardar estos valores para los siguientes pasos:

```text
frontend_public_ip
gateway_private_ip
services_private_ip
cloud_sql_private_ip
redis_host
redis_port
bucket_name
```

### 5.7 Destruir `develop` y limpiar el proyecto

> [!WARNING]
> Este comando elimina la infraestructura de desarrollo creada por Terraform: VPC, subredes, NAT, firewall, Cloud SQL, Redis, bucket multimedia, Service Accounts y VMs. Usarlo solo si se quiere reiniciar `develop` desde cero.

Antes de destruir, validar que se esta en el proyecto correcto:

```powershell
gcloud config get-value project
```

Debe responder:

```text
sa-proyecto-derek
```

Entrar al ambiente `develop`:

```powershell
cd D:\Proyectos\Universidad\2026-1V\SA_PROYECTO_G13\infra\terraform\environments\develop
```

Revisar que Terraform detecta los recursos:

```powershell
terraform state list
```

Destruir la infraestructura:

```powershell
terraform destroy -var-file="terraform.tfvars"
```

Cuando Terraform pregunte:

```text
Do you really want to destroy all resources?
```

Escribir:

```text
yes
```

Validar que ya no queden outputs:

```powershell
terraform output
```

Si responde que no hay outputs, la limpieza de Terraform termino.

## Paso 6. Crear Ansible para `develop`

Los archivos de Ansible para `develop` ya estan creados.

> [!IMPORTANT]
> Este paso se ejecuta desde Ubuntu/WSL. Como las VMs privadas usan IAP, `gcloud` tambien debe estar disponible dentro de WSL para que Ansible pueda conectarse.

Estructura creada:

```text
infra/develop/ansible/
  ansible.cfg
  inventories/
    develop/
      hosts.ini.example
      group_vars/
        all.yml.example
  playbooks/
    prepare-develop-vms.yml
  roles/
    docker/
    deploy-user/
    app-directories/
    validations/
```

Ansible debe configurar las VMs:

| Tarea      | Descripcion                                              |
| ---------- | -------------------------------------------------------- |
| Docker     | Instalar Docker Engine y Docker Compose plugin           |
| Usuario    | Validar permisos para usar Docker                        |
| Carpetas   | Crear carpetas remotas para frontend, gateway y services |
| Validacion | Confirmar conectividad y versiones instaladas            |

Ansible no debe crear recursos de GCP.

### 6.1 Entrar a Ubuntu/WSL

Ejecutar en PowerShell:

```powershell
wsl -d Ubuntu
```

Entrar al proyecto desde Ubuntu:

```bash
cd /mnt/d/Proyectos/Universidad/2026-1V/SA_PROYECTO_G13
```

### 6.2 Validar Ansible y gcloud en WSL

Ejecutar dentro de Ubuntu/WSL:

```bash
ansible --version
gcloud --version
```

Si `gcloud` no existe dentro de WSL, instalarlo dentro de Ubuntu siguiendo la guia oficial:

```bash
https://cloud.google.com/sdk/docs/install#deb
```

Luego autenticarse desde WSL:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project sa-proyecto-derek
gcloud config set compute/zone us-central1-a
```

Validar:

```bash
gcloud config get-value project
```

Debe responder:

```text
sa-proyecto-derek
```

### 6.3 Crear archivos reales desde los ejemplos

Ejecutar dentro de Ubuntu/WSL:

```bash
cp infra/develop/ansible/inventories/develop/hosts.ini.example infra/develop/ansible/inventories/develop/hosts.ini
cp infra/develop/ansible/inventories/develop/group_vars/all.yml.example infra/develop/ansible/inventories/develop/group_vars/all.yml
```

Editar el inventario:

```bash
nano infra/develop/ansible/inventories/develop/hosts.ini
```

Cambiar:

```text
ansible_user=CAMBIAR_USUARIO_LINUX
```

por el usuario Linux que usara OS Login en las VMs.

Para ver el usuario que usa `gcloud compute ssh`, ejecutar:

```bash
gcloud compute ssh dev-vm-frontend --tunnel-through-iap --zone=us-central1-a --dry-run
```

Si se ejecuta desde PowerShell, puede salir algo parecido a:

```text
"C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\sdk\putty.exe" ... usr_3082400220608_ingenieria_usa@compute.8661020912278046439
```

Ese texto no es un error. El usuario es la parte antes de `@compute`:

```text
usr_3082400220608_ingenieria_usa
```

Editar `hosts.ini` y dejarlo asi:

```text
ansible_user=usr_3082400220608_ingenieria_usa
```

> [!NOTE]
> El valor exacto puede ser diferente en otra cuenta. Usar siempre el usuario que aparezca en su salida de `--dry-run`.

### 6.4 Probar conexion SSH por IAP

Ejecutar dentro de Ubuntu/WSL:

```bash
gcloud compute ssh dev-vm-frontend --tunnel-through-iap --zone=us-central1-a
```

Si entra a la VM, salir:

```bash
exit
```

Repetir la prueba con las VMs privadas:

```bash
gcloud compute ssh dev-vm-gateway --tunnel-through-iap --zone=us-central1-a
exit
gcloud compute ssh dev-vm-services --tunnel-through-iap --zone=us-central1-a
exit
```

Estas conexiones son importantes porque `gcloud` crea o registra la llave SSH de WSL:

```text
~/.ssh/google_compute_engine
~/.ssh/google_compute_engine.pub
```

Validar que la llave exista dentro de Ubuntu/WSL:

```bash
ls -la ~/.ssh/google_compute_engine ~/.ssh/google_compute_engine.pub
```

El inventario debe tener esta linea:

```text
ansible_ssh_private_key_file=~/.ssh/google_compute_engine
```

Si Ansible falla con:

```text
Permission denied (publickey)
```

volver a ejecutar desde WSL:

```bash
gcloud compute ssh dev-vm-frontend --tunnel-through-iap --zone=us-central1-a
exit
gcloud compute ssh dev-vm-gateway --tunnel-through-iap --zone=us-central1-a
exit
gcloud compute ssh dev-vm-services --tunnel-through-iap --zone=us-central1-a
exit
```

Luego intentar Ansible otra vez.

### 6.5 Validar inventario de Ansible

Ejecutar dentro de Ubuntu/WSL:

```bash
cd infra/develop/ansible
ansible-inventory -i inventories/develop/hosts.ini --list
```

### 6.6 Ejecutar playbook

Ejecutar dentro de Ubuntu/WSL, desde `infra/develop/ansible`:

```bash
ANSIBLE_CONFIG=$PWD/ansible.cfg ansible-playbook -i inventories/develop/hosts.ini playbooks/prepare-develop-vms.yml
```

Si aparece este warning:

```text
Ansible is being run in a world writable directory ... ignoring it as an ansible.cfg source
```

No es un error del playbook. Sucede porque el proyecto esta en `/mnt/d`, que es un disco de Windows montado en WSL. El comando anterior usa `ANSIBLE_CONFIG=$PWD/ansible.cfg` para indicar el archivo de configuracion de forma explicita.

Si aparece este error:

```text
'docker_users' is undefined
```

Actualizar el codigo del repositorio y volver a ejecutar el mismo comando. El playbook ya incluye valores por defecto para `docker_users` y `app_directories`.

El playbook debe:

```text
instalar Docker
instalar Docker Compose plugin
crear carpetas remotas
validar versiones de Docker
```

### 6.7 Validar Docker en una VM

Ejecutar dentro de Ubuntu/WSL:

```bash
gcloud compute ssh dev-vm-services --tunnel-through-iap --zone=us-central1-a
```

Dentro de la VM:

```bash
docker --version
docker compose version
ls -la ~/quetxal-tv
exit
```

## Paso 7. Configurar Secrets y Variables de `develop` en GitHub

Para que los flujos de integración y despliegue continuo (CI/CD) de GitHub Actions puedan interactuar con la infraestructura que has creado, es necesario configurar el entorno `develop` en tu repositorio.

### 7.1 Crear entorno en GitHub

1. Ir a tu repositorio en GitHub.
2. Navegar a **Settings** > **Environments**.
3. Crear el entorno: `develop`

### 7.2 Configurar Secrets de CI/CD y variables locales

Agrega estos *Secrets* en **Settings** > **Environments** > **develop** > **Environment secrets**:

| Secret                            | Descripción                                                                       |
| :-------------------------------- | :-------------------------------------------------------------------------------- |
| `CATALOG_DB_PASSWORD`             | Contraseña del usuario `catalog_user`                                             |
| `ENGAGEMENT_DB_PASSWORD`          | Contraseña del usuario `engagement_user`                                          |
| `GCP_SERVICE_ACCOUNT_KEY`         | Llave privada JSON de la SA del CI/CD (`github-actions-dev`)                      |
| `GCS_BACKEND_SERVICE_ACCOUNT_KEY` | Llave privada JSON de la SA del Catalog Media Signer (`dev-catalog-media-signer`) |
| `GHCR_TOKEN`                      | Personal Access Token (classic) con permiso `write:packages` / `read:packages`    |
| `GHCR_USERNAME`                   | Usuario de GitHub (e.g., `d3r3-k`)                                                |
| `IDENTITY_DB_PASSWORD`            | Contraseña del usuario `identity_user`                                            |
| `JWT_SECRET`                      | Cadena aleatoria segura para firmar tokens JWT                                    |
| `SMTP_FROM`                       | Dirección de correo del remitente                                                 |
| `SMTP_HOST`                       | Host del servidor SMTP de correo                                                  |
| `SMTP_PASSWORD`                   | Contraseña o App Password de correo                                               |
| `SMTP_USERNAME`                   | Usuario del servidor SMTP                                                         |
| `SUBSCRIPTION_DB_PASSWORD`        | Contraseña del usuario `subscription_user`                                        |

> [!NOTE]
> Además de GitHub, estos valores son los que necesitarás en tus archivos `.env` locales para desarrollar.

**Instrucciones para obtener los Secrets de GCP y SSH:**

1. Obtener la llave para `GCP_SERVICE_ACCOUNT_KEY`:

```powershell
gcloud iam service-accounts keys create gcp-github-actions-key.json --iam-account=github-actions-dev@sa-proyecto-derek.iam.gserviceaccount.com
cat gcp-github-actions-key.json
rm gcp-github-actions-key.json
```

2. Obtener la llave para `GCS_BACKEND_SERVICE_ACCOUNT_KEY`:

```powershell
gcloud iam service-accounts keys create gcs-backend-service-account.json --iam-account=dev-catalog-media-signer@sa-proyecto-derek.iam.gserviceaccount.com
cat gcs-backend-service-account.json
rm gcs-backend-service-account.json
```

3. Generar un `JWT_SECRET` seguro aleatorio (puedes usar openssl):

```bash
openssl rand -base64 32
```

> [!NOTE]
> Las contraseñas de las bases de datos (`POSTGRES_ROOT_PASSWORD`, etc.) son las que configuraste en tu archivo `terraform.tfvars`.

### 7.3 Configurar Variables de CI/CD y Local

En GitHub (**Environment variables**), agrega las siguientes variables. Varias de estas también irán a tu `.env` de desarrollo local.

| Variable                            | Valor Recomendado / Comando para obtener el valor                      |
| :---------------------------------- | :--------------------------------------------------------------------- |
| `ADMIN_EMAILS`                      | Correo(s) administrador separados por coma (e.g., `admin@example.com`) |
| `GCP_PROJECT_ID`                    | `sa-proyecto-derek` *(Obtener con `gcloud config get-value project`)*  |
| `GCP_REGION`                        | `us-central1`                                                          |
| `GCP_ZONE`                          | `us-central1-a`                                                        |
| `GCS_ALLOWED_IMAGE_TYPES`           | `image/jpeg,image/png,image/webp`                                      |
| `GCS_ALLOWED_VIDEO_TYPES`           | `video/mp4,video/webm`                                                 |
| `GCS_BUCKET_NAME`                   | Nombre del bucket *(Obtener con Terraform)*                            |
| `GCS_MAX_IMAGE_MB`                  | `10`                                                                   |
| `GCS_MAX_VIDEO_MB`                  | `1024`                                                                 |
| `GCS_SIGNED_READ_EXPIRES_MINUTES`   | `60`                                                                   |
| `GCS_SIGNED_UPLOAD_EXPIRES_MINUTES` | `15`                                                                   |
| `SMTP_PORT`                         | `587`                                                                  |
| `SMTP_STARTTLS`                     | `true`                                                                 |
| `VM_FRONTEND_NAME`                  | `dev-vm-frontend`                                                      |
| `VM_GATEWAY_NAME`                   | `dev-vm-gateway`                                                       |
| `VM_SERVICES_NAME`                  | `dev-vm-services`                                                      |


**Instrucciones para extraer las variables dinámicas:**

1. Obtener el ID del proyecto (`GCP_PROJECT_ID`):

```powershell
gcloud config get-value project
```bash
gcloud compute ssh dev-vm-gateway --tunnel-through-iap --zone=us-central1-a
exit
gcloud compute ssh dev-vm-services --tunnel-through-iap --zone=us-central1-a
exit
```

Estas conexiones son importantes porque `gcloud` crea o registra la llave SSH de WSL:

```text
~/.ssh/google_compute_engine
~/.ssh/google_compute_engine.pub
```

Validar que la llave exista dentro de Ubuntu/WSL:

```bash
ls -la ~/.ssh/google_compute_engine ~/.ssh/google_compute_engine.pub
```

El inventario debe tener esta linea:

```text
ansible_ssh_private_key_file=~/.ssh/google_compute_engine
```

Si Ansible falla con:

```text
Permission denied (publickey)
```

volver a ejecutar desde WSL:

```bash
gcloud compute ssh dev-vm-frontend --tunnel-through-iap --zone=us-central1-a
exit
gcloud compute ssh dev-vm-gateway --tunnel-through-iap --zone=us-central1-a
exit
gcloud compute ssh dev-vm-services --tunnel-through-iap --zone=us-central1-a
exit
```

Luego intentar Ansible otra vez.

### 6.5 Validar inventario de Ansible

Ejecutar dentro de Ubuntu/WSL:

```bash
cd infra/develop/ansible
ansible-inventory -i inventories/develop/hosts.ini --list
```

### 6.6 Ejecutar playbook

Ejecutar dentro de Ubuntu/WSL, desde `infra/develop/ansible`:

```bash
ANSIBLE_CONFIG=$PWD/ansible.cfg ansible-playbook -i inventories/develop/hosts.ini playbooks/prepare-develop-vms.yml
```

Si aparece este warning:

```text
Ansible is being run in a world writable directory ... ignoring it as an ansible.cfg source
```

No es un error del playbook. Sucede porque el proyecto esta en `/mnt/d`, que es un disco de Windows montado en WSL. El comando anterior usa `ANSIBLE_CONFIG=$PWD/ansible.cfg` para indicar el archivo de configuracion de forma explicita.

Si aparece este error:

```text
'docker_users' is undefined
```

Actualizar el codigo del repositorio y volver a ejecutar el mismo comando. El playbook ya incluye valores por defecto para `docker_users` y `app_directories`.

El playbook debe:

```text
instalar Docker
instalar Docker Compose plugin
crear carpetas remotas
validar versiones de Docker
```

### 6.7 Validar Docker en una VM

Ejecutar dentro de Ubuntu/WSL:

```bash
gcloud compute ssh dev-vm-services --tunnel-through-iap --zone=us-central1-a
```

Dentro de la VM:

```bash
docker --version
docker compose version
ls -la ~/quetxal-tv
exit
```

## Paso 7. Configurar Secrets y Variables de `develop` en GitHub

Para que los flujos de integración y despliegue continuo (CI/CD) de GitHub Actions puedan interactuar con la infraestructura que has creado, es necesario configurar el entorno `develop` en tu repositorio.

### 7.1 Crear entorno en GitHub

1. Ir a tu repositorio en GitHub.
2. Navegar a **Settings** > **Environments**.
3. Crear el entorno: `develop`

### 7.2 Configurar Secrets de CI/CD y variables locales

Agrega estos *Secrets* en **Settings** > **Environments** > **develop** > **Environment secrets**:

| Secret                            | Descripción                                                                       |
| :-------------------------------- | :-------------------------------------------------------------------------------- |
| `CATALOG_DB_PASSWORD`             | Contraseña del usuario `catalog_user`                                             |
| `ENGAGEMENT_DB_PASSWORD`          | Contraseña del usuario `engagement_user`                                          |
| `GCP_SERVICE_ACCOUNT_KEY`         | Llave privada JSON de la SA del CI/CD (`github-actions-dev`)                      |
| `GCS_BACKEND_SERVICE_ACCOUNT_KEY` | Llave privada JSON de la SA del Catalog Media Signer (`dev-catalog-media-signer`) |
| `GHCR_TOKEN`                      | Personal Access Token (classic) con permiso `write:packages` / `read:packages`    |
| `GHCR_USERNAME`                   | Usuario de GitHub (e.g., `d3r3-k`)                                                |
| `IDENTITY_DB_PASSWORD`            | Contraseña del usuario `identity_user`                                            |
| `JWT_SECRET`                      | Cadena aleatoria segura para firmar tokens JWT                                    |
| `SMTP_FROM`                       | Dirección de correo del remitente                                                 |
| `SMTP_HOST`                       | Host del servidor SMTP de correo                                                  |
| `SMTP_PASSWORD`                   | Contraseña o App Password de correo                                               |
| `SMTP_USERNAME`                   | Usuario del servidor SMTP                                                         |
| `SUBSCRIPTION_DB_PASSWORD`        | Contraseña del usuario `subscription_user`                                        |

> [!NOTE]
> Además de GitHub, estos valores son los que necesitarás en tus archivos `.env` locales para desarrollar.

**Instrucciones para obtener los Secrets de GCP y SSH:**

1. Obtener la llave para `GCP_SERVICE_ACCOUNT_KEY`:

```powershell
gcloud iam service-accounts keys create gcp-github-actions-key.json --iam-account=github-actions-dev@sa-proyecto-derek.iam.gserviceaccount.com
cat gcp-github-actions-key.json
rm gcp-github-actions-key.json
```

2. Obtener la llave para `GCS_BACKEND_SERVICE_ACCOUNT_KEY`:

```powershell
gcloud iam service-accounts keys create gcs-backend-service-account.json --iam-account=dev-catalog-media-signer@sa-proyecto-derek.iam.gserviceaccount.com
cat gcs-backend-service-account.json
rm gcs-backend-service-account.json
```

3. Generar un `JWT_SECRET` seguro aleatorio (puedes usar openssl):

```bash
openssl rand -base64 32
```

> [!NOTE]
> Las contraseñas de las bases de datos (`POSTGRES_ROOT_PASSWORD`, etc.) son las que configuraste en tu archivo `terraform.tfvars`.

### 7.3 Configurar Variables de CI/CD y Local

En GitHub (**Environment variables**), agrega las siguientes variables. Varias de estas también irán a tu `.env` de desarrollo local.

| Variable                            | Valor Recomendado / Comando para obtener el valor                      |
| :---------------------------------- | :--------------------------------------------------------------------- |
| `ADMIN_EMAILS`                      | Correo(s) administrador separados por coma (e.g., `admin@example.com`) |
| `GCP_PROJECT_ID`                    | `sa-proyecto-derek` *(Obtener con `gcloud config get-value project`)*  |
| `GCP_REGION`                        | `us-central1`                                                          |
| `GCP_ZONE`                          | `us-central1-a`                                                        |
| `GCS_ALLOWED_IMAGE_TYPES`           | `image/jpeg,image/png,image/webp`                                      |
| `GCS_ALLOWED_VIDEO_TYPES`           | `video/mp4,video/webm`                                                 |
| `GCS_BUCKET_NAME`                   | Nombre del bucket *(Obtener con Terraform)*                            |
| `GCS_MAX_IMAGE_MB`                  | `10`                                                                   |
| `GCS_MAX_VIDEO_MB`                  | `1024`                                                                 |
| `GCS_SIGNED_READ_EXPIRES_MINUTES`   | `60`                                                                   |
| `GCS_SIGNED_UPLOAD_EXPIRES_MINUTES` | `15`                                                                   |
| `SMTP_PORT`                         | `587`                                                                  |
| `SMTP_STARTTLS`                     | `true`                                                                 |
| `VM_FRONTEND_NAME`                  | `dev-vm-frontend`                                                      |
| `VM_GATEWAY_NAME`                   | `dev-vm-gateway`                                                       |
| `VM_SERVICES_NAME`                  | `dev-vm-services`                                                      |


**Instrucciones para extraer las variables dinámicas:**

1. Obtener el ID del proyecto (`GCP_PROJECT_ID`):

```powershell
gcloud config get-value project
```

2. Extraer el nombre del bucket de Storage (`GCS_BUCKET_NAME`) creado por Terraform:

```powershell
cd infra/develop/terraform/environments/develop
terraform output -raw bucket_name
```

## Paso 8. Validar uso de Terraform y Ansible

Para demostrar que Terraform y Ansible realmente estan gestionando la infraestructura y configuracion, puedes usar los siguientes comandos.

### 8.1 Demostrar uso de Terraform

Desde PowerShell en la carpeta `infra/develop/terraform/environments/develop`:

Ver todos los recursos administrados por Terraform:

```powershell
terraform state list
```

Verificar si hay cambios manuales no registrados en Terraform (Drift detection):

```powershell
terraform plan -var-file="terraform.tfvars"
```

### 8.2 Demostrar uso de Ansible

Desde Ubuntu/WSL en la carpeta `infra/develop/ansible`:

Validar conectividad y control sobre todas las VMs usando el modulo `ping` de Ansible:

```bash
ANSIBLE_CONFIG=$PWD/ansible.cfg ansible -i inventories/develop/hosts.ini all -m ping
```

Si todo esta correcto, Ansible respondera con `"ping": "pong"` para cada VM, demostrando que tiene control administrativo.
