# Identity Service

Microservicio responsable de usuarios, autenticación y perfiles.

## Responsabilidades

- Registrar usuarios.
- Iniciar sesión.
- Generar JWT.
- Validar JWT.
- Crear perfiles.
- Listar perfiles.
- Seleccionar perfiles.
- Administrar `profile_id`.

## Decisiones

- No se utilizará OAuth.
- La autenticación será con email y contraseña.
- Identity Service genera el JWT.
- API Gateway guarda y valida el JWT usando cookie segura.
- `profile_id` vive en Identity Service.
- Los demás servicios solo consumen `profile_id`.
- Este microservicio tiene su propia base de datos.

## Base de datos

Tablas iniciales:

- `users`
- `profiles`
- `credential_audit`

Objetos iniciales:

- `vw_user_profiles`
- `fn_can_create_profile`

## Comandos

Instalar dependencias:

```bash
npm install