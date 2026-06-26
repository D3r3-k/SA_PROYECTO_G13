# Ansible

Esta carpeta configura las VMs de desarrollo despues de que Terraform las crea.

> [!IMPORTANT]
> Ansible no crea infraestructura cloud. Solo prepara sistema operativo, Docker, carpetas remotas y validaciones en VMs.

## Estructura

```text
infra/ansible/
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

## Requisito para IAP

Las VMs `dev-vm-gateway` y `dev-vm-services` no tienen IP publica. Ansible se conecta por IAP usando `gcloud compute start-iap-tunnel`.

Por eso, dentro de WSL debe existir:

```bash
ansible --version
gcloud --version
```

Configurar proyecto dentro de WSL:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project sa-proyecto-derek
gcloud config set compute/zone us-central1-a
```

## Uso

Desde WSL:

```bash
cd /mnt/d/Proyectos/Universidad/2026-1V/SA_PROYECTO_G13
cp infra/ansible/inventories/develop/hosts.ini.example infra/ansible/inventories/develop/hosts.ini
cp infra/ansible/inventories/develop/group_vars/all.yml.example infra/ansible/inventories/develop/group_vars/all.yml
nano infra/ansible/inventories/develop/hosts.ini
```

Cambiar:

```text
ansible_user=CAMBIAR_USUARIO_LINUX
```

Validar que el inventario tenga esta llave:

```text
ansible_ssh_private_key_file=~/.ssh/google_compute_engine
```

Antes de ejecutar Ansible, conectarse una vez a cada VM desde WSL:

```bash
gcloud compute ssh dev-vm-frontend --tunnel-through-iap --zone=us-central1-a
exit
gcloud compute ssh dev-vm-gateway --tunnel-through-iap --zone=us-central1-a
exit
gcloud compute ssh dev-vm-services --tunnel-through-iap --zone=us-central1-a
exit
```

Validar inventario:

```bash
cd infra/ansible
ansible-inventory -i inventories/develop/hosts.ini --list
```

Ejecutar playbook:

```bash
ANSIBLE_CONFIG=$PWD/ansible.cfg ansible-playbook -i inventories/develop/hosts.ini playbooks/prepare-develop-vms.yml
```

## Alcance

Ansible prepara:

- Docker Engine.
- Docker Compose plugin.
- Usuario remoto con permisos de Docker.
- Carpetas remotas de `frontend`, `gateway` y `services`.
- Validaciones basicas.

Ansible no administra:

- VPC.
- Subredes.
- Firewalls.
- Cloud SQL.
- Redis.
- Buckets.
- Service Accounts.
- GKE.
