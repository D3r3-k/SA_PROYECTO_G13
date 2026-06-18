# Requerimientos No Funcionales

## 1. Introducción

Este documento especifica los requerimientos no funcionales de **Quetxal TV**, definiendo los atributos de calidad, restricciones de arquitectura e infraestructura que el sistema debe cumplir. Los RNF cubren tanto la Fase 1 (arquitectura base de microservicios) como la Fase 2 (CI/CD, Kubernetes y maduración operativa).

---

## 2. RNF de Arquitectura

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-ARQ-01 | El sistema debe estar construido bajo arquitectura de microservicios. | Alta | Cada dominio debe ser implementado como servicio desacoplado. |
| RNF-ARQ-02 | Cada microservicio debe tener base de datos independiente cuando requiera persistencia. | Alta | Debe respetarse el patrón Database per Microservice. |
| RNF-ARQ-03 | El sistema debe utilizar de forma simultánea TypeScript, Go y Python. | Alta | La matriz de servicios debe evidenciar el lenguaje usado por cada servicio. |
| RNF-ARQ-04 | El cliente externo no debe comunicarse directamente con los microservicios internos. | Alta | Solo el API Gateway debe exponerse externamente. |

---

## 3. RNF de Comunicación

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-COM-01 | La comunicación interna entre servicios debe realizarse mediante gRPC. | Alta | Los servicios deben contar con contratos `.proto`. |
| RNF-COM-02 | Los contratos entre servicios deben definirse mediante Protocol Buffers. | Alta | Debe existir una carpeta común o documentada para archivos `.proto`. |

---

## 4. RNF de Seguridad

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-SEC-01 | El sistema debe implementar mecanismos seguros de sesión e identidad. | Alta | Debe usarse JWT, cookies seguras y/o OAuth según el flujo implementado. |
| RNF-SEC-02 | Las contraseñas no deben almacenarse en texto plano. | Alta | Deben almacenarse usando hash criptográfico (bcrypt o equivalente). |
| RNF-SEC-03 | La información sensible debe configurarse mediante variables de entorno. | Alta | No se deben versionar archivos `.env` reales; solo `.env.example`. |
| RNF-SEC-04 | Queda estrictamente prohibido escribir credenciales, strings de conexión, URLs privadas o llaves en archivos YAML de Kubernetes (hardcoding). | Alta | Los datos de configuración genérica se inyectan mediante ConfigMaps. La información altamente sensible se gestiona a través de Secrets cifrados de Kubernetes. |

---

## 5. RNF de Base de Datos

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-BD-01 | Los servicios deben utilizar objetos programables de base de datos. | Alta | Deben documentarse procedimientos almacenados, vistas, funciones y triggers por servicio. |

---

## 6. RNF de Caché

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-CACHE-01 | El FX-Service debe utilizar Redis como capa de caché con políticas TTL. | Alta | Debe existir configuración de Redis con TTL definido para evitar consultas repetitivas. |

---

## 7. RNF de Almacenamiento en la Nube

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-GCS-01 | Los archivos estáticos pesados (video y portadas) deben desacoplarse del sistema de archivos local y almacenarse en Google Cloud Storage. | Alta | No debe existir almacenamiento de archivos multimedia en el filesystem de ningún contenedor. Todos los recursos multimedia se sirven desde URLs de GCS. |

---

## 8. RNF de Despliegue y Contenedores

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-DEP-01 | Cada microservicio, base de datos, caché y API Gateway debe contar con Dockerfile. | Alta | Deben existir archivos Dockerfile por componente. |
| RNF-DEP-02 | El sistema debe poder levantarse mediante Docker Compose en entorno local. | Alta | Debe existir `deploy/local/docker-compose.yml` funcional. |
| RNF-DEP-03 | El sistema debe poder desplegarse mediante Docker Compose en entorno nube para la rama `develop`. | Alta | Debe existir configuración de Docker Compose en `deploy/develop/` con variables de producción para VMs de GCE. |
| RNF-DEP-04 | La aplicación funcional debe desplegarse en Google Cloud Platform. | Alta | Debe existir evidencia del despliegue en nube. Solo se califica funcionalidad en nube. |

---

## 9. RNF de Integración Continua (CI)

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-CI-01 | El pipeline debe compilar y ejecutar automáticamente pruebas unitarias sobre el backend políglota. | Alta | El pipeline ejecuta suites de prueba para servicios Go, TypeScript y Python en cada evento de integración. |
| RNF-CI-02 | El pipeline debe certificar un umbral mínimo del 75% de cobertura de código (Code Coverage) sobre el total de endpoints del backend. | Alta | Si la cobertura cae por debajo del 75%, el pipeline falla y bloquea el flujo antes de la etapa de empaquetado. |
| RNF-CI-03 | El pipeline debe configurarse bajo la premisa de cortocircuito crítico: cualquier fallo en pruebas, compilación o scripts detiene la ejecución de inmediato. | Alta | Un fallo en cualquier paso impide que el código progrese a las etapas de empaquetado o despliegue. |
| RNF-CI-04 | El pipeline debe ejecutar y disparar de forma programada un backup completo de todas las bases de datos operacionales (excluye Redis). | Alta | El pipeline incluye un job de backup que persiste los dumps en un destino seguro (ej. bucket de GCS). |

---

## 10. RNF de Despliegue Continuo (CD)

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-CD-01 | Cada merge exitoso en la rama `develop` debe compilar las imágenes y desplegar automáticamente en VMs de Google Compute Engine. | Alta | El workflow `deploy-develop.yml` se activa en push a `develop` y despliega la topología en GCE sin intervención manual. |
| RNF-CD-02 | Cada push/merge verificado en la rama `release` debe generar tags de versión semánticos y desplegar automáticamente en Google Kubernetes Engine (GKE). | Alta | Tags de producción (`v2.x.0`) solo se generan al impactar `release`. El pipeline despliega en GKE aplicando Rollout y Rollback automático. |
| RNF-CD-03 | El despliegue únicamente puede realizarse mediante CI/CD. Queda prohibido cualquier despliegue manual mediante CLI. | Alta | No existe evidencia de comandos manuales de despliegue. Todo cambio estructural en el clúster se orquesta exclusivamente a través de los manifiestos YAML gestionados por el pipeline de CD. |
| RNF-CD-04 | El pipeline debe empaquetar las imágenes Docker de frontend y backend y enviarlas a un registro privado de imágenes en la nube. | Alta | Las imágenes se encuentran disponibles en el registro privado tras cada ejecución exitosa del pipeline. |

---

## 11. RNF de Kubernetes (GKE — Rama Release)

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-K8S-01 | Toda la topología de la rama `release` debe estar aislada dentro de un Namespace específico (`quetxal-tv-prod`). | Alta | Todos los recursos de Kubernetes (Pods, Services, ConfigMaps, Secrets) pertenecen al namespace `quetxal-tv-prod`. |
| RNF-K8S-02 | Cada Pod de microservicio backend (Go, TypeScript, Python) y del API Gateway debe definir Requests y Limits de CPU y Memoria. | Alta | Los manifiestos YAML incluyen secciones `resources.requests` y `resources.limits` para cada contenedor. |
| RNF-K8S-03 | Ningún servicio del clúster puede exponerse directamente mediante IPs públicas individuales. Debe configurarse un recurso Ingress como única puerta de enlace externa. | Alta | El Ingress intercepta todo el tráfico web externo y enruta las peticiones hacia el API Gateway. No existen Services de tipo `LoadBalancer` o `NodePort` por componente individual. |
| RNF-K8S-04 | El despliegue debe aplicar estrategia `RollingUpdate` con parámetros `maxSurge` y `maxUnavailable` definidos. | Alta | Los manifiestos de Deployment especifican `strategy.type: RollingUpdate` con valores de `maxSurge` y `maxUnavailable` que garantizan disponibilidad continua durante actualizaciones. |
| RNF-K8S-05 | El pipeline de CD debe gatillar un Rollback inmediato y automático si los nuevos Pods fallan en su inicialización o entran en `CrashLoopBackOff`. | Alta | El pipeline ejecuta `kubectl rollout undo` de forma automática ante fallos detectados, restaurando la última versión estable del release. |
| RNF-K8S-06 | Cada contenedor del clúster debe implementar una Readiness Probe configurada en el manifiesto de despliegue. | Alta | El manifiesto YAML de cada Deployment incluye la sección `readinessProbe` correctamente configurada (path, puerto, initialDelaySeconds, periodSeconds). |
| RNF-K8S-07 | Cada contenedor del clúster debe implementar una Liveness Probe configurada en el manifiesto de despliegue. | Alta | El manifiesto YAML de cada Deployment incluye la sección `livenessProbe` correctamente configurada. Kubernetes destruye y re-provisiona automáticamente el Pod ante fallos persistentes. |

---

## 12. RNF de Código y Principios SOLID

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-SOLID-01 | El código debe aplicar los principios SOLID. | Alta | Cada servicio debe documentar y evidenciar la aplicación de los cinco principios con ruta exacta de archivo, explicación técnica y justificación. |

---

## 13. RNF de Gobierno de Código

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-GIT-01 | No se permiten commits directos a `main` o `develop`. | Alta | Todo cambio debe integrarse mediante Pull Request aprobado. |
| RNF-GIT-02 | Los Pull Requests deben contar con revisión y aprobación del equipo. | Alta | Debe existir evidencia de PRs aprobados en GitHub. |
| RNF-GIT-03 | La entrega final de Fase 1 debe contar con tag de versión `v1.0.0`. | Alta | El repositorio debe contener el tag `v1.0.0` antes de la fecha límite de Fase 1. |
| RNF-GIT-04 | La entrega final de Fase 2 debe contar con tag de versión `v2.0.0`. | Alta | El repositorio debe contener el tag `v2.0.0` antes de la fecha límite de Fase 2. |

---

## 14. RNF de Documentación

| Código | Requerimiento No Funcional | Prioridad | Criterio de aceptación |
|--------|---------------------------|:---------:|------------------------|
| RNF-DOC-01 | La documentación técnica debe estar en formato Markdown. | Alta | Deben existir archivos `.md` versionados en el repositorio. |
| RNF-DOC-02 | Los diagramas deben realizarse en Draw.io. | Alta | Deben versionarse archivos `.drawio` crudos y sus exportaciones visuales. |
| RNF-DOC-03 | Todo elemento funcional debe estar documentado para ser tomado en cuenta en la calificación. | Alta | Cada servicio debe aportar su sección de documentación antes de la entrega. |
| RNF-DOC-04 | El documento técnico debe incluir tabla de integrantes, índice, introducción, desarrollo de todos los diagramas y conclusiones. | Alta | El documento Markdown principal cumple con la estructura requerida. |