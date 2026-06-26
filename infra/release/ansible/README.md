# Ansible Release

Ansible en `release` solo valida acceso local al cluster GKE y crea el namespace si no existe.

> [!IMPORTANT]
> La infraestructura de produccion la crea Terraform. Ansible no crea VPC, Cloud SQL, Redis, buckets ni GKE.

## Preparar archivos

Abrir Ubuntu/WSL desde PowerShell:

```powershell
wsl -d Ubuntu
```

Entrar al proyecto:

```bash
cd /mnt/d/Proyectos/Universidad/2026-1V/SA_PROYECTO_G13
```

Validar herramientas:

```bash
gcloud --version
kubectl version --client
ansible --version
```

Configurar GCP:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project sa-proyecto-derek
gcloud config set compute/region us-central1
gcloud config set compute/zone us-central1-a
```

Crear archivos reales:

```bash
cp infra/release/ansible/inventories/release/hosts.ini.example infra/release/ansible/inventories/release/hosts.ini
cp infra/release/ansible/inventories/release/group_vars/all.yml.example infra/release/ansible/inventories/release/group_vars/all.yml
```

## Ejecutar validacion

```bash
cd infra/release/ansible
ANSIBLE_CONFIG=$PWD/ansible.cfg ansible-inventory -i inventories/release/hosts.ini --list
ANSIBLE_CONFIG=$PWD/ansible.cfg ansible-playbook -i inventories/release/hosts.ini playbooks/validate-release.yml
```
