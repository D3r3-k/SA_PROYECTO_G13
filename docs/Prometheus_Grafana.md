# Observabilidad: Prometheus y Grafana (Métricas)

## ¿Qué es y cómo funciona?
El **Stack de Monitoreo** implementado se basa en el ecosistema de **Prometheus**, diseñado para registrar métricas de hardware y red en tiempo real. 

1.  **Modelo de Scraping (Recolección Activa):** A diferencia del Stack ELK (donde los logs se "empujan"), Prometheus utiliza un modelo "Pull" (tirar). Prometheus se conecta periódicamente a los *exporters* de los servicios y clústeres, scrapeando (extrayendo) el contenido del endpoint de métricas (por defecto `/metrics`).
2.  **Kube-State-Metrics y Node Exporter:** Son componentes nativos que extraen el estado de los Pods y el consumo de CPU/RAM de las máquinas del clúster de Kubernetes.
3.  **Stackdriver-Exporter (Google Cloud Monitoring):** Dado que los "servidores externos" como Cloud SQL y Memorystore (Redis) son servicios administrados de GCP donde no se puede instalar software, utilizamos el `prometheus-stackdriver-exporter`. Este exportador consulta nativamente las métricas de las APIs de Google Cloud y las transforma a un formato que Prometheus puede hacer *scrape*, garantizando el control centralizado en Prometheus.
4.  **Grafana:** Herramienta de visualización que lee la base de datos de series temporales de Prometheus y despliega **Dashboards** interactivos para monitorear el pulso de todo el ecosistema.

---

## Configuración Paso a Paso (Despliegue)

El despliegue está automatizado en el pipeline de GitHub Actions (`.github/workflows/deploy-release.yml`). Los comandos de configuración por detrás son los siguientes:

1. **Añadir el Repositorio de la Comunidad Prometheus:**
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   ```

2. **Despliegue del Kube-Prometheus-Stack (Clúster Local):**
   Este chart despliega Prometheus, Alertmanager, Grafana, Node Exporter y Kube-State-Metrics. Al configurar Grafana como `LoadBalancer`, queda expuesto para visualización directa.
   ```bash
   helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
     -n observability --create-namespace \
     --set grafana.service.type=LoadBalancer
   ```

3. **Despliegue del Stackdriver-Exporter (Servidores Externos / Administrados):**
   Este paso es el que integra los servicios como Cloud SQL y Memorystore a Prometheus. Le pasamos el `GCP_PROJECT_ID` y habilitamos el `serviceMonitor` para que el Prometheus Operator descubra y haga *scrape* del exportador automáticamente. (Nota: El nodo de GKE cuenta con los permisos IAM `roles/monitoring.viewer` configurados vía Terraform).
   ```bash
   helm upgrade --install gcp-exporter prometheus-community/prometheus-stackdriver-exporter \
     -n observability \
     --set stackdriver.projectId=${GCP_PROJECT_ID} \
     --set serviceMonitor.enabled=true
   ```

*(Nota: En esta sección es obligatorio incluir capturas de pantalla de los Dashboards de Grafana reflejando la telemetría viva del sistema cuando la plataforma esté en ejecución).*
