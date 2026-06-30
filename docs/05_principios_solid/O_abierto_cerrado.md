[← Regresar](../../README.md)

[Regresar](../../README.md)

# Principio Abierto/Cerrado (OCP)

Las entidades de software deben estar abiertas para la extensión, pero cerradas para la modificación.

---

## 1. ¿Dónde se aplicó?

**Ubicación en el proyecto:**
- [grpc_server.py](../../services/payment-gateway-service/src/grpc_server.py)

**Funciones involucradas:**
- `_only_digits(value)` — sanitización de entrada
- `_luhn_is_valid(card_number)` — validación de algoritmo
- `_validate_request(request)` — orquestador de validaciones
- `_decline_reason(card_number)` — reglas de negocio sandbox

---

## 2. ¿Cómo se aplicó?

En el Payment Gateway Service, la lógica de `AuthorizePayment` está construida sobre funciones puras y pequeñas, cada una con un propósito único y estable. El método principal `AuthorizePayment` orquesta estas funciones sin contener lógica de validación directa, lo que permite extender las reglas de validación o las reglas sandbox agregando o modificando funciones auxiliares sin tocar el flujo principal del método:

```python
# Funciones cerradas a modificacion, abiertas a extension
def _only_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")

def _luhn_is_valid(card_number: str) -> bool:
    digits = [int(char) for char in card_number]
    checksum = 0
    parity = len(digits) % 2
    for index, digit in enumerate(digits):
        if index % 2 == parity:
            digit *= 2
            if digit > 9:
                digit -= 9
        checksum += digit
    return checksum % 10 == 0

def _decline_reason(card_number: str) -> str | None:
    if card_number.endswith("0000"):
        return "payment declined by issuer"
    if card_number.endswith("1111"):
        return "insufficient funds"
    return None
```

El método `AuthorizePayment` consume estas funciones sin conocer sus implementaciones internas:

```python
async def AuthorizePayment(self, request, context):
    is_valid, message, card_number = _validate_request(request)
    if not is_valid:
        return payment_pb2.AuthorizePaymentResponse(status="rejected", ...)

    decline_reason = _decline_reason(card_number)
    if decline_reason:
        return payment_pb2.AuthorizePaymentResponse(status="declined", ...)

    # approved
    transaction_id = f"sandbox-{uuid.uuid4()}"
    authorization_code = f"QT{random.randint(100000, 999999)}"
    ...
```

---

## 3. ¿Por qué se aplicó?

**Problema de diseño inicial:** Sin OCP, cada nueva regla sandbox (rechazar por BIN, agregar moneda, introducir un límite de monto) requeriría modificar directamente el cuerpo de `AuthorizePayment`. Con cada modificación crece el riesgo de romper los caminos de aprobación o rechazo ya validados, ya que la lógica nueva convive con la lógica existente dentro del mismo bloque condicional. En un servicio de pagos, cualquier regresión introducida por una extensión mal delimitada tiene impacto directo en los flujos de suscripción.

## 4. ¿Para qué se aplicó?

**Beneficio obtenido:**
- Para agregar una nueva regla de rechazo (por ejemplo, tarjetas de un BIN específico), solo se extiende la función `_decline_reason` sin modificar `AuthorizePayment`.
- Para soportar una nueva moneda, se agrega a `SUPPORTED_CURRENCIES` sin tocar la lógica de validación existente.
- El flujo principal del método permanece **cerrado a la modificación**, eliminando el riesgo de regresiones ante extensiones futuras, mientras que las reglas de negocio están **abiertas a la extensión** mediante sus funciones auxiliares.

---
