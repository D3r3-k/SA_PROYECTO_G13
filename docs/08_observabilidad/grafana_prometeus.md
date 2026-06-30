# Documentación: Stack Prometheus & Grafana

## ¿Qué es y Cómo funciona?
La dupla **Prometheus y Grafana** conforma nuestro sistema principal de recolección activa de métricas (telemetría) y alertamiento. A diferencia del stack ELK (orientado a logs textuales e historiales), este stack está diseñado exclusivamente para manejar datos numéricos en forma de **Series Temporales** (Time Series).

### Componentes de la Arquitectura
* **Prometheus (Motor de Series Temporales):** Es un sistema de monitoreo que recolecta métricas bajo un modelo *Pull* (recolección activa). A intervalos regulares (ej. cada 15 segundos), Prometheus visita puntos finales HTTP (endpoints `/metrics`) de nuestros servicios y servidores para "raspar" (scrape) su estado actual (ej: uso de CPU, cantidad de memoria, peticiones por segundo).
* **Exporters (Traductores de Métricas):** Son pequeños agentes que se adhieren a los sistemas que queremos monitorear y exponen sus métricas internas en un formato que Prometheus pueda entender.
* **Grafana (Visualización de Telemetría):** Es la plataforma analítica que se conecta a Prometheus mediante consultas en lenguaje **PromQL**. Transforma los millones de puntos de datos numéricos en tableros visuales vivos (Dashboards) que permiten interpretar la salud del sistema de un vistazo.

---

## Configuración Paso a Paso (Flujo de Métricas)

### 1. Despliegue de los Exporters
Para obtener visibilidad de todas las capas de nuestra arquitectura, desplegamos varios tipos de exporters:
* **Node Exporter:** Instalado en las Máquinas Virtuales subyacentes para extraer métricas del sistema operativo (uso de disco, CPU, memoria RAM disponible).
* **Kube-State-Metrics:** Desplegado dentro de GKE para monitorear el estado interno de Kubernetes (cuántos pods están sanos, cuántos fallaron, uso de recursos por nodo).
* **Microservicios (Instrumentación directa):** Los microservicios de nuestra arquitectura (Python/TypeScript) están instrumentados con librerías nativas que exponen el endpoint `/metrics` en el puerto principal, mostrando conteo de peticiones y latencias.

### 2. Configuración del Scraping (Prometheus)
El servidor de Prometheus, desplegado en nuestro clúster de Kubernetes, se configuró a través de un `ConfigMap` (`prometheus-config`). En el archivo `prometheus.yml` definimos los `scrape_configs`:
* Descubrimiento automático de pods en Kubernetes utilizando `kubernetes_sd_configs`.
* Scraping estático (`static_configs`) apuntando a las IPs de las Máquinas Virtuales externas (como el API Gateway y el ELK server).

### 3. Aprovisionamiento de Tableros (Grafana)
Grafana fue desplegado en GKE (accesible vía Ingress/Service). Para evitar la configuración manual repetitiva:
* Se configuró **Prometheus como Data Source predeterminado** de manera automática.
* Se importaron Dashboards oficiales (como el Dashboard de Node Exporter) para visualizar la saturación de los nodos, uso de red y memoria de las VMs y pods.

### 4. Evidencias de Telemetría (Grafana)

![Dashboard Principal de Grafana](./image.png)
![Dashboard Principal de Grafana](./image-1.png)
