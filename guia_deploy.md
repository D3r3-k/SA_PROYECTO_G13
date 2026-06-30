# Guía Paso a Paso para Despliegue de Release (GCP)

Esta guía documenta el proceso completo para destruir y levantar la infraestructura del proyecto desde cero, así como su configuración utilizando Terraform y Ansible.

## Fase 1: Destrucción de la Infraestructura Existente

Para garantizar un inicio limpio, primero procedemos a destruir cualquier infraestructura existente en el entorno de release.

1. **Ubicarse en el directorio de Terraform:**
   Abre PowerShell y navega a la carpeta de configuración del entorno *release*:
   ```powershell
   cd D:\Proyectos\Universidad\2026-1V\SA_PROYECTO_G13\infra\release\terraform\environments\release
   ```

2. **(Opcional) Solucionar problemas de versiones de dependencias:**
   Si al intentar destruir marca un error de `Inconsistent dependency lock file`, actualiza los proveedores con:
   ```powershell
   terraform init -upgrade
   ```

3. **Destruir la infraestructura:**
   Ejecuta el siguiente comando para destruir todos los recursos asociados al entorno.
   ```powershell
   terraform destroy -var-file="terraform.tfvars"
   ```
   > **Nota:** Durante el proceso te preguntará `Do you really want to destroy all resources?`, escribe `yes`. Si marca error por bases de datos o red ocupada (por retardos en la desconexión de GCP), simplemente espera un minuto y vuelve a ejecutar el mismo comando hasta que termine de limpiar los recursos restantes.

## Fase 2: Despliegue de la Infraestructura

Una vez que el entorno está limpio, procedemos a crear todos los recursos en la nube.

1. **Validar la configuración y planificar:**
   Es una buena práctica asegurarse de que los archivos estén correctos antes de aplicar:
   ```powershell
   terraform validate
   terraform plan -var-file="terraform.tfvars"
   ```
   > **Nota:** Revisa que el plan muestre recursos con el prefijo `prod-` (ej. `prod-vpc`, `prod-postgres`, `prod-gke-release`).

2. **Aplicar la configuración:**
   Ejecuta el siguiente comando para levantar la infraestructura desde cero:
   ```powershell
   terraform apply -var-file="terraform.tfvars"
   ```
   * Cuando te pregunte `Do you want to perform these actions?`, escribe `yes`.
   * **¡Paciencia!** Este proceso creará VPCs, bases de datos Cloud SQL, Redis y un clúster de GKE. Tardará entre 15 y 30 minutos.
   * *Nota importante:* Si tienes errores de "Stockout" (falta de recursos) en GCP, recuerda cambiar la variable `region` y `zone` en tu archivo `terraform.tfvars` (por ejemplo, a `northamerica-northeast2` y `northamerica-northeast2-b`) y modificar los CIDRs en `main.tf` para no tener conflictos.

3. **Guardar los Outputs:**
   Al finalizar, Terraform imprimirá varios valores (Outputs). Guárdalos, ya que se usan para configurar los entornos (Ej. IPs, nombres de buckets). Si los necesitas ver de nuevo puedes usar:
   ```powershell
   terraform output
   ```

## Fase 3: Configuración de Servidores con Ansible

1. **Obtener la IP de ELK:**
   De los outputs generados por Terraform, copia el valor de `elk_server_ip`.

2. **Configurar el inventario de Ansible:**
   Navega a la carpeta de Ansible:
   ```powershell
   cd D:\Proyectos\Universidad\2026-1V\SA_PROYECTO_G13\infra\release\ansible
   ```
   Abre (o crea) el archivo `inventories/release/hosts.ini` y pega la IP:
   ```ini
   [elk]
   <IP_DEL_SERVIDOR_ELK> ansible_user=tu_usuario_gcp
   ```

3. **Ejecutar el Playbook (Desde WSL/Ubuntu):**
   Dado que Ansible debe ejecutarse en un entorno Linux, abre WSL y navega a la carpeta. Para evitar advertencias de permisos en Windows y que se lea correctamente la configuración, exporta esta variable antes de correr el playbook:
   ```bash
   export ANSIBLE_CONFIG=./ansible.cfg
   ansible-playbook -i inventories/release/hosts.ini playbooks/elk_playbook.yml
   ```

## Fase 4: Configuración de CI/CD (GitHub Actions)

1. **Actualizar Variables en GitHub:**
   Entra a tu repositorio en GitHub > **Settings** > **Environments** > **release**.
2. **Ajustar Región y Zona:**
   Modifica las variables para que apunten a donde se creó la infraestructura exitosamente (por ejemplo, a Canadá):
   - `GCP_REGION`: `northamerica-northeast2`
   - `GCP_ZONE`: `northamerica-northeast2-b`
3. **Disparar el Pipeline:**
   Con las variables actualizadas, puedes ejecutar manualmente el flujo de trabajo (`deploy-release.yml`) desde la pestaña **Actions** o simplemente hacer un merge a la rama `release/`.
