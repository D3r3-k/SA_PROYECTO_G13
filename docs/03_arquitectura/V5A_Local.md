## V5a — Vista de Despliegue Local

![Vista de componentes](<../00_assets/diagrams/03_arquitectura/desplieguelocal.png>)
Este diagrama representa la topologia de contenedores del entorno de desarrollo local, orquestado mediante `docker-compose.local.yml`. Todos los contenedores se comunican dentro de la red Docker interna `sa_net` de tipo bridge. Solo el API Gateway y la Web App exponen puertos al host para que el navegador del desarrollador pueda acceder al sistema. El resto de microservicios, bases de datos y Redis utilizan `expose` en lugar de `ports`, lo que significa que son accesibles unicamente dentro de la red interna y no desde el exterior.

| Contenedor | Imagen / Build | Acceso externo | Volumen |
| :--------- | :------------- | :------------- | :------ |
| sa_web | apps/web/Dockerfile | WEB_PORT:80 | — |
| api-gateway | apps/api-gateway/Dockerfile | API_GATEWAY_PORT:3000 | — |
| identity-service | services/identity-service/Dockerfile | expose 50051 | — |
| catalog-service | services/catalog-service/Dockerfile | expose 50055 | — |
| subscription-service | services/subscription-service/Dockerfile | expose 50053 | — |
| fx-service | services/fx-service/Dockerfile | expose 50052 | — |
| engagement-service | services/engagement-service/Dockerfile | expose 50056 | — |
| notification-service | services/notification-service/Dockerfile | expose 50054 | — |
| sa_redis | redis:7 | expose 6379 | redis_data |
| identity-db | postgres:16-alpine | expose 5432 | identity_db_data |
| subscription-db | postgres:15 | expose 5432 | subscription_pgdata |
| engagement-db | postgres | expose 5432 | engagement_data |
| catalog-db | postgres | expose 5432 | catalog_data |

Las migraciones del identity-service se ejecutan automaticamente al iniciar su base de datos mediante el mecanismo `docker-entrypoint-initdb.d`. Redis cumple dos roles: cache de tipos de cambio con TTL para el FX-Service, y cola de notificaciones donde identity-service y subscription-service publican eventos con RPUSH y notification-service los consume con BLPOP.

---

## V5b — Vista de Despliegue Cloud GCP

![Vista de componentes](<../00_assets/diagrams/03_arquitectura/desplieguecloud.png>)

Este diagrama representa la topologia de contenedores del entorno de produccion, orquestado mediante `docker-compose.cloud.yml` sobre una VM de Google Cloud Platform Compute Engine. Es el unico entorno que se califica segun el enunciado del proyecto. La arquitectura de red es identica al entorno local — todos los contenedores comparten la red interna `sa_net` — pero con diferencias importantes en la configuracion de produccion.

| Diferencia | Local | Cloud GCP |
| :--------- | :---- | :-------- |
| Politica de reinicio | No configurada | restart: unless-stopped en todos |
| NODE_ENV | Variable .env | production hardcodeado |
| COOKIE_SECURE | Variable .env | true hardcodeado |
| URLs internas | Variables .env | Nombre de contenedor hardcodeado |
| Redis persistencia | Sin appendonly | appendonly: yes |
| Variables sensibles | .env local | .env creado manualmente en la VM |
| Acceso externo | localhost del desarrollador | IP publica de la VM via GCP Firewall Rules |

Solo el API Gateway (puerto 3000) y la Web App (puerto 80) tienen puertos mapeados al exterior y son accesibles desde internet a traves de las reglas de firewall de GCP. El resto de contenedores usa `expose` y solo son alcanzables dentro de la red Docker interna `sa_net`, garantizando que ningun microservicio de negocio quede expuesto directamente al exterior. Las variables sensibles como JWT_SECRET, contrasenas de base de datos, credenciales SMTP y la URL de la API FX se configuran en un archivo `.env` creado manualmente en la VM y nunca se versionan en el repositorio.
