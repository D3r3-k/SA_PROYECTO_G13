[← Regresar](../../README.md)

# API Gateway

API Gateway principal del proyecto.

## Responsabilidad

El API Gateway es el único punto de entrada para el frontend.

Responsabilidades:

- Recibir peticiones HTTP del frontend.
- Validar sesión mediante cookie/JWT.
- Comunicarse internamente con microservicios por gRPC.
- No contener lógica de negocio compleja.
- No permitir que el frontend consuma microservicios directamente.

## Decisiones

- No se utilizará OAuth.
- Identity Service genera el JWT.
- API Gateway guarda y valida el JWT mediante cookie segura.
- `profile_id` vive en Identity Service.
- Los demás servicios solo consumen `profile_id`.

## Comandos

Instalar dependencias:

```bash
npm install
```

## Integración con Identity Service

El API Gateway expone endpoints HTTP para autenticación y perfiles, pero la lógica de negocio vive en `identity-service`.

Comunicación:

```txt
Frontend -> API Gateway -> gRPC -> Identity Service -> Identity DB
```


