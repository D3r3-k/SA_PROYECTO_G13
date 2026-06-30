[Regresar](../../README.md)

# Toma y Justificación de Decisiones

## 1. Decisiones de Arquitectura

### 1.1. Arquitectura de Microservicios

- **Decisión:** Separar las capacidades del sistema en microservicios independientes: `identity-service`, `catalog-service`, `subscription-service`, `fx-service`, `payment-gateway-service`, `engagement-service` y `notification-service`.
- **Justificación:**
  - **Escalabilidad independiente:** Permite escalar los servicios con mayor demanda (como `catalog-service` y `engagement-service`) de forma individual sin sobrecargar el resto del ecosistema.
  - **Tolerancia a fallos:** Si el `notification-service` experimenta caídas, los flujos críticos de autenticación, catálogo y suscripción continúan operando sin interrupción. El desacoplamiento via Redis garantiza que las notificaciones pendientes no se pierdan.
  - **Base de datos por dominio:** Cada microservicio gestiona su propio esquema PostgreSQL aislado, siguiendo el patrón Database per Microservice. Esto garantiza que un cambio de esquema en `subscription-service` no afecte a `identity-service` ni a `engagement-service`.

---

### 1.2. Backend Políglota: TypeScript, Go y Python

- **Decisión:** Distribuir los microservicios entre tres lenguajes según el dominio: TypeScript para el API Gateway e Identity Service, Go para el Catalog Service, y Python para Subscription, FX, Payment Gateway, Engagement y Notification.
- **Justificación:**
  - **TypeScript (Gateway + Identity):** Express v5 con tipado estricto es ideal para el punto de entrada único que orquesta llamadas hacia múltiples servicios. El tipado estático previene errores de integración en las interfaces de los clientes gRPC.
  - **Go (Catalog):** La concurrencia nativa de Go mediante goroutines es adecuada para el servicio con mayor volumen de lectura. La sincronización con `archive.org` involucra múltiples llamadas HTTP concurrentes que Go maneja eficientemente con bajo consumo de memoria.
  - **Python (servicios de negocio):** `grpcio` y `asyncio` permiten implementar servidores gRPC no bloqueantes con código conciso. `psycopg2` ofrece integración directa con PostgreSQL sin capas ORM que oculten la lógica de los stored procedures.

---

### 1.3. gRPC con Protocol Buffers para Comunicación Interna

- **Decisión:** Toda la comunicación servicio a servicio se realiza exclusivamente mediante gRPC con contratos `.proto` estrictos.
- **Justificación:**
  - **Interoperabilidad políglota:** Los archivos `.proto` generan clientes y servidores para TypeScript, Go y Python desde el mismo contrato. Esto elimina la necesidad de documentar APIs REST internas y garantiza compatibilidad entre lenguajes.
  - **Rendimiento:** gRPC usa HTTP/2 con multiplexación de streams y serialización binaria con Protocol Buffers, reduciendo la latencia y el tamaño de los mensajes respecto a JSON/REST.
  - **Contratos forzados:** Cualquier cambio en una interfaz de servicio requiere actualizar el `.proto`, lo que hace visibles los cambios que rompen compatibilidad en el momento de la compilación.

---

### 1.4. Redis con Doble Rol: Cache y Cola de Notificaciones

- **Decisión:** Usar Redis 7 tanto como cache de tasas de cambio (FX Service) como broker de notificaciones asíncronas.
- **Justificación:**
  - **Cache FX:** Las tasas de cambio de divisas son datos con baja variabilidad. Cachearlas con TTL de 3600 segundos evita llamadas repetitivas a la API Frankfurter externa, reduciendo latencia y dependencia de servicios externos.
  - **Cola de notificaciones:** El patrón RPUSH/BLPOP con `notification:queue` desacopla temporalmente los servicios productores (Identity, Subscription) del consumidor (Notification Worker). Si el servicio de correo falla, los eventos permanecen en la cola y se procesan cuando el servicio se recupera, sin bloquear los flujos principales.
  - **Reducción de infraestructura:** Usar Redis para ambos roles elimina la necesidad de un broker de mensajería adicional (como RabbitMQ) para el volumen de eventos que maneja el sistema.

---

### 1.5. Procedimientos Almacenados, Vistas, Funciones y Triggers en PostgreSQL

- **Decisión:** Delegar la lógica transaccional y de consulta directamente al motor de base de datos mediante objetos programables.
- **Justificación:**
  - **Procedimientos almacenados:** Flujos como `sp_register_user`, `sp_rate_content` (UPSERT) y `sp_upsert_content_from_external` garantizan atomicidad en operaciones que involucran múltiples tablas. Reducen el tráfico de red al ejecutar múltiples sentencias en una sola llamada.
  - **Vistas:** `vw_catalog_card`, `vw_content_detail` y `vw_user_active_subscription` simplifican las consultas del servicio y encapsulan los JOINs complejos, evitando que la lógica de armado del catálogo se duplique en el código de aplicación.
  - **Funciones:** `fn_recommendation_percentage` y `fn_get_rating_summary` encapsulan cálculos modulares reutilizables que pueden ser invocados desde distintos contextos sin duplicar lógica.
  - **Triggers:** `trg_audit_credential_update`, `trg_audit_rating_changes` y `trg_audit_subscription_change` garantizan que las auditorías se registren de forma automática e inevitable, independientemente del servicio que origine el cambio.

---

### 1.6. Payment Gateway Service como Microservicio Sandbox

- **Decisión:** Implementar un microservicio dedicado `payment-gateway-service` (Python :50057) que simula una pasarela de pagos con validación Luhn y reglas sandbox.
- **Justificación:**
  - **Separación de responsabilidades:** El procesamiento de pagos es un dominio con lógica propia (validación de tarjeta, manejo de estados approved/declined/rejected) que no debe residir en el Subscription Service.
  - **Reemplazabilidad:** Al exponer un contrato gRPC estándar mediante `payment.proto`, el sandbox puede reemplazarse por una integración real con Stripe, Braintree u otro proveedor sin modificar el API Gateway ni el Subscription Service.
  - **Flujo de pago previo a suscripción:** El Gateway orquesta tres llamadas síncronas en secuencia: `ListPlans → GetRate → AuthorizePayment → CreateSubscription`. Separar el pago en su propio servicio permite que `CreateSubscription` solo se ejecute si el pago fue aprobado, manteniendo la responsabilidad de cada servicio acotada a su dominio.

---

## 2. Decisiones de Infraestructura

### 2.1. Docker y Docker Compose con Dos Entornos

- **Decisión:** Cada microservicio, base de datos, caché y Gateway tiene su propio `Dockerfile`. Se mantienen dos archivos Docker Compose: `docker-compose.local.yml` y `docker-compose.cloud.yml`.
- **Justificación:**
  - **Reproducibilidad:** Los contenedores garantizan que el entorno de desarrollo sea idéntico al de producción, eliminando problemas de "funciona en mi máquina".
  - **Separación de entornos:** El entorno local usa variables de entorno para desarrollo y permite levantar todo el ecosistema en una sola máquina. El entorno cloud usa variables de producción, volúmenes remotos y políticas de reinicio adecuadas para GCP.
  - **Aislamiento de versiones:** Cada imagen fija la versión de sus dependencias (`redis:7`, `postgres:16-alpine`, `postgres:15`), evitando actualizaciones automáticas que rompan compatibilidad.

---

### 2.2. React + Vite como Frontend

- **Decisión:** Desarrollar la aplicación web con React 18, TypeScript y Vite.
- **Justificación:**
  - **Rendimiento en desarrollo:** Vite ofrece arranque instantáneo y hot-module-replacement sin bundling completo, acelerando el ciclo de desarrollo.
  - **Tipado end-to-end:** TypeScript en el frontend y en el API Gateway permite mantener consistencia de tipos entre la interfaz de usuario y las respuestas HTTP del Gateway.
  - **Modularidad:** La arquitectura de componentes de React facilita la separación del panel de administración (`AdminPage`) del flujo de usuario normal (`SubscriptionsPage`, `CatalogPage`) sin compartir estado entre contextos distintos.

---

### 2.3. Archivos `.env` para Gestión de Secretos

- **Decisión:** Toda información sensible (URLs de base de datos, claves JWT, credenciales SMTP, puertos gRPC) se gestiona exclusivamente mediante archivos `.env` que no se suben al repositorio.
- **Justificación:**
  - **Seguridad:** Evita que credenciales de producción queden expuestas en el historial de Git.
  - **Portabilidad:** Permite que cada miembro del equipo configure su entorno local sin modificar el código fuente.
  - **Buenas prácticas:** Cada servicio incluye un `.env.example` como plantilla documentada con las variables requeridas.

---

### 2.4. GitHub Actions como Herramienta de CI/CD

- **Decisión:** Implementar el pipeline de Integración y Despliegue Continuo exclusivamente con GitHub Actions, mediante dos workflows declarativos: `deploy-develop.yml` y `deploy-release.yml`.
- **¿Qué?** GitHub Actions es la plataforma de automatización nativa de GitHub que ejecuta workflows definidos como archivos YAML dentro del repositorio bajo `.github/workflows/`.
- **¿Por qué?**
  - **Integración nativa:** Al vivir en el mismo repositorio que el código, los workflows son versionados, revisados en Pull Requests y auditables como cualquier otro cambio. No requiere mantener un servidor CI externo (Jenkins, CircleCI).
  - **Cortocircuito crítico:** La dependencia explícita entre jobs (`needs:`) garantiza que un fallo en `ci-checks` detenga el pipeline antes de consumir cuota de red o almacenamiento en GCP.
  - **Environments por rama:** GitHub Environments permiten asociar secrets y variables distintas a `develop` y `release`, aplicando el principio de mínimo privilegio: el entorno de desarrollo no tiene acceso a las credenciales de producción de GKE.
  - **Estrategia multi-rama:** El mismo flujo de CI (compilación, pruebas, backup) se reutiliza en ambos workflows, pero la etapa de despliegue bifurca: `develop` despliega en Compute Engine mediante Docker Compose, y `release` despliega en GKE mediante manifiestos declarativos YAML.
- **¿Para qué?** Garantizar que ningún cambio llegue a producción sin haber pasado por compilación, pruebas, respaldo de bases de datos y validación de despliegue, eliminando el error humano del proceso de entrega.

---

### 2.5. Google Cloud Storage (GCS) para Archivos Estáticos

- **Decisión:** Toda la persistencia de archivos multimedia pesados (videos de películas y capítulos, imágenes de portadas) se almacena en buckets de Google Cloud Storage en lugar del sistema de archivos local de los contenedores.
- **¿Qué?** Google Cloud Storage es un servicio de almacenamiento de objetos distribuido en GCP. Se utilizan tres buckets: `media-bucket` (videos y posters), `audit-bucket` (reportes PDF) y `thumbnail-bucket` (miniaturas).
- **¿Por qué?**
  - **Desacoplamiento del sistema de archivos:** Los contenedores son efímeros; almacenar archivos en el sistema de archivos local los perdería ante cualquier reinicio, rollback o escalado horizontal. GCS persiste los archivos independientemente del ciclo de vida de los Pods.
  - **URLs firmadas:** GCS permite generar URLs firmadas con tiempo de expiración configurable (`GCS_SIGNED_READ_EXPIRES_MINUTES`), de modo que el reproductor del frontend consume los recursos directamente desde GCS sin que el video transite por el backend, reduciendo el ancho de banda y la carga de los microservicios.
  - **Escalabilidad y disponibilidad:** GCS opera con disponibilidad del 99.9% y escala automáticamente sin necesidad de aprovisionar almacenamiento adicional, a diferencia de un volumen adjunto a una VM que tiene capacidad fija.
  - **Backup automatizado:** El pipeline CI/CD exporta los dumps SQL de las bases de datos operacionales directamente al bucket (`gs://bucket/backups/{rama}/{run-id}/`), centralizando todos los respaldos en el mismo servicio de almacenamiento.
- **¿Para qué?** Permitir que el reproductor del frontend consuma video en streaming directamente desde GCS mediante URLs públicas o firmadas, calculando y mostrando la duración real del archivo, sin depender de la disponibilidad ni capacidad de los microservicios de backend.

---

### 2.6. Google Kubernetes Engine (GKE) para el Entorno de Producción

- **Decisión:** El entorno correspondiente a la rama `release` se despliega en un clúster de Google Kubernetes Engine en lugar de máquinas virtuales, aplicando obligatoriamente estrategias de RollingUpdate y Rollback automático.
- **¿Qué?** Google Kubernetes Engine es el servicio administrado de Kubernetes en GCP. El clúster `qx-gke-release` aloja todos los microservicios bajo el namespace `quetxal-tv-prod`, con un único punto de acceso externo mediante un recurso Ingress.
- **¿Por qué?**
  - **Despliegue sin downtime (RollingUpdate):** La estrategia `RollingUpdate` con `maxSurge=1` y `maxUnavailable=0` garantiza que siempre existe al menos una réplica de cada servicio atendiendo tráfico mientras los nuevos Pods se inicializan, evitando interrupciones durante las actualizaciones.
  - **Rollback automático:** Si un nuevo Pod entra en estado `CrashLoopBackOff` o no supera el `rollout status` en 180 segundos, el pipeline ejecuta `kubectl rollout undo` de forma automática, restaurando la versión estable anterior sin intervención manual.
  - **Orquestación declarativa:** Los manifiestos YAML en `deploy/release/k8s/` describen el estado deseado del sistema. Kubernetes reconcilia continuamente el estado real con el declarado, reiniciando Pods caídos y redistribuyendo carga sin intervención operativa.
  - **Aislamiento de recursos:** Cada Pod define `requests` y `limits` de CPU y memoria, evitando que un servicio con pico de demanda degrade al resto del clúster.
  - **Gestión segura de configuración:** ConfigMaps inyectan variables de entorno genéricas y Secrets gestionan credenciales sensibles (JWT, passwords de BD, Service Account de GCS), sin que ningún valor sensible quede escrito en los archivos YAML del repositorio.
- **¿Para qué?** Garantizar alta disponibilidad del sistema en producción con despliegues progresivos que no interrumpan las transmisiones de video activas, y con capacidad de recuperación automática ante fallos sin requerir intervención del equipo fuera de horario.

---

### 2.7. PostgreSQL como Motor de Base de Datos Relacional

- **Decisión:** Utilizar PostgreSQL como sistema gestor de base de datos relacional para los cuatro dominios con persistencia estructurada: `identity_db`, `catalog_db`, `subscription_db` y `engagement_db`.
- **¿Qué?** PostgreSQL es un motor de base de datos objeto-relacional de código abierto. El sistema utiliza PostgreSQL 16 para los servicios de Identity, Catalog y Engagement, y PostgreSQL 15 para Subscription, cada instancia aislada en su propio contenedor siguiendo el patrón Database per Microservice.
- **¿Por qué?**
  - **Cumplimiento ACID:** Las operaciones críticas del sistema — registro de usuarios, autorización de pagos, creación de suscripciones — involucran múltiples tablas y deben ser atómicas. PostgreSQL garantiza que una transacción fallida no deje la base de datos en un estado parcialmente modificado.
  - **Objetos programables nativos:** PostgreSQL soporta stored procedures, triggers, vistas y funciones almacenadas como ciudadanos de primera clase del motor. Esto permite que la lógica de auditoría (`trg_audit_*`), los cálculos de recomendación (`fn_recommendation_percentage`) y los flujos transaccionales (`sp_register_user`, `sp_rate_content`) residan en la base de datos, garantizando su ejecución independientemente del servicio que origine el cambio.
  - **JSONB para datos semi-estructurados:** El catálogo de contenido almacena géneros, elenco y episodios como columnas JSONB, evitando tablas de relación adicionales para atributos variables sin sacrificar la capacidad de indexación y consulta estructurada.
  - **Aislamiento por esquema:** Cada microservicio opera sobre su propia instancia de base de datos. Un cambio de esquema en `subscription_db` no requiere coordinación con `catalog_db` ni con `identity_db`, permitiendo migraciones independientes por dominio.
  - **Ecosistema maduro:** Librerías como `psycopg2` (Python) y `pg` (Node.js) ofrecen integración directa sin capas ORM que oculten la ejecución de stored procedures o limiten el control sobre las transacciones.
- **¿Para qué?** Garantizar integridad transaccional en los flujos de negocio críticos (registro, pago, suscripción), asegurar que los triggers de auditoría se ejecuten de forma inevitable ante cualquier modificación de datos, y soportar consultas complejas del catálogo con índices y vistas sin duplicar lógica en el código de aplicación.

---

### 2.8. Seguridad de Sesión: JWT con Cookies HttpOnly

- **Decisión:** Autenticar las sesiones de usuario mediante JSON Web Tokens (JWT) firmados con HMAC-SHA256, transportados exclusivamente en cookies HttpOnly gestionadas por el API Gateway.
- **¿Qué?** El API Gateway emite un JWT al completarse el login exitoso (`Identity Service → gRPC → Gateway → Set-Cookie`). El token se almacena en una cookie con nombre `access_token`, configurada como HttpOnly, con `Secure=true` en producción y `SameSite=lax`. Cada request subsiguiente incluye la cookie automáticamente; el Gateway extrae y verifica el JWT antes de enrutar la petición al microservicio correspondiente.
- **¿Por qué?**
  - **HttpOnly neutraliza XSS:** Al marcar la cookie como HttpOnly, el token es completamente inaccesible desde JavaScript del navegador. Un script malicioso inyectado en la página no puede leer ni exfiltrar el token de sesión, eliminando la superficie de ataque más común en aplicaciones SPA.
  - **Secure en producción:** La variable `COOKIE_SECURE=true` en el entorno cloud garantiza que la cookie únicamente se transmite sobre conexiones HTTPS, impidiendo su captura en tráfico HTTP plano.
  - **SameSite=lax protege contra CSRF:** La política `lax` bloquea el envío de la cookie en requests cross-site iniciados desde contextos de terceros (iframes, formularios externos), mitigando ataques de Cross-Site Request Forgery sin requerir tokens CSRF adicionales.
  - **JWT stateless:** El Gateway verifica la firma del token localmente usando `JWT_SECRET` sin necesidad de consultar ninguna base de datos ni session store por cada request. Esto elimina una dependencia de latencia en el camino crítico de autenticación y permite escalar el Gateway horizontalmente sin estado compartido.
  - **Expiración acotada:** `JWT_EXPIRES_IN=1d` limita la ventana de exposición ante un token comprometido a un máximo de 24 horas, tras las cuales el usuario debe re-autenticarse.
- **¿Para qué?** Proveer autenticación stateless en el API Gateway que proteja contra XSS y CSRF, permita escalar horizontalmente sin session store centralizado, y limite el impacto de un token comprometido mediante expiración automática.

---

### 2.9. Terraform como Herramienta de Infraestructura como Código

- **Decisión:** Toda la infraestructura de GCP (VPC, subredes, firewalls, clúster de GKE, instancias de base de datos externas y VMs de desarrollo) se define y gestiona de forma declarativa mediante Terraform, organizada en módulos reutilizables por entorno (`develop` y `release`).
- **¿Qué?** Terraform es una herramienta de Infraestructura como Código (IaC) de HashiCorp que permite describir el estado deseado de la infraestructura cloud en archivos `.tf` declarativos. Mantiene un archivo de estado (`terraform.tfstate`) que mapea los recursos declarados con los recursos reales aprovisionados en GCP, permitiendo calcular y aplicar únicamente los cambios necesarios (`terraform plan` / `terraform apply`).
- **¿Por qué?**
  - **Reproducibilidad total:** La infraestructura completa puede destruirse y reconstruirse de forma idéntica ejecutando `terraform apply`, eliminando la deriva de configuración (configuration drift) que ocurre al provisionar recursos manualmente desde la consola de GCP.
  - **Versionado de infraestructura:** Los archivos `.tf` se pueden versionar en Git junto al código de aplicación, permitiendo revisar cambios de infraestructura en Pull Requests con el mismo rigor que cambios de código.
  - **Módulos por dominio:** La organización en módulos (`network`, `firewall`, `cloud-sql`, `compute-vms`, `gke`, `redis`, `storage`) evita duplicar definiciones entre los entornos `develop` y `release`, reutilizando la misma lógica con variables distintas.
- **¿Para qué?** Garantizar que la creación, modificación y destrucción de la infraestructura de Quetxal TV sea auditable, repetible y libre de intervención manual, alineando el aprovisionamiento cloud con las mismas prácticas de control de versiones que el código de aplicación.

---

### 2.10. Ansible para Gestión de Configuración Automatizada

- **Decisión:** El despliegue de dependencias, herramientas base y preparación de los entornos de ejecución en las VMs de Compute Engine se automatiza exclusivamente mediante Playbooks de Ansible, organizados en roles reutilizables.
- **¿Qué?** Ansible es una herramienta de gestión de configuración *agentless* que automatiza la instalación de software y configuración de servidores remotos mediante conexiones SSH, sin requerir un agente instalado en las VMs destino. Los Playbooks (`elk_playbook.yml`, entre otros) describen en YAML las tareas a ejecutar, organizadas en roles (`docker`, `deploy-user`, `app-directories`, `validations`) e inventarios que listan las VMs objetivo por entorno.
- **¿Por qué?**
  - **Agentless:** Al no requerir instalar software adicional en las VMs, Ansible reduce la superficie de configuración y el mantenimiento de las máquinas; basta con acceso SSH y Python en el host remoto.
  - **Idempotencia:** Ejecutar el mismo Playbook múltiples veces produce el mismo resultado final sin generar efectos secundarios, lo que permite reaplicar la configuración de forma segura tras cambios o reinicios de las VMs.
  - **Separación de responsabilidades respecto a Terraform:** Terraform aprovisiona los recursos de infraestructura (la VM existe), mientras que Ansible configura el software dentro de esos recursos (Docker, dependencias, usuarios de despliegue). Esta separación evita mezclar el ciclo de vida del recurso cloud con el ciclo de vida de su configuración interna.
  - **Roles reutilizables:** La estructura de roles permite aplicar la misma configuración base (Docker, estructura de directorios) tanto en las VMs de `develop` como en las VMs auxiliares de `release`, sin duplicar tareas.
- **¿Para qué?** Garantizar que toda VM aprovisionada por Terraform quede configurada de forma consistente y reproducible, sin necesidad de configuración manual post-creación, alineando la gestión de software de los servidores con el mismo principio de automatización declarativa que rige el resto del pipeline.

---
