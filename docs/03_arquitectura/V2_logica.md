## V2 — Vista Logica

![Vista logica](<../00_assets/diagrams/03_arquitectura/vistalogica.png>)

La vista logica describe la organizacion interna de cada microservicio en terminos de paquetes, modulos y responsabilidades. Muestra como se distribuye la logica de negocio, la comunicacion gRPC, el acceso a datos y los utilitarios dentro de cada servicio, y como todos comparten los contratos definidos en la carpeta /proto.

---

### Carpeta /proto (compartida)

Es el unico punto de contrato entre todos los servicios. Contiene los archivos Protocol Buffers que definen los mensajes y metodos gRPC de cada dominio: identity.proto, catalog.proto, subscription.proto, fx.proto, engagement.proto y notification.proto. Ningun servicio puede cambiar su interfaz sin actualizar primero su .proto correspondiente.

---

### Distribucion por servicio

| Servicio | Lenguaje | Modulos principales |
| :------- | :------- | :------------------ |
| api-gateway | TypeScript | routes/ (auth, profiles, subscriptions, fx, health), middleware/auth.middleware.ts, grpc/ (identity.client, subscription.client, fx.client), config/env.ts |
| identity-service | TypeScript | grpc/identity.server.ts, services/identity.service.ts, repositories/ (user, profile), utils/ (password bcrypt, token JWT), events/notification.publisher.ts, db/pool.ts, migrations/ |
| catalog-service | Go | grpc/catalog.server.go, repository/catalog.repository.go, db/migrations (vw_cartelera, fn_search_content, vw_ficha_contenido) |
| subscription-service | Python | grpc_server.py, repository.py (list_plans, create/update/cancel_subscription), notification_publisher.py (RPUSH Redis), schemas.py, db.py |
| fx-service | Python | grpc_server.py (GetRate), cache.py (RedisCache: get_json, set_json con TTL), provider.py (fetch_rate Frankfurter con primary + fallback), config.py |
| engagement-service | Go/Python | grpc_server (RateContent, GetRatingSummary, SaveProgress, GetRecentHistory, ResumeContent), repository (ratings, watch_history, progress), db/migrations (fn_calculate_recommendation_pct, vw_recent_profile_history, trigger audit_rating_changes) |
| notification-service | Python | grpc_server.py (Health, Send), notification_worker (BLPOP Redis queue), build_notification_content (por tipo: registration, purchase_receipt, subscription_update, content-publication), send_email (aiosmtplib SMTP + console fallback) |

---

### Principios de organizacion

Cada servicio aplica separacion de responsabilidades en capas: la capa gRPC recibe y despacha las llamadas, la capa de servicio o logica de negocio orquesta las operaciones, la capa de repositorio accede a la base de datos mediante objetos programables (stored procedures, vistas y funciones), y la capa de utilitarios agrupa funciones reutilizables como hashing, generacion de JWT y publicacion de eventos. Esta estructura garantiza que cada capa pueda modificarse o probarse de forma independiente.