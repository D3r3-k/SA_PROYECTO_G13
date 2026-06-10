[Regresar](../../README.md)

# Principio de Sustitución de Liskov (LSP)

Las clases derivadas deben poder sustituir a sus clases base sin alterar el comportamiento correcto del programa.

---

## 1. ¿Dónde se aplicó?

**Ubicación en el proyecto:**
- [schemas.py](../../services/subscription-service/src/schemas.py)

**Clases involucradas:**
- `SubscriptionCreate` (clase base Pydantic)
- `SubscriptionUpdate` (clase derivada)
- `SubscriptionResponse` (clase base de respuesta)

---

## 2. ¿Cómo se aplicó?

En el Subscription Service, los schemas Pydantic siguen una jerarquía donde las clases derivadas respetan completamente el contrato de la clase base. `SubscriptionCreate` define los campos mínimos para crear una suscripción. `SubscriptionUpdate` hereda el mismo contrato de validación de `plan_id` sin modificar su semántica:

```python
from pydantic import BaseModel, Field

class SubscriptionCreate(BaseModel):
    user_id: str = Field(min_length=1)
    plan_id: int = Field(gt=0)

class SubscriptionUpdate(BaseModel):
    plan_id: int = Field(gt=0)

class SubscriptionResponse(BaseModel):
    id: int
    user_id: str
    plan_id: int
    plan_name: str
    price_usd: float
    status: str
```

Asimismo, en el Catalog Service (Go), la interfaz `Repository` define el contrato base que es implementado por `repository.Repository` de forma completa y sin alterar la semántica esperada. El `Server` de gRPC depende de `catalogsvc.Service` como abstracción, no de una implementación concreta:

```go
type Server struct {
    grpcServer *grpc.Server
    svc        catalogsvc.Service   // abstraccion
    repo       repository.Repository // abstraccion
}

func New(repo repository.Repository, svc catalogsvc.Service) (*Server, error) {
    ...
}
```

Cualquier implementación concreta de `repository.Repository` puede sustituirse sin alterar el comportamiento del `Server`.

---

## 3. ¿Por qué se aplicó? (Justificación Técnica)

Al respetar LSP, el sistema garantiza que los módulos de alto nivel (`Server`, `grpc_server.py`) puedan operar con cualquier implementación de sus dependencias sin modificar su lógica. En el caso de Pydantic, `SubscriptionUpdate` puede sustituirse en cualquier función que acepte validación de `plan_id` sin romper el contrato de validación `gt=0`. En el caso de Go, si se reemplaza la implementación de `Repository` por una de pruebas (mock), el `Server` funciona de forma idéntica, lo que facilita el testing unitario.

---
