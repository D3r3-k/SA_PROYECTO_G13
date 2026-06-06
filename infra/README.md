# Infra - Docker Compose

Instrucciones rápidas para levantar el entorno local (stubs y cache):

1. Copiar un `.env` a partir de `.env.example` y ajustar variables si es necesario.

2. Levantar los servicios en modo desarrollo:

```bash
docker compose -f infra/docker-compose.local.yml up --build
```

3. Comprobar endpoints de health:
- FX Service: http://localhost:8001/health
- Subscription Service: http://localhost:8002/health
- Notification Service: http://localhost:8003/health

Para despliegue en nube, preparar un `.env.cloud` con valores de producción y usar `docker-compose.cloud.yml`.
