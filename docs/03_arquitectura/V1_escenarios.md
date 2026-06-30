[← Regresar](../../README.md)

## Vista de Escenarios (V1)

La vista de escenarios es el eje central del modelo 4+1. Define los casos de uso
arquitectónicamente más significativos del sistema y muestra cómo cada una de las
otras cuatro vistas los resuelve. Para Quetxal TV se modelan dos escenarios
críticos que cubren la evolución completa de la plataforma: el flujo de
autenticación y consumo de contenido  y la gestión administrativa del
catálogo con despliegue automatizado 

La Vista +1 se representa como un diagrama de caso de uso enmarcado dentro de
una elipse que simboliza el contexto del escenario. Ambos escenarios centrales
están conectados mediante una relación, ya que la gestión del
catálogo por parte del administrador extiende y enriquece la experiencia de
consumo del usuario.

![Vista de Escenario](../00_assets/diagrams/03_arquitectura/Esenario4+1.jpg)

---

### Escenario crítico Autenticar y Consumir Contenido

Un usuario registrado inicia sesión en Quetxal TV, selecciona un perfil, busca
contenido en el catálogo y opcionalmente consulta el precio de su suscripción en
su moneda local. Durante todo el flujo el API Gateway propaga la identidad del
perfil vía JWT a cada microservicio interno mediante gRPC.

### Escenario crítico Gestionar Catálogo y Administrar Plataforma

Un administrador autenticado con claim `role = admin` accede al panel de
administración, publica nuevo contenido cargando archivos a Google Cloud Storage,
y cada operación queda registrada automáticamente en la tabla de auditoría. El
pipeline de CI/CD despliega los cambios en GKE aplicando RollingUpdate sin
interrumpir el servicio.

---

### Descripción del diagrama de caso de uso (+1)

| Elemento | Descripción |
| :------- | :---------- |
| **UC central: Autenticar y Consumir Contenido** | Flujo que ejercita la mayor cantidad de componentes del sistema: autenticación, JWT, catálogo, GCS y FX Service. |
| Validar JWT y Propagar Identidad vía gRPC | Siempre ocurre. El API Gateway valida la cookie en cada ruta protegida invocando `ValidateToken` gRPC al Identity Service y adjunta `user_id`, `email`, `role` y `profile_id` a la solicitud interna. |
| Consultar Catálogo con Perfil Activo | Siempre ocurre al consumir contenido. El Catalog Service retorna resultados paginados con URLs firmadas de GCS. |
| Consultar Tipo de Cambio (FX + Redis Cache) | Ocurre opcionalmente cuando el usuario solicita ver precios en su moneda local. El FX Service consulta Redis (TTL) y en caso de miss llama a la API Frankfurter. |
| Calificar Contenido y Ver Historial | Ocurre opcionalmente cuando el usuario califica contenido o consulta su historial de reproducción mediante el engagement-service. |
| **UC central: Gestionar Catálogo y Administrar Plataforma** | Flujo administrativo que ejercita el panel de administración, GCS, auditoría transaccional y el pipeline CI/CD. |
| Subir Archivos a Google Cloud Storage | Siempre ocurre al crear o editar contenido. El `media_store.go` del catalog-service carga los archivos al bucket de GCS y retorna URLs firmadas. |
| Registrar Auditoría Transaccional (trigger) | Siempre ocurre. Cada INSERT o UPDATE sobre tablas críticas dispara automáticamente el trigger de auditoría registrando usuario, timestamp, estado anterior y nuevo. |
| Desplegar en GKE vía CI/CD (RollingUpdate) | Ocurre cuando se impacta la rama `release`. GitHub Actions ejecuta pruebas (≥75% cobertura), construye imágenes Docker y despliega en GKE aplicando RollingUpdate con Rollback automático. |
| Administrar Reportes de Auditoría (.csv / .pdf) | Ocurre opcionalmente cuando el administrador consulta el log transaccional y descarga reportes desde el panel. |
| **Actor: Usuario** | Actor primario que inicia el flujo de autenticación y consumo. |
| **Actor: Administrador** | Actor primario que gestiona el catálogo y supervisa la trazabilidad del sistema. |
| **Actor: API Gateway** | Actor secundario que centraliza la validación de sesión, el claim `role` y el enrutamiento hacia los microservicios internos. |
| **Actor: GitHub Actions** | Actor de infraestructura que ejecuta el pipeline CI/CD y orquesta el despliegue automatizado. |
| **Actor: Kubernetes** | Actor de infraestructura que orquesta los pods en GKE, evalúa health probes y ejecuta Rollback automático ante fallos. |

---

### Flujo del escenario 

| Paso | Actor | Acción | Servicio involucrado |
| :--- | :---- | :----- | :------------------- |
| 1 | Usuario | Envía credenciales (email + password) | API Gateway → Identity Service |
| 2 | Sistema | Valida credenciales, genera JWT con `user_id`, `email` y `role`, establece cookie segura | Identity Service → DB Identity |
| 3 | Usuario | Selecciona un perfil activo | API Gateway → Identity Service |
| 4 | Sistema | Genera nuevo JWT con `profile_id` incluido, actualiza cookie | Identity Service → DB Identity |
| 5 | Usuario | Accede al catálogo y busca contenido | API Gateway (valida JWT) → Catalog Service |
| 6 | Sistema | Retorna listado de contenidos con URLs de GCS | Catalog Service → DB Catalog → GCS |
| 7 | Usuario | Solicita ver planes con precio en moneda local | API Gateway → Subscription Service → FX Service |
| 8 | Sistema | Consulta tasa en Redis (cache hit/miss con TTL), convierte precio | FX Service → Redis → Frankfurter API |
| 9 | Usuario | Reproduce contenido | API Gateway → Catalog Service → GCS (URL firmada) |



| Paso | Actor | Acción | Servicio involucrado |
| :--- | :---- | :----- | :------------------- |
| 1 | Administrador | Accede al panel de administración con credenciales de rol `admin` | API Gateway (`admin.middleware.ts`) → Identity Service |
| 2 | Sistema | Verifica claim `role = admin` en JWT, concede acceso al panel | API Gateway → AdminPage.tsx |
| 3 | Administrador | Crea nuevo contenido con metadatos y archivos multimedia | API Gateway → Catalog Service → GCS (`media_store.go`) |
| 4 | Sistema | Carga archivos al bucket de GCS, genera URLs firmadas, persiste en DB | Catalog Service → DB Catalog → GCS |
| 5 | Sistema | El trigger de auditoría registra el INSERT con usuario, timestamp y estado nuevo | DB Catalog → tabla de auditoría |
| 6 | Administrador | Consulta el log de auditoría y descarga reporte | API Gateway → Catalog Service → Panel Admin |
| 7 | GitHub Actions | Push a rama `release` dispara el pipeline CI/CD | GitHub Actions → GCP |
| 8 | Sistema | Ejecuta pruebas (≥75% cobertura), construye imágenes Docker, despliega en GKE | GitHub Actions → Google Artifact Registry → GKE |
| 9 | Kubernetes | Aplica RollingUpdate, evalúa Readiness y Liveness Probes | GKE → Pods → API Gateway (Ingress) |

---

### Cómo cada vista resuelve el escenario

| Vista | Nombre | Cómo resuelve el escenario crítico |
| :---- | :----- | :--------------------------------- |
| V2 | Lógica | Define los paquetes y módulos internos de cada microservicio. Muestra cómo Identity encapsula la lógica JWT y el claim `role`, cómo Catalog expone búsqueda, filtros, GCS y el panel admin, y cómo FX gestiona caché Redis con TTL. |
| V3 | Procesos | Modela los flujos de comunicación en tiempo de ejecución. Muestra el canal gRPC síncrono entre Gateway e Identity/Catalog/FX, el canal asíncrono Redis queue entre Identity/Subscription y Notification Service, y el pipeline CI/CD como proceso de despliegue automatizado. |
| V4 | Componentes | Describe la estructura del repositorio y los módulos de código. Muestra la carpeta `/proto` compartida, el lenguaje de cada servicio (TypeScript, Go, Python), el `admin.middleware.ts` y cómo los contratos Protocol Buffers conectan los servicios. |
| V5A | Despliegue Local | Mapea los servicios a contenedores Docker Compose en entorno local para desarrollo y pruebas. Muestra la red interna, los volúmenes de base de datos y Redis compartido. |
| V5B | Despliegue Cloud | Mapea los servicios a GCP. En rama `develop` despliega en VMs de Compute Engine vía CI/CD. En rama `release` orquesta en GKE con Ingress, Namespace `quetxal-tv-prod`, RollingUpdate, Rollback automático y health probes. |

---

### Restricciones arquitectónicas derivadas del escenario

| Restricción | Justificación |
| :---------- | :------------ |
| El cliente externo solo habla con el API Gateway | Garantiza control centralizado de autenticación, validación de rol `admin` y enrutamiento. |
| JWT debe incluir claim `role` y `profile_id` en cada llamada gRPC interna | Permite que cada microservicio valide identidad y nivel de acceso sin acoplarse al Identity Service en cada request. |
| Redis cumple dos roles separados | Cache TTL para FX evita llamadas repetitivas a Frankfurter; queue de notificaciones desacopla el envío de emails del flujo principal. |
| Cada microservicio tiene su propia base de datos | Evita acoplamiento de esquemas y permite escalar cada dominio de forma independiente. |
| Los archivos multimedia se almacenan en GCS | Desacopla el almacenamiento del filesystem del contenedor y garantiza disponibilidad y escalabilidad del contenido multimedia. |
| El despliegue en producción solo ocurre vía CI/CD | Elimina errores humanos y garantiza que cada release pase pruebas con cobertura mínima del 75% antes de llegar a GKE. |
| Queda prohibido el despliegue manual mediante CLI en producción | Todo cambio estructural en el clúster debe orquestarse exclusivamente a través de los manifiestos YAML gestionados por el pipeline de CD. |
| Los objetos programables de BD centralizan lógica transaccional | Stored procedures, vistas, funciones y triggers garantizan consistencia y trazabilidad sin duplicar lógica en el código de aplicación. |