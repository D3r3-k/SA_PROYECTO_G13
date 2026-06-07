# Infra - Docker Compose

El entorno local levanta la topología completa de Quetxal TV con un único punto de entrada externo: el API Gateway.

## Servicios expuestos al host

- API Gateway: `http://localhost:3000`
- Web frontend: `http://localhost:8080`

Redis, PostgreSQL y los microservicios gRPC quedan disponibles solo dentro de la red Docker `sa_net` mediante `expose`.

## Levantar local

```bash
docker compose -f infra/docker-compose.local.yml up --build -d
```

## Verificar estado

```bash
docker compose -f infra/docker-compose.local.yml ps
curl -i http://localhost:3000/api/health
```

## Flujo interno

```text
Cliente Web -> HTTP/cookies -> API Gateway -> gRPC -> identity-service
Cliente Web -> HTTP/cookies -> API Gateway -> gRPC -> subscription-service
Cliente Web -> HTTP/cookies -> API Gateway -> gRPC -> fx-service

identity-service/subscription-service -> Redis notification:queue
notification-service -> Redis BLPOP -> SMTP/Mailhog
```

Para nube, configurar variables de producción en el ambiente o en un `.env.cloud` no versionado y usar `infra/docker-compose.cloud.yml`.
