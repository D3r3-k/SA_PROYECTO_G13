[Regresar](../../README.md)

# Principio de Segregación de Interfaces (ISP)

Los clientes no deben verse obligados a depender de interfaces que no utilizan. Es mejor tener varias interfaces específicas que una sola interfaz de propósito general.

---

## 1. ¿Dónde se aplicó?

**Ubicación en el proyecto:**
- [auth.middleware.ts](../../apps/api-gateway/src/middleware/auth.middleware.ts)
- [subscriptions.routes.ts](../../apps/api-gateway/src/routes/subscriptions.routes.ts)

**Interfaces involucradas:**
- `AuthenticatedRequest` — extiende `Request` con solo los campos de sesión necesarios
- Separación de contratos `.proto` por dominio: `identity.proto`, `catalog.proto`, `subscription.proto`, `fx.proto`, `engagement.proto`, `payment.proto`, `notification.proto`

---

## 2. ¿Cómo se aplicó?

En el API Gateway, en lugar de que los handlers de rutas dependan del objeto `Request` genérico de Express (que expone decenas de propiedades innecesarias), se definió la interfaz segregada `AuthenticatedRequest` que extiende `Request` únicamente con los campos de sesión relevantes:

```typescript
export interface AuthenticatedRequest extends Request {
  user?: {
    user_id: string;
    email: string;
    profile_id?: string;
  };
}
```

Los handlers de rutas protegidas solo ven los datos de sesión que necesitan, sin acceso a propiedades del request que no les corresponden:

```typescript
async (req: AuthenticatedRequest, res) => {
  const { userId, email } = getAuthenticatedUser(req);
  // req.user solo expone user_id, email y profile_id
  // no tiene acceso a headers, cookies raw, ni propiedades internas de Express
}
```

A nivel de contratos gRPC, cada servicio tiene su propio archivo `.proto` con solo los métodos y mensajes que le pertenecen. El `payment.proto` define únicamente `AuthorizePayment` y `Health`, sin mezclar operaciones de otros dominios:

```protobuf
// payment.proto — solo lo que necesita el Payment Gateway
service PaymentGatewayService {
  rpc Health (PaymentHealthRequest) returns (PaymentHealthResponse);
  rpc AuthorizePayment (AuthorizePaymentRequest) returns (AuthorizePaymentResponse);
}
```

El `subscription.proto` define sus propios métodos sin depender del contrato de pagos:

```protobuf
// subscription.proto — independiente de payment.proto
service SubscriptionService {
  rpc ListPlans (ListPlansRequest) returns (ListPlansResponse);
  rpc CreateSubscription (CreateSubscriptionRequest) returns (SubscriptionResponse);
  rpc UpdatePlan (UpdatePlanRequest) returns (UpdatePlanResponse);
  ...
}
```

---

## 3. ¿Por qué se aplicó? (Justificación Técnica)

La segregación de `AuthenticatedRequest` evita que los handlers de rutas accedan accidentalmente a propiedades del request que no deberían modificar, garantizando tipado seguro en TypeScript y reduciendo el riesgo de errores en tiempo de ejecución. La separación de contratos `.proto` por dominio evita que un cambio en el contrato de pagos obligue a regenerar los clientes gRPC de subscripción o de catálogo. Cada servicio depende únicamente de la interfaz que consume, siguiendo el principio de mínimo conocimiento.

---
