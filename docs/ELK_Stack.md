# Observabilidad: Stack ELK (Logs)

## ¿Qué es y cómo funciona?
El **Stack ELK** es un conjunto de herramientas utilizado para recolectar, procesar y visualizar grandes volúmenes de datos en tiempo real, compuesto por:

1.  **Elasticsearch:** Un motor de búsqueda y análisis distribuido (almacenamiento). Es donde los logs finalmente se indexan y consultan.
2.  **Logstash:** Un pipeline de procesamiento de datos del lado del servidor. Toma múltiples fuentes de datos, los filtra/transforma y los envía a Elasticsearch. En nuestra arquitectura, procesa los logs provenientes de los "servidores externos" (Cloud SQL y Memorystore) a través de un sumidero de Google Cloud Pub/Sub.
3.  **Kibana:** Una plataforma de visualización interactiva. Permite explorar y graficar los datos indexados en Elasticsearch.
4.  **Filebeat:** Un recolector de datos ligero instalado como DaemonSet en el clúster GKE. Se encarga de leer los logs de los contenedores (`stdout` / `stderr`) y enviarlos a Logstash o directamente a Elasticsearch.

### Arquitectura de Recolección de Logs
- **Microservicios (GKE):** Filebeat corre en cada nodo, interceptando los logs generados por los contenedores, y los despacha hacia Logstash.
- **Servicios Administrados (Cloud SQL / Memorystore):** Dado que no tenemos acceso a nivel de sistema operativo para instalar agentes, Cloud Logging exporta los logs a un tema de **Google Cloud Pub/Sub**. Logstash cuenta con un plugin (`logstash-input-google_pubsub`) que consume estos eventos y los indexa.

---

## Configuración Paso a Paso (Flujo de Inyección)

La instalación está completamente automatizada mediante GitHub Actions (`.github/workflows/deploy-release.yml`), pero el flujo conceptual de instalación y configuración es el siguiente:

1. **Instalación de Helm Repositories:**
   Se agregan los repositorios oficiales de Elastic.
   ```bash
   helm repo add elastic https://helm.elastic.co
   ```

2. **Despliegue del Almacenamiento (Elasticsearch):**
   Se instala Elasticsearch dentro del namespace `observability` usando una réplica y configuración `minimumMasterNodes=1`.
   ```bash
   helm upgrade --install elasticsearch elastic/elasticsearch -n observability
   ```

3. **Despliegue de la Interfaz (Kibana):**
   Se despliega el Dashboard configurado como un `LoadBalancer` para su accesibilidad.
   ```bash
   helm upgrade --install kibana elastic/kibana -n observability --set service.type=LoadBalancer
   ```

4. **Despliegue y Configuración de Logstash:**
   Logstash se configura mediante el archivo de values `deploy/release/k8s/observability-values/logstash-values.yml`. El archivo especifica el input de Pub/Sub utilizando Application Default Credentials (heredado del nodo GKE).
   ```bash
   helm upgrade --install logstash elastic/logstash -n observability -f logstash-values.yml
   ```

5. **Despliegue del Agente (Filebeat):**
   Filebeat se instala como DaemonSet para monitorear las carpetas de logs de Kubernetes (`/var/log/containers/*.log`), enviándolas al puerto `5044` de Logstash.
   ```bash
   helm upgrade --install filebeat elastic/filebeat -n observability -f filebeat-values.yml
   ```

*(Nota: En esta sección es obligatorio incluir capturas de pantalla de Kibana mostrando la indexación de los logs transaccionales y de auditoría del sistema cuando el entorno esté vivo).*
