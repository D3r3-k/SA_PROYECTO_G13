[← Regresar](../README.md)

# Arquitectura actualizada

## Punto de entrada único

El cliente web solo se comunica con el API Gateway. Ningún microservicio backend expone puertos al host para consumo externo.

```text
Cliente Web
  -> HTTP / cookies
API Gateway
  -> gRPC
identity-service
subscription-service
fx-service
```

## Notificaciones desacopladas

Las notificaciones no se invocan por gRPC desde los microservicios principales. Identity y Subscription publican eventos en Redis y Notification Service los consume.

```text
identity-service
  -> Redis RPUSH notification:queue

subscription-service
  -> Redis RPUSH notification:queue

notification-service
  -> Redis BLPOP notification:queue
  -> SMTP / Mailhog
```

## Redis

Redis cumple dos responsabilidades:

1. Caché de FX-Service con TTL para tasas de cambio.
2. Broker/cola simple para eventos de notificación.

## Contratos gRPC conservados

Se mantiene gRPC y Protocol Buffers en la comunicación interna principal:

- `api-gateway -> identity-service`
- `api-gateway -> subscription-service`
- `api-gateway -> fx-service`

`notification-service` conserva su contrato gRPC para pruebas internas o administración, pero el flujo productivo de notificaciones usa Redis.
