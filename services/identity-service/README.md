# Identity Service

Microservicio responsable de usuarios, autenticación y perfiles.

## Responsabilidades

- Registrar usuarios.
- Enviar confirmación de registro por correo automáticamente.
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

```

## Funcionalidad implementada

El servicio Identity implementa los siguientes métodos gRPC:

| Método | Descripción |
|---|---|
| `RegisterUser` | Registra usuario con email, contraseña y nombre completo |
| `Login` | Valida credenciales y genera JWT |
| `ValidateToken` | Valida JWT interno |
| `GetUserById` | Devuelve email y nombre completo para integraciones internas |
| `CreateProfile` | Crea perfil asociado a usuario |
| `ListProfiles` | Lista perfiles de un usuario |
| `SelectProfile` | Valida que un perfil pertenezca a un usuario |
| `UpdateCredentials` | Actualiza contraseña y dispara auditoría de credenciales |

## Objetos de base de datos utilizados

| Objeto | Uso |
|---|---|
| `users` | Almacena cuentas de usuario |
| `profiles` | Almacena perfiles por usuario |
| `credential_audit` | Audita cambios de credenciales |
| `sp_register_user` | Registra usuario |
| `sp_create_profile` | Crea perfil |
| `fn_can_create_profile` | Valida máximo 5 perfiles |
| `vw_user_profiles` | Lista perfiles por usuario |
| `trg_audit_credential_update` | Registra auditoría al cambiar contraseña |

## Validaciones principales

- El email se normaliza a minúsculas.
- El password debe tener mínimo 8 caracteres.
- El password se almacena con hash usando bcrypt.
- El JWT se genera desde Identity Service.
- Se permite máximo 5 perfiles por usuario.
- La actualización de contraseña dispara auditoría en base de datos.