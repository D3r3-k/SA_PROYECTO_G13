# Requerimientos Funcionales 


## 1. Introducción

Este documento especifica los requerimientos funcionales de **Quetxal TV**, una plataforma de streaming construida sobre una arquitectura de microservicios. Cada requerimiento está vinculado al servicio responsable de su cumplimiento, incluye criterio de aceptación verificable y refleja el estado actual de implementación del sistema.

## 2. RF-AUTH — Autenticación y Sesión

**Servicio responsable:** `identity-service` + `api-gateway`  
**Tecnología:** TypeScript, JWT (HS256), bcryptjs, cookies HttpOnly

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-AUTH-01 | El sistema debe permitir el registro de un nuevo usuario proporcionando nombre completo, correo electrónico y contraseña. | El usuario se crea en la base de datos con contraseña hasheada. Se retorna JWT y se envía correo de confirmación. | Alta | Implementado |
| RF-AUTH-02 | El sistema debe validar que el correo electrónico sea único en el momento del registro. | Si el correo ya existe, el sistema retorna error con mensaje descriptivo y no crea duplicados. | Alta | Implementado |
| RF-AUTH-03 | El sistema debe normalizar el correo electrónico a minúsculas antes de almacenarlo. | Un correo con mayúsculas se almacena y compara siempre en formato lowercase. | Alta | Implementado |
| RF-AUTH-04 | El sistema debe almacenar la contraseña utilizando hash bcrypt. | La columna `password_hash` nunca contiene texto plano. El factor de costo de bcrypt debe ser al menos 10. | Alta | Implementado |
| RF-AUTH-05 | El sistema debe requerir una contraseña de mínimo 8 caracteres al registrarse. | El servicio rechaza contraseñas menores a 8 caracteres con mensaje de validación. | Alta | Implementado |
| RF-AUTH-06 | El sistema debe permitir el inicio de sesión con correo y contraseña válidos. | Las credenciales correctas retornan un JWT. Las incorrectas retornan error 401 con mensaje genérico. | Alta | Implementado |
| RF-AUTH-07 | El sistema debe generar un JWT firmado (HS256) tras autenticación exitosa, incluyendo `user_id` y opcionalmente `profile_id`. | El token es decodificable y contiene los campos `user_id`, `email` y, si aplica, `profile_id`. | Alta | Implementado |
| RF-AUTH-08 | El API Gateway debe entregar el JWT al cliente mediante una cookie segura (`HttpOnly`, `SameSite`, `Secure` en producción). | La cookie no es accesible desde JavaScript del cliente. En producción el flag `Secure` está activo. | Alta | Implementado |
| RF-AUTH-09 | El sistema debe permitir cerrar sesión eliminando la cookie de sesión del cliente. | Tras el logout, la cookie se invalida y las rutas protegidas retornan 401. | Alta | Implementado |
| RF-AUTH-10 | El API Gateway debe validar la sesión activa antes de procesar cualquier ruta protegida. | Una petición sin cookie válida retorna 401. Una petición con token expirado o malformado retorna 401. | Alta | Implementado |
| RF-AUTH-11 | El sistema debe exponer un endpoint para consultar los datos del usuario autenticado. | `GET /api/auth/me` retorna `user_id`, `email` y `full_name` del usuario en sesión. | Alta | Implementado |
| RF-AUTH-12 | El sistema debe permitir actualizar la contraseña de un usuario autenticado, validando primero la contraseña actual. | Si la contraseña actual es incorrecta, se retorna error. El cambio exitoso registra el evento en la tabla `credential_audit`. | Media | Implementado |
| RF-AUTH-13 | El sistema debe registrar en auditoría todo cambio de credenciales mediante un trigger de base de datos. | Cada actualización de contraseña genera una fila en `credential_audit` con `user_id`, acción y timestamp. | Media | Implementado |

---

## 3. RF-PROF — Gestión de Perfiles

**Servicio responsable:** `identity-service` + `api-gateway`  
**Tecnología:** TypeScript, PostgreSQL

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-PROF-01 | El sistema debe permitir crear perfiles adicionales dentro de una cuenta de usuario. | `POST /api/profiles` crea el perfil y lo asocia al `user_id` del JWT. | Alta | Implementado |
| RF-PROF-02 | El sistema debe limitar a un máximo de 5 perfiles por cuenta de usuario. | Al intentar crear el sexto perfil, el sistema retorna error descriptivo sin crear el registro. Esta validación usa la función `fn_can_create_profile()`. | Alta | Implementado |
| RF-PROF-03 | Cada perfil debe tener un nombre y puede tener una URL de avatar opcional. | El campo `name` es obligatorio. El campo `avatar_url` es opcional. El registro se crea correctamente con ambos casos. | Alta | Implementado |
| RF-PROF-04 | El sistema debe permitir listar todos los perfiles asociados a la cuenta del usuario autenticado. | `GET /api/profiles` retorna arreglo con los perfiles del `user_id` en sesión. | Alta | Implementado |
| RF-PROF-05 | El sistema debe permitir seleccionar un perfil activo, generando un nuevo JWT que incluya el `profile_id`. | `POST /api/profiles/:profileId/select` valida que el perfil pertenece al usuario y emite un JWT actualizado con `profile_id`. | Alta | Implementado |
| RF-PROF-06 | El sistema debe verificar que el `profile_id` seleccionado pertenece al `user_id` en sesión antes de emitir el nuevo JWT. | Intentar seleccionar un perfil de otro usuario retorna error de autorización. | Alta | Implementado |
| RF-PROF-07 | El sistema debe permitir actualizar el nombre y/o avatar de un perfil existente. | `PUT /api/profiles/:profileId` actualiza los datos del perfil y retorna la entidad actualizada. | Media | Implementado |
| RF-PROF-08 | El sistema debe permitir eliminar un perfil de la cuenta. | `DELETE /api/profiles/:profileId` elimina el perfil y sus datos asociados. La operación es irreversible. | Media | Implementado |
| RF-PROF-09 | El sistema debe exponer una vista de base de datos `vw_user_profiles` que consolide la información de perfiles por usuario. | La vista está disponible en la base de datos del identity-service y retorna perfil con datos del usuario. | Baja | Implementado |

---

## 4. RF-SUB — Gestión de Planes y Suscripciones

**Servicio responsable:** `subscription-service` + `api-gateway`  
**Tecnología:** Python, PostgreSQL

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-SUB-01 | El sistema debe permitir consultar el listado de planes de suscripción disponibles. | `GET /api/plans` retorna los planes activos con `id`, `name` y `price_usd`. Planes iniciales: Básico ($5.00), Estándar ($8.00), Premium ($12.00). | Alta | Implementado |
| RF-SUB-02 | El sistema debe mostrar únicamente los planes marcados como activos (`is_active = true`). | Planes desactivados no aparecen en la respuesta al cliente. | Alta | Implementado |
| RF-SUB-03 | El sistema debe permitir crear una suscripción activa para un usuario autenticado. | `POST /api/subscriptions` asocia el `user_id` del JWT con el `plan_id` seleccionado. El estado inicial es `active`. | Alta | Implementado |
| RF-SUB-04 | El sistema debe garantizar que un usuario solo tenga una suscripción activa a la vez. | El índice único `ux_subscriptions_one_active_per_user` previene dos suscripciones activas simultáneas para el mismo usuario. | Alta | Implementado |
| RF-SUB-05 | El sistema debe permitir consultar las suscripciones de la cuenta autenticada. | `GET /api/subscriptions` retorna el historial de suscripciones del `user_id` en sesión. | Media | Implementado |
| RF-SUB-06 | El sistema debe permitir cambiar el plan de una suscripción activa. | `PUT /api/subscriptions/:subscriptionId` actualiza el `plan_id` y registra el cambio en auditoría. | Media | Implementado |
| RF-SUB-07 | El sistema debe permitir cancelar una suscripción activa. | `DELETE /api/subscriptions/:subscriptionId` cambia el estado a `cancelled`. No elimina el registro. | Media | Implementado |
| RF-SUB-08 | El sistema debe registrar en auditoría todo cambio de plan o estado de suscripción mediante un trigger de base de datos. | Cada modificación genera una fila en `subscription_audit` con los valores anteriores y nuevos. | Media | Implementado |
| RF-SUB-09 | El sistema debe publicar un evento en la cola Redis al crear o modificar una suscripción para disparar la notificación por correo. | Tras `CreateSubscription` o `UpdateSubscription`, se realiza `RPUSH` a `notification:queue` con `type`, `email` y datos del plan. | Media | Implementado |
| RF-SUB-10 | El sistema debe exponer una vista `vw_user_active_subscription` que muestre la suscripción activa de cada usuario. | La vista está disponible en la base de datos del subscription-service. | Baja | Implementado |
| RF-SUB-11 | El sistema debe contar con una función `fn_calculate_monthly_price()` para cálculos de precio en la base de datos. | La función está implementada y retorna el precio mensual dado un `plan_id`. | Baja | Implementado |

---

## 5. RF-FX — Servicio de Conversión de Divisas

**Servicio responsable:** `fx-service` + `api-gateway`  
**Tecnología:** Python, Redis, Frankfurter API

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-FX-01 | El sistema debe permitir consultar la tasa de cambio entre dos monedas identificadas por su código ISO-4217 de 3 letras. | `GET /api/rates/:base/:target` (ej. `/api/rates/USD/GTQ`) retorna la tasa de conversión con timestamp. | Alta | Implementado |
| RF-FX-02 | El sistema debe validar que los códigos de moneda sean alfanuméricos de exactamente 3 caracteres. | Códigos inválidos retornan error con mensaje descriptivo sin realizar llamada al proveedor externo. | Alta | Implementado |
| RF-FX-03 | El sistema debe consultar primero la caché Redis antes de llamar al proveedor externo de tasas de cambio. | Si la clave `fx:rate:BASE:TARGET` existe en Redis, se retorna sin llamada HTTP externa. La respuesta incluye `cached: true`. | Alta | Implementado |
| RF-FX-04 | El sistema debe almacenar el resultado en Redis con un TTL configurable (por defecto 3600 segundos). | La clave de caché expira automáticamente según `FX_CACHE_TTL`. Después del TTL, una nueva consulta al proveedor externo refresca la caché. | Alta | Implementado |
| RF-FX-05 | El sistema debe consumir la API externa Frankfurter (`api.frankfurter.dev/v2`) para obtener tasas en tiempo real cuando no hay caché. | Ante un cache miss, se realiza llamada HTTP a Frankfurter. La respuesta se almacena en Redis y se retorna al cliente. | Alta | Implementado |
| RF-FX-06 | La respuesta del servicio FX debe indicar si el dato proviene de caché o de fuente externa. | El campo `cached` en la respuesta es `true` si provino de Redis y `false` si fue una consulta fresca. | Media | Implementado |
| RF-FX-07 | El sistema debe requerir autenticación para consultar tasas de cambio. | Una petición sin JWT válido retorna 401 antes de ejecutar la lógica del FX service. | Alta | Implementado |

---

## 6. RF-NOT — Servicio de Notificaciones

**Servicio responsable:** `notification-service`  
**Tecnología:** Python, Redis (cola BLPOP), SMTP/Mailhog

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-NOT-01 | El sistema debe enviar un correo de confirmación al usuario tras un registro exitoso. | Al completar `RegisterUser`, se publica evento `registration` en Redis. El notification-service lo consume y envía correo al email registrado. | Media | Implementado |
| RF-NOT-02 | El sistema debe enviar un recibo de compra por correo al activar una nueva suscripción. | Al crear una suscripción, se publica evento `purchase_receipt` con nombre del plan y precio. El correo llega al email del usuario. | Media | Implementado |
| RF-NOT-03 | El sistema debe enviar un correo de notificación cuando el usuario actualiza su plan de suscripción. | Al ejecutar `UpdateSubscription`, se publica evento `subscription_update` en Redis con los datos del nuevo plan. | Media | Implementado |
| RF-NOT-04 | El notification-service debe procesar eventos de la cola Redis de forma asincrónica mediante un worker (`BLPOP`). | El worker permanece bloqueado esperando mensajes en `notification:queue`. Procesa cada evento sin bloquear la operación que lo originó. | Alta | Implementado |
| RF-NOT-05 | El sistema debe enviar correos con plantilla HTML con la identidad visual de Quetxal TV. | Los correos tienen fondo oscuro (`#0b0b0f`), acento rojo (`#e50914`) y logotipo de la plataforma. | Baja | Implementado |
| RF-NOT-06 | El sistema debe soportar un modo fallback a consola cuando SMTP no esté configurado. | Si `SMTP_HOST` no está disponible, el notification-service registra la notificación en logs sin lanzar excepción. | Media | Implementado |
| RF-NOT-07 | El sistema debe soportar el envío de alertas de nuevas publicaciones de contenido. | El tipo `content-publication` está soportado por el notification-service. | Baja | Pendiente |

---

## 7. RF-GW — API Gateway e Integración

**Servicio responsable:** `api-gateway`  
**Tecnología:** TypeScript, Express.js, gRPC clients

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-GW-01 | El API Gateway debe ser el único punto de entrada HTTP para el cliente web. | El frontend nunca realiza llamadas directas a microservicios internos. Toda petición pasa por el puerto 3000 del gateway. | Alta | Implementado |
| RF-GW-02 | El API Gateway debe traducir peticiones HTTP externas en llamadas gRPC internas hacia los microservicios. | Cada ruta HTTP del gateway tiene un cliente gRPC asociado que invoca el método correspondiente del microservicio. | Alta | Implementado |
| RF-GW-03 | El API Gateway debe validar el JWT en cookie antes de procesar rutas protegidas. | El middleware de autenticación verifica la firma del token y rechaza peticiones inválidas con HTTP 401. | Alta | Implementado |
| RF-GW-04 | El API Gateway debe propagar el `user_id` y `email` extraídos del JWT a los microservicios internos. | Los clientes gRPC incluyen el `user_id` y `email` en los mensajes cuando los servicios los requieren. | Alta | Implementado |
| RF-GW-05 | El API Gateway debe centralizar el manejo de errores retornando códigos HTTP apropiados. | Errores de gRPC se mapean a códigos HTTP correspondientes (400, 401, 404, 409, 500). | Media | Implementado |
| RF-GW-06 | El API Gateway debe exponer los siguientes grupos de rutas: `/api/auth`, `/api/profiles`, `/api/subscriptions`, `/api/plans`, `/api/rates`. | Cada grupo de rutas delega en el microservicio correspondiente mediante gRPC. | Alta | Implementado |
| RF-GW-07 | El API Gateway debe soportar la integración de nuevos clientes gRPC al añadir nuevos microservicios. | La estructura del gateway permite agregar nuevos clientes gRPC sin modificar la lógica existente. | Alta | Implementado |

---

## 8. RF-CAT — Catálogo de Contenido

**Servicio responsable:** `catalog-service` *(pendiente de implementación)*  
**Tecnología proyectada:** Go, gRPC  
**Contrato definido en:** `proto/catalog.proto`

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-CAT-01 | El sistema debe permitir consultar el catálogo de contenido multimedia disponible en la plataforma. | El endpoint retorna listado de contenidos con `content_id`, `title`, `category` y `url`. | Alta | Pendiente |
| RF-CAT-02 | El sistema debe permitir buscar contenido por título. | Una búsqueda parcial retorna todos los contenidos cuyo título contenga el término buscado. | Alta | Pendiente |
| RF-CAT-03 | El sistema debe permitir filtrar contenido por categoría o género. | El filtro reduce el resultado a los contenidos de la categoría especificada. | Alta | Pendiente |
| RF-CAT-04 | El sistema debe permitir consultar el detalle de un contenido específico. | El endpoint de detalle retorna información extendida: ficha técnica, actores y episodios si aplica. | Alta | Pendiente |
| RF-CAT-05 | El sistema debe diferenciar entre películas, series, temporadas y episodios. | El modelo de datos permite estructuras jerárquicas: serie → temporada → episodio. | Media | Pendiente |
| RF-CAT-06 | El sistema debe soportar la publicación de nuevas piezas de contenido con metadatos estructurados. | El mensaje `ContentPublication` del contrato `catalog.proto` define `content_id`, `title`, `category`, `url`, `published_at` y `metadata`. | Media | Pendiente |

---

## 9. RF-RATE — Sistema de Calificaciones

**Servicio responsable:** `engagement-service` *(pendiente de implementación)*  
**Tecnología proyectada:** Go o Python, gRPC  
**Contrato definido en:** `proto/engagement.proto`

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-RATE-01 | El sistema debe permitir calificar contenido con recomendación positiva (thumbs up) o negativa (thumbs down) por perfil. | Cada calificación queda asociada a un `profile_id` y un `content_id`. | Alta | Pendiente |
| RF-RATE-02 | El sistema debe calcular dinámicamente el porcentaje de recomendación de cada contenido. | El porcentaje se calcula como `(votos positivos / total de votos) × 100`. Se recalcula en tiempo real. | Alta | Pendiente |
| RF-RATE-03 | El sistema debe retornar el porcentaje de recomendación y el total de votos al consultar un contenido. | El endpoint `GetContentRatingSummary` retorna `like_count`, `dislike_count` y `recommendation_percentage`. | Media | Pendiente |
| RF-RATE-04 | El sistema debe permitir actualizar una calificación previamente registrada por el mismo perfil. | Si el perfil ya calificó el contenido, una nueva calificación sobreescribe la anterior sin crear duplicados. | Baja | Pendiente |

---

## 10. RF-HIST — Historial de Reproducción

**Servicio responsable:** `engagement-service` *(pendiente de implementación)*  
**Tecnología proyectada:** Go o Python, gRPC  
**Contrato definido en:** `proto/engagement.proto`

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-HIST-01 | El sistema debe registrar el progreso de reproducción de un contenido por perfil, indicando el minuto exacto. | `SaveProgress` almacena `profile_id`, `content_id`, `episode_id` (si aplica) y `progress_seconds`. | Alta | Pendiente |
| RF-HIST-02 | Para series, el sistema debe almacenar la temporada, el episodio y el minuto exacto de reproducción. | El modelo de datos incluye `season_number`, `episode_number` y `progress_seconds` para contenido episódico. | Alta | Pendiente |
| RF-HIST-03 | El sistema debe permitir reanudar la reproducción desde el último punto registrado. | `ResumeContent` retorna el `content_id`, `episode_id` y `progress_seconds` del último avance del perfil. | Alta | Pendiente |
| RF-HIST-04 | El sistema debe permitir consultar el historial reciente de reproducción de un perfil. | `GetRecentHistory` retorna los últimos contenidos vistos por el `profile_id` ordenados por fecha descendente. | Media | Pendiente |
| RF-HIST-05 | El sistema debe mostrar una sección de "continuar viendo" con los contenidos reproducidos parcialmente. | El sistema identifica contenidos con progreso > 0 y < 100% para presentarlos como pendientes. | Media | Pendiente |

---

## 11. RF-DB — Objetos Programables de Base de Datos

**Servicios:** `identity-service`, `subscription-service`

| Código | Requerimiento Funcional | Servicio | Objeto | Estado |
|--------|------------------------|----------|--------|--------|
| RF-DB-01 | El sistema debe registrar usuarios a través del procedimiento almacenado `sp_register_user()`. | identity-service | Stored Procedure | Implementado |
| RF-DB-02 | El sistema debe crear perfiles mediante el procedimiento almacenado `sp_create_profile()`. | identity-service | Stored Procedure | Implementado |
| RF-DB-03 | El sistema debe validar el límite de perfiles por usuario mediante la función `fn_can_create_profile()`. | identity-service | Function | Implementado |
| RF-DB-04 | El sistema debe consultar perfiles consolidados mediante la vista `vw_user_profiles`. | identity-service | View | Implementado |
| RF-DB-05 | El sistema debe registrar cambios de contraseña automáticamente mediante el trigger `trg_audit_credential_update`. | identity-service | Trigger | Implementado |
| RF-DB-06 | El sistema debe calcular precios mensualmente mediante la función `fn_calculate_monthly_price()`. | subscription-service | Function | Implementado |
| RF-DB-07 | El sistema debe registrar cambios de suscripción mediante la función `fn_audit_subscription_change()`. | subscription-service | Function | Implementado |
| RF-DB-08 | El sistema debe exponer la suscripción activa de cada usuario mediante la vista `vw_user_active_subscription`. | subscription-service | View | Implementado |
| RF-DB-09 | El sistema debe auditar cambios en suscripciones automáticamente mediante el trigger `trg_audit_subscription_change`. | subscription-service | Trigger | Implementado |

---

## 12. RF-ADMIN — Panel de Administración y Catálogo Dinámico

**Servicio responsable:** `catalog-service` + `api-gateway` + `apps/web`  
**Tecnología:** Go, TypeScript (React), gRPC  
**Fase:** 2

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-ADMIN-01 | El sistema debe restringir el acceso al panel de administración únicamente a usuarios con rol de administrador. | El panel `/admin` requiere sesión activa con rol admin. Un usuario sin ese rol es redirigido o recibe HTTP 403. | Alta | Implementado |
| RF-ADMIN-02 | El sistema debe permitir al administrador agregar nuevo contenido multimedia (películas y series) con sus metadatos. | El formulario de creación persiste el contenido en la base de datos del catalog-service. El contenido aparece en el catálogo tras la creación. | Alta | Implementado |
| RF-ADMIN-03 | El sistema debe permitir al administrador editar los metadatos de contenido existente. | Los campos editables incluyen título, descripción, categoría, reparto y fecha de estreno. Los cambios se reflejan de inmediato en el catálogo. | Alta | Implementado |
| RF-ADMIN-04 | El sistema debe permitir al administrador eliminar títulos del catálogo (películas y series). | La eliminación es permanente. El contenido eliminado deja de aparecer en el catálogo para todos los usuarios. | Alta | Implementado |
| RF-ADMIN-05 | El sistema debe permitir al administrador gestionar episodios de series, incluyendo su creación y edición. | El panel incluye un módulo específico para agregar y editar episodios asociados a una serie existente. | Alta | Implementado |
| RF-ADMIN-06 | El sistema debe permitir al administrador programar y calendarizar estrenos definiendo la fecha exacta de visibilidad. | El campo `releaseDate` controla cuándo el contenido se vuelve visible en la cartelera de los usuarios. Contenido con fecha futura no aparece en el catálogo público. | Alta | Implementado |

---

## 13. RF-GCS — Integración con Google Cloud Storage

**Servicio responsable:** `catalog-service`  
**Tecnología:** Go, Google Cloud Storage SDK, URLs firmadas  
**Fase:** 2

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-GCS-01 | El sistema debe almacenar todos los archivos de video de películas y episodios en Google Cloud Storage. | Los videos no se guardan en el sistema de archivos local. El path almacenado en BD es una referencia a un objeto en GCS. | Alta | Implementado |
| RF-GCS-02 | El sistema debe almacenar las imágenes de portada de películas y series en Google Cloud Storage. | Las portadas se almacenan en `gs://{bucket}/covers/{content_id}/`. El path local queda prohibido. | Alta | Implementado |
| RF-GCS-03 | El sistema debe generar URLs firmadas para la subida de archivos, con tiempo de expiración configurable. | `GenerateUploadURL()` produce una URL firmada PUT con expiración según `GCS_SIGNED_UPLOAD_EXPIRES_MINUTES`. El upload directo del cliente al bucket funciona correctamente. | Alta | Implementado |
| RF-GCS-04 | El sistema debe generar URLs firmadas para la lectura y reproducción de contenido multimedia. | El reproductor del frontend consume el video directamente desde la URL firmada de GCS. La URL expira según `GCS_SIGNED_READ_EXPIRES_MINUTES`. | Alta | Implementado |
| RF-GCS-05 | El sistema debe validar el tipo de archivo antes de generar la URL de subida. | Solo se permiten imágenes (jpeg, png, webp) y videos (mp4, webm). Tipos no permitidos retornan error descriptivo sin generar URL. | Alta | Implementado |
| RF-GCS-06 | El sistema debe validar el tamaño máximo permitido por tipo de archivo. | Imágenes: máximo 10 MB. Videos: máximo 1024 MB. Archivos que excedan el límite retornan error de validación. | Media | Implementado |
| RF-GCS-07 | El reproductor del frontend debe mostrar el tiempo de duración real del archivo de video almacenado en GCS. | Al cargar el reproductor, se calcula y muestra la duración del video obtenida desde los metadatos del archivo en GCS. | Media | Pendiente |

---

## 14. RF-AUDIT — Auditoría Transaccional por Triggers

**Servicios responsables:** `catalog-service`, `identity-service`, `subscription-service`, `engagement-service`  
**Tecnología:** PostgreSQL Triggers  
**Fase:** 2

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-AUDIT-01 | El sistema debe registrar automáticamente toda inserción (INSERT) realizada por un usuario o administrador en las tablas relacionales críticas. | Al ejecutar un INSERT en una tabla auditada, el trigger genera una fila en la tabla de auditoría con: tabla afectada, operación, timestamp exacto y estado nuevo. | Alta | Pendiente |
| RF-AUDIT-02 | El sistema debe registrar automáticamente toda actualización (UPDATE) realizada en las tablas relacionales críticas. | Al ejecutar un UPDATE en una tabla auditada, el trigger genera una fila en la tabla de auditoría con: tabla afectada, operación, timestamp exacto, estado anterior y estado nuevo. | Alta | Pendiente |
| RF-AUDIT-03 | El registro de auditoría debe identificar al usuario responsable de la operación. | La tabla de auditoría incluye un campo `responsible_user` con el identificador del usuario o administrador que ejecutó la operación. | Alta | Pendiente |
| RF-AUDIT-04 | El sistema debe implementar auditoría transaccional en el catalog-service para las tablas de contenido. | Existe trigger `trg_audit_content_changes` en la tabla `contents` del catalog-service que registra INSERT y UPDATE en una tabla exclusiva `content_audit`. | Alta | Pendiente |
| RF-AUDIT-05 | El sistema debe implementar auditoría transaccional en el identity-service para cambios de credenciales. | El trigger `trg_audit_credential_update` registra cambios en `credential_audit` con `user_id`, acción y timestamp. | Media | Implementado |
| RF-AUDIT-06 | El sistema debe implementar auditoría transaccional en el subscription-service para cambios de plan y estado. | El trigger `trg_audit_subscription_change` registra en `subscription_audit` los valores anteriores y nuevos de `plan_id` y `status`. | Media | Implementado |
| RF-AUDIT-07 | El sistema debe implementar auditoría transaccional en el engagement-service para calificaciones. | El trigger `trg_audit_rating_changes` registra en `rating_audit` el valor anterior y nuevo de cada calificación modificada. | Media | Implementado |

---

## 15. RF-REPORT — Generación de Reportes Estructurados

**Servicio responsable:** `catalog-service` + `api-gateway` + `apps/web`  
**Tecnología:** Go, TypeScript (React), CSV, PDF  
**Fase:** 2

| Código | Requerimiento Funcional | Criterio de Aceptación | Prioridad | Estado |
|--------|------------------------|----------------------|-----------|--------|
| RF-REPORT-01 | El panel de administración debe mostrar el log transaccional completo de las tablas de auditoría. | La vista de auditoría lista los registros con: tabla afectada, operación, usuario responsable, timestamp, estado anterior y estado nuevo. Los registros están ordenados por fecha descendente. | Alta | Pendiente |
| RF-REPORT-02 | El sistema debe permitir al administrador descargar el log de auditoría en formato CSV. | El botón de descarga genera un archivo `.csv` bien ordenado con encabezados y todos los campos del log de auditoría visible. | Alta | Pendiente |
| RF-REPORT-03 | El sistema debe permitir al administrador descargar el log de auditoría en formato PDF. | El botón de descarga genera un archivo `.pdf` formateado con encabezados, tabla de datos y metadatos del reporte (fecha de generación, filtros aplicados). | Alta | Pendiente |
| RF-REPORT-04 | El sistema debe permitir filtrar el log de auditoría por tabla afectada, tipo de operación y rango de fechas. | Los filtros reducen los registros mostrados y aplicados se reflejan también en la descarga CSV y PDF. | Media | Pendiente |

---

## 16. Trazabilidad de Requerimientos

| Módulo | Códigos RF | Servicio Responsable | Fase |
|--------|-----------|----------------------|------|
| Autenticación y sesión | RF-AUTH-01 al RF-AUTH-13 | identity-service, api-gateway | 1 |
| Gestión de perfiles | RF-PROF-01 al RF-PROF-09 | identity-service, api-gateway | 1 |
| Planes y suscripciones | RF-SUB-01 al RF-SUB-11 | subscription-service, api-gateway | 1 |
| Conversión de divisas | RF-FX-01 al RF-FX-07 | fx-service, api-gateway | 1 |
| Notificaciones | RF-NOT-01 al RF-NOT-07 | notification-service | 1 |
| API Gateway | RF-GW-01 al RF-GW-07 | api-gateway | 1 |
| Catálogo | RF-CAT-01 al RF-CAT-06 | catalog-service | 1 |
| Calificaciones | RF-RATE-01 al RF-RATE-04 | engagement-service | 1 |
| Historial | RF-HIST-01 al RF-HIST-05 | engagement-service | 1 |
| Objetos de BD | RF-DB-01 al RF-DB-09 | identity-service, subscription-service | 1 |
| Panel de Administración | RF-ADMIN-01 al RF-ADMIN-06 | catalog-service, api-gateway, web | 2 |
| Google Cloud Storage | RF-GCS-01 al RF-GCS-07 | catalog-service | 2 |
| Auditoría Transaccional | RF-AUDIT-01 al RF-AUDIT-07 | catalog-service, identity-service, subscription-service, engagement-service | 2 |
| Reportes estructurados | RF-REPORT-01 al RF-REPORT-04 | catalog-service, api-gateway, web | 2 |

---

## 17. Resumen de Estado de Implementación

| Módulo | Fase | Total RF | Implementados | Pendientes |
|--------|------|----------|---------------|------------|
| Autenticación | 1 | 13 | 13 | 0 |
| Perfiles | 1 | 9 | 9 | 0 |
| Suscripciones | 1 | 11 | 11 | 0 |
| FX / Divisas | 1 | 7 | 7 | 0 |
| Notificaciones | 1 | 7 | 6 | 1 |
| API Gateway | 1 | 7 | 7 | 0 |
| Catálogo | 1 | 6 | 0 | 6 |
| Calificaciones | 1 | 4 | 0 | 4 |
| Historial | 1 | 5 | 0 | 5 |
| Objetos de BD | 1 | 9 | 9 | 0 |
| Panel de Administración | 2 | 6 | 6 | 0 |
| Google Cloud Storage | 2 | 7 | 6 | 1 |
| Auditoría Transaccional | 2 | 7 | 3 | 4 |
| Reportes estructurados | 2 | 4 | 0 | 4 |
| **Total Fase 1** | **1** | **78** | **62** | **16** |
| **Total Fase 2** | **2** | **24** | **15** | **9** |
| **Total General** | | **102** | **77** | **25** |

---