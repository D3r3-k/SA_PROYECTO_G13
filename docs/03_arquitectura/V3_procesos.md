## V3 — Vista de Procesos

La vista de procesos modela los flujos de comunicacion en tiempo de ejecucion. Muestra como los distintos procesos del sistema interactuan entre si, que canales de comunicacion usan y como se comportan bajo carga. Para Quetxal TV existen dos canales de comunicacion diferenciados: gRPC sincrono para las operaciones del flujo principal, y Redis asincrono para el flujo de notificaciones.


![Vista de procesos](<../00_assets/diagrams/03_arquitectura/vistaprocesos1.png>)

---

### Canal 1 — gRPC Sincrono (HTTP/2)

Es el canal principal del sistema. El cliente web se comunica con el API Gateway mediante HTTP con cookies seguras. El Gateway transforma cada solicitud HTTP en una llamada gRPC al microservicio correspondiente usando los clientes generados desde los archivos .proto.

| Llamada | Metodos gRPC |  |
| :------ | :----------- | :----- |
| Gateway → Identity Service | RegisterUser, Login, ValidateToken, CreateProfile, ListProfiles, SelectProfile, UpdateProfile, DeleteProfile, UpdateCredentials |  |
| Gateway → Catalog Service | ListContent, SearchContent, FilterContent, GetDetail, GetActors |  |
| Gateway → Subscription Service | ListPlans, CreateSubscription, UpdateSubscription, CancelSubscription, ListUserSubscriptions |  |
| Gateway → FX Service | GetRate |  |
| Gateway → Engagement Service | RateContent, GetContentRatingSummary, SaveProgress, GetRecentHistory, ResumeContent |  |

Cada servicio procesa la solicitud de forma sincrona, accede a su base de datos propia y retorna la respuesta directamente al Gateway, que la convierte a HTTP y la devuelve al cliente. Ningun cliente externo puede llamar directamente a los microservicios — el Gateway es el unico punto de entrada.

---

### Canal 2 — Redis Asincrono (Queue)

Es el canal de notificaciones. Los servicios productores publican eventos en la cola Redis sin esperar respuesta. El Notification Service los consume de forma independiente.

| Paso | Proceso | Operacion Redis |
| :--- | :------ | :-------------- |
| 1 | Identity Service publica evento al registrar usuario | RPUSH notification:queue (tipo: registration) |
| 2 | Subscription Service publica evento al crear o modificar suscripcion | RPUSH notification:queue (tipo: purchase_receipt / subscription_update) |
| 3 | Notification Worker consume el siguiente evento de la cola | BLPOP notification:queue (blocking, timeout 5s) |
| 4 | Notification Service construye el email segun el tipo de evento | build_notification_content |
| 5 | Notification Service envia el email via SMTP o usa console fallback | aiosmtplib / log |

Este canal desacopla completamente el envio de correos del flujo principal. Si el Notification Service falla o se reinicia, los eventos permanecen en la cola Redis hasta ser procesados.

---

### Redis — Doble responsabilidad

Redis cumple dos roles completamente separados en el sistema. Como cache del FX-Service almacena tasas de cambio con TTL configurable bajo la clave `fx:rate:{BASE}:{TARGET}` para evitar llamadas repetitivas a la API Frankfurter. Como broker de notificaciones mantiene la lista `notification:queue` donde se encolan los eventos JSON que el Notification Worker consume con BLPOP de forma bloqueante.

---
