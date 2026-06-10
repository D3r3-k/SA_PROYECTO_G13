## V3 — Vista de Procesos

La vista de procesos modela los flujos de comunicacion en tiempo de ejecucion. Muestra como los distintos procesos del sistema interactuan entre si, que canales de comunicacion usan y como se comportan bajo carga. Para Quetxal TV existen tres canales de comunicacion diferenciados: gRPC sincrono para las operaciones del flujo principal, Redis asincrono para el flujo de notificaciones, y Redis cache para el servicio de tipo de cambio.

![Vista de procesos](<../00_assets/diagrams/03_arquitectura/vistaprocesosfull.png>)

---

### Canal 1 — gRPC Sincrono (HTTP/2)

Es el canal principal del sistema. El cliente web se comunica con el API Gateway mediante HTTP con cookies seguras. El Gateway transforma cada solicitud HTTP en una llamada gRPC al microservicio correspondiente usando los clientes generados desde los archivos `.proto`. Ningun cliente externo puede llamar directamente a los microservicios — el Gateway es el unico punto de entrada.

| Llamada | Metodos gRPC |
| :------ | :----------- |
| Gateway → Identity Service | RegisterUser, Login, ValidateToken, CreateProfile, ListProfiles, SelectProfile, UpdateProfile, DeleteProfile, UpdateCredentials |
| Gateway → Catalog Service | ListContent, SearchContent, GetContentDetail, SyncMinimumCatalog |
| Gateway → Subscription Service | ListPlans, CreateSubscription, UpdateSubscription, CancelSubscription, ListUserSubscriptions, UpdatePlan |
| Gateway → FX Service | GetRate |
| Gateway → Payment Gateway Service | AuthorizePayment, Health |
| Gateway → Engagement Service | RateContent, GetContentRatingSummary, SaveProgress, GetRecentHistory, ResumeContent |

Cada servicio procesa la solicitud de forma sincrona, accede a su base de datos propia y retorna la respuesta directamente al Gateway, que la convierte a HTTP y la devuelve al cliente.

#### Flujo de Suscripcion — 4 llamadas gRPC sincronas en secuencia

El proceso de suscripcion es el flujo mas complejo del sistema porque involucra tres microservicios distintos antes de activar la suscripcion. El Gateway los orquesta en el siguiente orden estricto:

| Paso | Llamada gRPC | Servicio | Descripcion |
| :--- | :----------- | :------- | :---------- |
| 1| `ListPlans()` | Subscription Service | Obtener los planes disponibles y su precio en USD |
| 2 | `GetRate(base:USD, target:currency)` | FX Service | Convertir el precio a la moneda seleccionada por el usuario. Si `base == target` retorna `rate=1.0` sin consultar Redis ni la API externa |
| 3 | `AuthorizePayment(card_data, amount, currency)` | Payment Gateway Service :50057 | Validar la tarjeta con el algoritmo de Luhn, verificar fecha de vencimiento y CVV, y procesar el pago en el sandbox QuetxalPay. Retorna `status:approved` con `transaction_id` y `authorization_code`, o `status:rejected` (HTTP 400) / `status:declined` (HTTP 402) |
| 4 | `CreateSubscription(user_id, plan_id, email)` | Subscription Service | Activar la suscripcion. **Este paso solo se ejecuta si el paso ③ retorna `status:approved`**. Si el pago falla, el flujo termina en el paso ③ y no se crea ninguna suscripcion |

---

### Canal 2 — Redis Asincrono (Queue)

Es el canal de notificaciones. Los servicios productores publican eventos en la cola Redis con `RPUSH` sin esperar respuesta. El Notification Worker los consume de forma independiente con `BLPOP` bloqueante con timeout de 5 segundos.

| Paso | Proceso | Operacion Redis | Tipo de evento |
| :--- | :------ | :-------------- | :------------- |
| 1 | Identity Service al registrar un usuario | RPUSH notification:queue | `registration` |
| 2 | Subscription Service al crear una suscripcion | RPUSH notification:queue | `purchase_receipt` |
| 3 | Subscription Service al modificar una suscripcion | RPUSH notification:queue | `subscription_update` |
| 4 | Catalog Service al publicar nuevo contenido | RPUSH notification:queue | `content-publication` |
| 5 | Notification Worker consume el evento de la cola | BLPOP notification:queue (timeout=5s) | — |
| 6 | Notification Service construye el email segun el tipo | `_build_notification_content` | — |
| 7 | Notification Service envia el email o usa fallback | `aiosmtplib.send` / `logger.info` | — |

Este canal desacopla completamente el envio de correos del flujo principal. Si el Notification Service falla o se reinicia, los eventos permanecen en la cola Redis hasta ser procesados. Los servicios productores nunca esperan confirmacion del envio del correo.

---

### Canal 3 — Redis Cache FX (Cache-Aside)

El FX Service utiliza Redis como cache de tasas de cambio bajo el patron Cache-Aside. La clave de cache tiene el formato `fx:rate:{BASE}:{TARGET}` con TTL configurable mediante la variable de entorno `FX_CACHE_TTL` (valor por defecto: 3600 segundos).

| Paso | Operacion | Descripcion |
| :--- | :-------- | :---------- |
| 1 | FX Service recibe `GetRate(base, target)` | Si `base == target` retorna `rate=1.0` directamente sin consultar Redis |
| 2 | `get_json(fx:rate:{B}:{T})` | Consulta Redis. Si hay HIT retorna la tasa cacheada con `cached:true` |
| 3 | Cache MISS | Llama al endpoint primario `GET /rate/{BASE}/{TARGET}` de Frankfurter |
| 4 | Fallback | Si el endpoint primario falla, usa `GET /rates?base={B}&quotes={T}` |
| 5 | `set_json(key, payload, TTL)` | Guarda la tasa en Redis con el TTL configurado |
| 6 | Retorna `RateResponse` | Incluye `cached:false` y `provider:frankfurter-v2` |

Si Redis no esta disponible al guardar, el FX Service registra un `logger.warning` pero retorna la tasa igualmente sin interrumpir el flujo principal.

---

### Redis — Triple responsabilidad

Redis cumple tres roles diferenciados en el sistema:

1. **Cache de tasas de cambio** — clave `fx:rate:{BASE}:{TARGET}` con TTL, evita llamadas repetitivas a la API Frankfurter externa.
2. **Cola de notificaciones** — lista `notification:queue` donde se encolan los eventos JSON que el Notification Worker consume con BLPOP de forma bloqueante.
3. **Desacoplador de procesos** — permite que Identity Service y Subscription Service publiquen eventos sin depender de la disponibilidad del Notification Service en el momento exacto.

---