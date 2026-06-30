[← Regresar](../../README.md)

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

## 3. ¿Por qué se aplicó?

**Problema de diseño inicial:** Sin LSP, una clase derivada podría relajar las restricciones de validación de su base (por ejemplo, permitir `plan_id=0` en `SubscriptionUpdate` cuando la base exige `gt=0`), generando comportamientos inconsistentes según el tipo concreto utilizado. En Go, si una implementación de `Repository` lanzara excepciones donde la interfaz promete retornar `nil`, el `Server` fallaría en tiempo de ejecución de forma impredecible. La sustitución silenciosa de contratos es una fuente habitual de bugs difíciles de rastrear en sistemas políglotas.

## 4. ¿Para qué se aplicó?

**Beneficio obtenido:**
- `SubscriptionUpdate` puede usarse en cualquier función que acepte validación de `plan_id` sin romper el contrato `gt=0`, garantizando consistencia en todos los handlers que validan planes.
- En Go, la implementación de `Repository` puede reemplazarse por un mock en pruebas y el `Server` opera de forma idéntica, habilitando testing unitario sin base de datos real.
- Los módulos de alto nivel (`Server`, `grpc_server.py`) permanecen estables ante cambios de implementación en sus dependencias, ya que confían en el contrato de la abstracción y no en detalles concretos.

---
