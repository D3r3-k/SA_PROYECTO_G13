[Regresar](../../README.md)

# Principio de Inversión de Dependencias (DIP)

Los módulos de alto nivel no deben depender de módulos de bajo nivel. Ambos deben depender de abstracciones. Las abstracciones no deben depender de los detalles.

---

## 1. ¿Dónde se aplicó?

**Ubicación en el proyecto:**
- [grpc/catalog.client.ts](../../apps/api-gateway/src/grpc/catalog.client.ts)
- [grpc/payment.client.ts](../../apps/api-gateway/src/grpc/payment.client.ts)
- [grpc/subscription.client.ts](../../apps/api-gateway/src/grpc/subscription.client.ts)
- [cache.py](../../services/fx-service/src/cache.py)
- [grpc_server.py](../../services/fx-service/src/grpc_server.py)

**Abstracciones involucradas:**
- Clientes gRPC generados desde `.proto` (API Gateway)
- Clase `RedisCache` inyectada en el FX Service

---

## 2. ¿Cómo se aplicó?

**En el API Gateway**, las rutas de alto nivel no instancian ni conocen la implementación interna de los microservicios. Dependen de las abstracciones generadas por `@grpc/proto-loader` desde los archivos `.proto`. Los clientes gRPC actúan como contratos de comunicación:

```typescript
// payment.client.ts — abstraccion generada desde payment.proto
export const paymentClient = new protoDescriptor.payment.PaymentGatewayService(
  env.paymentGrpcUrl,
  grpc.credentials.createInsecure()
);

export function callPaymentMethod<TRequest, TResponse>(
  methodName: string,
  payload: TRequest
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    paymentClient[methodName](payload, (error, response) => {
      if (error) return reject(error);
      return resolve(response);
    });
  });
}
```

Las rutas de alto nivel solo invocan `callPaymentMethod` sin saber si el Payment Gateway está en Python, Go o cualquier otro lenguaje:

```typescript
// subscriptions.routes.ts — modulo de alto nivel
const payment = await callPaymentMethod<AuthorizePaymentRequest, PaymentResponse>(
  "AuthorizePayment",
  { ...paymentPayload, user_id: userId, email, plan_id: planId, amount, currency }
);
```

**En el FX Service**, el servidor gRPC de alto nivel recibe la instancia de `RedisCache` como dependencia externa en lugar de crearla internamente. Esto invierte el control de la creación:

```python
# cache.py — abstraccion de cache
class RedisCache:
    def __init__(self, redis_url: str):
        self._client = redis.from_url(redis_url, decode_responses=True)

    async def get_json(self, key: str) -> dict | None: ...
    async def set_json(self, key: str, value: dict, ttl_seconds: int) -> None: ...
    async def ping(self) -> bool: ...
```

```python
# grpc_server.py — modulo de alto nivel que depende de la abstraccion
async def serve() -> None:
    cache = RedisCache(redis_url=config.redis_url)   # inyeccion
    server = FxServiceServicer(cache=cache, ...)     # modulo alto nivel recibe abstraccion
```

---

## 3. ¿Por qué se aplicó? (Justificación Técnica)

En el API Gateway, si se necesita reemplazar el Payment Gateway de Python por una implementación en Go o un proveedor externo real, solo se actualiza el archivo `.proto` y se regeneran los clientes. Las rutas de alto nivel no requieren ningún cambio. El Gateway depende del contrato (`.proto`), no de la implementación. En el FX Service, si se necesita reemplazar Redis por Memcached u otro sistema de cache, solo se crea una nueva clase que implemente los métodos `get_json`, `set_json` y `ping`, y se inyecta en lugar de `RedisCache` sin modificar el servidor gRPC. Esto garantiza que los módulos de alto nivel permanezcan estables ante cambios en la infraestructura.

---
