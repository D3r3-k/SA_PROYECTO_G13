# Configuración del Stack ELK (Elasticsearch, Logstash, Kibana)

## 1. Arquitectura de Observabilidad de Logs
Como parte de los requisitos de observabilidad, se implementó un Stack ELK en una máquina virtual externa (`prod-elk-server`) aprovisionada en Google Cloud Platform mediante Terraform. 

El flujo de los logs de auditoría es el siguiente:
1. **Generación:** Los microservicios de la aplicación generan eventos de auditoría y los envían a una cola en **Redis** (`log_audit_queue`), el cual actúa como Message Broker.
2. **Ingesta:** **Logstash** lee continuamente la cola de Redis, parsea los mensajes JSON y los envía hacia el motor de búsqueda.
3. **Almacenamiento:** **Elasticsearch** indexa los documentos recibidos bajo el patrón `audit-logs-*`.
4. **Visualización:** **Kibana** expone los datos de Elasticsearch de manera gráfica mediante Data Views, permitiendo la búsqueda y filtrado en tiempo real.

## 2. Automatización del Despliegue (Ansible + Docker Compose)
El despliegue se automatizó **100% mediante Ansible** utilizando la abstracción de contenedores **Docker Compose**. Esto permitió definir límites estrictos de memoria ("JVM Heap Limits") y configuraciones seguras.

### 2.1 Archivo de Inventario (`infra/release/ansible/inventories/release/hosts.ini`)
El inventario define la IP pública de la VM aprovisionada por Terraform y la llave privada SSH de Google Cloud:
```ini
[elk_server]
35.255.183.222 ansible_user=<usuario_gcp> ansible_ssh_private_key_file=~/.ssh/google_compute_engine ansible_ssh_common_args='-o StrictHostKeyChecking=no'
```

### 2.2 Tareas del Playbook (`infra/release/ansible/playbooks/elk_playbook.yml`)
El playbook realiza los siguientes pasos de forma idempotente:
1. Instala las dependencias y el motor de **Docker**.
2. Crea el directorio `/opt/elk/` en el servidor remoto.
3. Inyecta el archivo de configuración `logstash.conf` para conectarse a la IP interna de Redis (`10.42.32.3`).
4. Inyecta el archivo `docker-compose.yml` utilizando imágenes oficiales de Elastic versión `8.10.2`.
5. Limita la memoria RAM a nivel contenedor (`ES_JAVA_OPTS=-Xms1g -Xmx1g` y `LS_JAVA_OPTS=-Xms512m -Xmx512m`).
6. Desactiva XPack Security en entorno de desarrollo.
7. Levanta el stack usando `docker compose up -d`.

## 3. Acceso y Verificación
El panel de control es accesible a través de la IP del servidor en el puerto expuesto por el Firewall de GCP:
- **Kibana URL:** `http://35.255.183.222:5601`

![alt text](image-2.png)

![alt text](image-3.png)