## V4 — Vista de Componentes

![Diagrama de Componentes](../00_assets/diagrams/04_diagramas/componentesactualizado.drawio.png)

* **Archivo editable:** [VistaComponentes.drawio](../00_assets/raw/Vista4+1/VistaComponentes.drawio)

La vista de componentes describe la organización física estática del sistema
en unidades autónomas reemplazables. Cada microservicio se modela como un
`<<component>>` con sus interfaces proporcionadas (lollipop) y requeridas
(socket), mostrando cómo se encapsulan los contratos gRPC definidos en `/proto`.

---

### Zonas del diagrama

El diagrama se divide en tres zonas diferenciadas:

**Zona Cliente** — contiene el componente `Web SPA` (React + Vite). Es la única
pieza que se ejecuta en el navegador y se comunica exclusivamente con el
API Gateway via HTTP REST + Cookie HttpOnly. Nunca llama a microservicios directamente.

**Punto de Entrada (HTTP)** — el `API Gateway` (TypeScript, puerto 3000) es
el único componente públicamente accesible. Valida el JWT, aplica el
`admin.middleware.ts` para rutas protegidas y despacha todas las llamadas
internas vía gRPC.

**Capa de Microservicios (gRPC interno)** — siete servicios completamente
desacoplados entre sí, excepto por los contratos definidos en `/proto`:

| Componente | Lenguaje | Puerto | Responsabilidad |
| :--- | :--- | :--- | :--- |
| `identity-service` | TypeScript | 50051 | Autenticación JWT, perfiles, auditoría de credenciales, PIN de control parental |
| `catalog-service` | Go | 50055 | Catálogo VOD, subida a GCS (Signed URLs), auditoría de cambios |
| `fx-service` | Python | 50052 | Tipos de cambio con caché Redis (Cache-Aside, TTL 3600 s) |
| `subscription-service` | Python | 50053 | Planes y suscripciones; publica eventos a Redis (RPUSH) |
| `engagement-service` | Go | 50056 | Calificaciones, historial de reproducción, progreso |
| `payment-gateway-service` | Python | 50057 | Pasarela sandbox (Luhn + fx-service para conversión) |
| `notification-service` | Python | 50054 | Consume Redis queue (BLPOP) y envía correos via SMTP |
| **`recommendation-service`** *(Fase 3)* | **Python** | **50058** | **Recomendaciones personalizadas por filtrado de contenido (CBF); similitud coseno sobre historial y catálogo** |

---

### Interfaces y conectores

Cada componente expone una interfaz proporcionada (círculo lleno) que agrupa
los RPCs definidos en su `.proto`. Las interfaces requeridas (socket) modelan
las dependencias hacia infraestructura o hacia otros servicios:

- **gRPC síncrono** (HTTP/2) — todos los servicios hacia el API Gateway.
- **Redis RPUSH / BLPOP** — canal asíncrono de notificaciones entre
  `identity-service` / `subscription-service` (productores) y
  `notification-service` (consumidor).
- **Redis Cache-Aside** — `fx-service` lee y escribe la clave
  `fx:rate:{BASE}:{TARGET}` con TTL de 3600 s antes de consultar
  Frankfurter API.
- **GCS SDK** — `catalog-service` genera Signed URLs para subidas directas
  desde el navegador; también lee y elimina objetos del bucket
  `qx-media-sa-derek-proyecto`.
- **HTTPS externo** — `fx-service` → `frankfurter.dev`;
  `notification-service` → Gmail SMTP.

---

### Contrato compartido `/proto`

La carpeta `/proto` actúa como contrato único entre todos los componentes.
Ningún servicio puede cambiar su interfaz gRPC sin actualizar primero su
archivo `.proto` correspondiente y regenerar los stubs.

Archivos: `identity.proto`, `catalog.proto`, `fx.proto`,
`subscription.proto`, `engagement.proto`, `payment.proto`,
`notification.proto`, `recommendation.proto` *(Fase 3)*.

---

### Base de datos por servicio

Cada microservicio con persistencia tiene su propia base de datos PostgreSQL
aislada — ninguno comparte esquema con otro:

| Servicio | Base de datos |
| :--- | :--- |
| `identity-service` | `identity_db` |
| `catalog-service` | `catalog_db` |
| `subscription-service` | `subscription_db` |
| `engagement-service` | `engagement_db` |
| **`recommendation-service`** *(Fase 3)* | `engagement_db` (lectura) · `catalog_db` (lectura) |

---

### Módulos de Fase 3 en el API Gateway

El API Gateway incorporó dos módulos nuevos en Fase 3 que extienden sus responsabilidades sin romper el contrato HTTP/gRPC existente:

| Módulo | Archivo | Responsabilidad |
| :----- | :------ | :-------------- |
| **Control Parental** | `parental-control.ts` | Middleware que intercepta solicitudes de reproducción de contenido clasificado. Consulta la clasificación al `identity-service` y, si el contenido requiere PIN, bloquea el acceso hasta que el usuario ingrese y valide el PIN cifrado (bcrypt) almacenado en `identity_db` |
| **Watch Party** | `rooms.ts` | Módulo WebSocket que gestiona salas de visualización sincronizada. Valida el plan Premium del host via gRPC contra `subscription-service`, crea la sala con `room_id` e `invite_code`, y mantiene el canal WebSocket persistente para difundir eventos de reproducción (play/pause/seek) a todos los miembros conectados |

### CronJob `purge-inactive-users` *(Fase 3)*

Componente autónomo que no forma parte del grafo de microservicios gRPC. Es un **Pod efímero** activado por el Kubernetes Scheduler que ejecuta un soft delete sobre cuentas inactivas en `identity_db`. Se despliega como `<<CronJob>>` con `backoffLimit: 3` y genera alertas en el namespace `observability` si agota los reintentos. No expone ningún puerto ni interfaz gRPC.