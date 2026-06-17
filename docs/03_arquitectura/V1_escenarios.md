## Vista de Escenarios (V1)

La vista de escenarios es el eje central del modelo 4+1. Define el caso de uso arquitectónicamente más significativo del sistema y muestra cómo cada una de las otras cuatro vistas lo resuelve. Para Quetxal TV, el escenario crítico es el flujo completo de autenticación y consumo de contenido con propagación de identidad entre microservicios.


![Vista de escenario](<../00_assets/diagrams/03_arquitectura/v1escenario.png>)

---

### Escenario crítico: Login con JWT y consumo de contenido

Un usuario registrado inicia sesión en Quetxal TV, selecciona un perfil, busca una película, la califica y el sistema registra su progreso. Durante todo el flujo el API Gateway propaga la identidad del perfil vía JWT a cada microservicio interno mediante gRPC.

---

### Flujo del escenario

| Paso | Actor | Acción | Servicio involucrado |
| :--- | :---- | :----- | :------------------- |
| 1 | Usuario | Envía credenciales (email + password) | API Gateway → Identity Service |
| 2 | Sistema | Valida credenciales, genera JWT con user_id y email, establece cookie segura | Identity Service → DB Identity |
| 3 | Usuario | Selecciona un perfil activo | API Gateway → Identity Service |
| 4 | Sistema | Genera nuevo JWT con profile_id incluido, actualiza cookie | Identity Service → DB Identity |
| 5 | Usuario | Accede al catálogo y busca contenido | API Gateway (valida JWT) → Catalog Service |
| 6 | Sistema | Consulta vw_cartelera, ejecuta fn_search_content, retorna resultados | Catalog Service → DB Catalog |
| 7 | Usuario | Solicita ver planes con precio en moneda local | API Gateway → Subscription Service → FX Service |
| 8 | Sistema | Consulta tasa en Redis (cache hit/miss), convierte precio | FX Service → Redis → API Frankfurter |
| 9 | Usuario | Califica el contenido (THUMBS_UP) | API Gateway → Engagement Service |
| 10 | Sistema | Inserta calificación, ejecuta trigger audit, recalcula porcentaje | Engagement Service → DB Engagement |
| 11 | Usuario | Reproduce contenido, el sistema guarda progreso | API Gateway → Engagement Service |
| 12 | Sistema | Ejecuta save_watch_progress con season, episode y minute | Engagement Service → DB Engagement |

---

### Cómo cada vista resuelve el escenario

| Vista | Nombre | Cómo resuelve el escenario crítico |
| :---- | :----- | :--------------------------------- |
| V2 | Lógica | Define los paquetes y módulos internos de cada microservicio. Muestra cómo Identity encapsula la lógica JWT, cómo Catalog expone búsqueda y filtros, y cómo Engagement maneja calificaciones e historial de forma aislada por perfil. |
| V3 | Procesos | Modela los flujos de comunicación en tiempo de ejecución. Muestra el canal gRPC síncrono entre Gateway e Identity/Subscription/FX, y el canal asíncrono Redis queue entre Identity/Subscription y Notification Service. |
| V4 | Componentes | Describe la estructura del repositorio y los módulos de código. Muestra la carpeta /proto compartida, el lenguaje de cada servicio (TypeScript, Go, Python) y cómo los contratos Protocol Buffers conectan los servicios. |
| V5 | Despliegue | Mapea los servicios a contenedores Docker en dos entornos. Muestra la red interna sa_net, los volúmenes de base de datos, Redis compartido y la exposición pública del Gateway y la Web App en GCP. |

---

### Restricciones arquitectónicas derivadas del escenario

| Restricción | Justificación |
| :---------- | :------------ |
| El cliente externo solo habla con el API Gateway | Garantiza control centralizado de autenticación y enrutamiento |
| JWT debe propagarse en cada llamada gRPC interna | Permite que cada microservicio valide la identidad del perfil sin acoplarse a Identity Service en cada request |
| Redis cumple dos roles separados | Cache TTL para FX evita llamadas repetitivas a Frankfurter; queue de notificaciones desacopla el envío de emails del flujo principal |
| Cada microservicio tiene su propia base de datos | Evita acoplamiento de esquemas y permite escalar cada dominio de forma independiente |
| Los objetos programables de BD centralizan lógica transaccional | Stored procedures, vistas, funciones y triggers garantizan consistencia sin duplicar lógica en el código de aplicación |