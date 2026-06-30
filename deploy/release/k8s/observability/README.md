# Guía de Observabilidad y Monitoreo de Métricas

Esta guía documenta la configuración teórica y práctica del Stack de Observabilidad de Métricas (Prometheus y Grafana) desplegado en el entorno de producción (Release) en Kubernetes.

## 1. Marco Teórico

### ¿Qué es Prometheus y cómo funciona?
Prometheus es un sistema de monitoreo y alerta de código abierto originalmente creado en SoundCloud. En el contexto de nuestro clúster de GKE, funciona bajo un modelo de recolección activa o **scraping**. Esto significa que Prometheus hace peticiones HTTP a los endpoints de métricas de nuestros nodos y contenedores a intervalos regulares (ej. cada 15 segundos) para recolectar datos sobre el estado del hardware y la red (como CPU, RAM y bytes transmitidos). Estas métricas se almacenan temporalmente como series temporales en memoria.

### ¿Qué es Grafana y cómo funciona?
Grafana es una plataforma open-source de visualización y análisis de datos. En nuestra arquitectura, Grafana actúa como el "frontend" de observabilidad. Se conecta a Prometheus (su Data Source) para consultar las métricas recolectadas mediante el lenguaje PromQL (Prometheus Query Language) y las proyecta en **Dashboards** interactivos para facilitar el diagnóstico y monitoreo en vivo.

## 2. Configuración Paso a Paso (Práctica)

### 2.1 Despliegue de Manifiestos en Kubernetes
La infraestructura de monitoreo se despliega utilizando manifiestos YAML estandarizados dentro del namespace `quetxal-tv-prod`.

1. **Configuración de Permisos (RBAC):** Se creó un `ServiceAccount`, un `ClusterRole` y un `ClusterRoleBinding` para otorgar a Prometheus los privilegios de lectura necesarios (`get`, `list`, `watch`) sobre los Nodos, Pods y Servicios del clúster. Esto es vital para recolectar métricas de `cadvisor` de hardware.
2. **ConfigMap de Prometheus (`prometheus.yml`):** Define las tareas de *scraping*. 
   - `kubernetes-cadvisor`: Extrae métricas del hardware de los nodos.
   - `kubernetes-pods`: Extrae métricas auto-expuestas por los pods etiquetados.
3. **Deployment y Service:** Se levantó un contenedor de `prom/prometheus:v2.45.0` expuesto internamente en el puerto `9090` (ClusterIP). Se levantó también `grafana/grafana:10.0.3` expuesto en el puerto `3000` (ClusterIP).

*Nota sobre arquitectura:* Para cumplir con la rúbrica del proyecto, Grafana se mantiene como un servicio `ClusterIP`. No se usa `LoadBalancer` ni `NodePort` para evitar crear un interceptor web externo que viole la regla de tener un único Ingress en el sistema.

### 2.2 Conexión Manual y Acceso Seguro
Dado que Grafana es interno, el equipo de operaciones accede a él mediante un túnel seguro usando Port-Forwarding:
```bash
kubectl port-forward svc/grafana-service 3000:80 -n quetxal-tv-prod
```
Acceso en el navegador: `http://localhost:3000` (Credenciales por defecto).

### 2.3 Configuración de Prometheus en Grafana
Dentro de la UI de Grafana:
1. Navegamos a **Connections -> Data sources -> Add data source**.
2. Seleccionamos **Prometheus**.
3. En la URL interna del clúster escribimos: `http://prometheus-service:9090`.
4. Hacemos clic en **Save & test** para validar la conexión.

### 2.4 Importación del Dashboard Interactivo
Se generó un archivo JSON (`grafana-dashboard-general.json`) para importar de manera automática las métricas de:
- CPU Usage per Pod
- Memory Usage per Pod
- Network Receive (Inbound) per Pod
- Network Transmit (Outbound) per Pod

El JSON está configurado para consumir el Data Source Default de Prometheus e inyectar el código de PromQL de forma nativa en cada panel.

## 3. Capturas de Ejecución y Dashboards

*(Estudiante: Pega aquí tus capturas)*

### Captura 1: Dashboards Interactivos (Grafana)
<!-- TODO: Insertar captura de pantalla de Grafana mostrando los 4 paneles llenos de datos -->
![Dashboard de Grafana]()

### Captura 2: Estado de los Pods de Observabilidad en la Terminal
<!-- TODO: Insertar captura de pantalla del comando kubectl get pods -n quetxal-tv-prod mostrando prometheus y grafana en estado Running -->
![Pods Observabilidad]()
