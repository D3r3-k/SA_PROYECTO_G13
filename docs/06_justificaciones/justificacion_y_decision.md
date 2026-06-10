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
