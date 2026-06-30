[← Regresar](../README.md)

# Documentación técnica - API Gateway, autenticación y perfiles

## Índice

1. [Propósito del documento](#1-propósito-del-documento)
2. [Alcance del módulo](#2-alcance-del-módulo)
3. [Decisiones técnicas congeladas](#3-decisiones-técnicas-congeladas)
4. [Arquitectura del módulo](#4-arquitectura-del-módulo)
5. [Rutas externas del API Gateway](#5-rutas-externas-del-api-gateway)
6. [Manejo de sesión y cookie segura](#6-manejo-de-sesión-y-cookie-segura)
7. [Flujos funcionales del módulo](#7-flujos-funcionales-del-módulo)
8. [Contrato gRPC del Identity Service](#8-contrato-grpc-del-identity-service)
9. [Propagación de identidad hacia otros microservicios](#9-propagación-de-identidad-hacia-otros-microservicios)
10. [Guía corta de integración gRPC con el API Gateway](#10-guía-corta-de-integración-grpc-con-el-api-gateway)
11. [Objetos programables de base de datos](#11-objetos-programables-de-base-de-datos)
12. [Validación de variables de entorno y secretos](#12-validación-de-variables-de-entorno-y-secretos)
13. [Checklist de validación para integración](#13-checklist-de-validación-para-integración)
14. [Elementos no incluidos para evitar complejidad añadida](#14-elementos-no-incluidos-para-evitar-complejidad-añadida)
15. [Criterio de aceptación del módulo](#15-criterio-de-aceptación-del-módulo)

---

## 1. Propósito del documento

Este documento consolida la documentación técnica del área de API Gateway, autenticación, gestión de sesiones y perfiles del sistema **Quetxal TV**.

El objetivo principal es dejar establecido el comportamiento esperado del módulo, las rutas HTTP externas expuestas por el API Gateway, el contrato de integración gRPC con el `identity-service`, la forma en que se propaga la identidad hacia otros microservicios y las reglas mínimas que los demás servicios deben cumplir para integrarse correctamente.

El documento se redacta en tercera persona para que pueda formar parte de la documentación técnica del repositorio.

---

## 2. Alcance del módulo

El módulo cubre las capacidades relacionadas con autenticación, sesión y multiperfil.

### 2.1 Funcionalidades cubiertas

| Funcionalidad | Estado esperado |
|---|---|
| Registro de usuario | Implementado en `identity-service` y expuesto por API Gateway. |
| Inicio de sesión | Implementado mediante credenciales, JWT y cookie HTTP-only. |
| Cierre de sesión | Implementado mediante eliminación de cookie de sesión. |
| Validación de sesión | Implementada mediante comunicación Gateway -> Identity Service. |
| Consulta de usuario autenticado | Implementada mediante endpoint protegido. |
| Creación de perfiles | Implementada con límite máximo de 5 perfiles por usuario. |
| Listado de perfiles | Implementado para el usuario autenticado. |
| Selección de perfil | Implementada mediante generación de nuevo token con `profile_id`. |
| Actualización de perfil | Implementada para nombre/avatar del perfil. |
| Eliminación de perfil | Implementada validando pertenencia al usuario. |
| Actualización de credenciales | Implementada con validación de contraseña actual y auditoría. |

### 2.2 Componentes involucrados

| Componente | Tecnología | Responsabilidad |
|---|---|---|
| `api-gateway` | TypeScript | Punto de entrada único para clientes externos. |
| `identity-service` | TypeScript | Gestión de usuarios, sesiones, tokens y perfiles. |
| `identity-db` | PostgreSQL | Persistencia del dominio de identidad y perfiles. |
| `proto/identity.proto` | Protocol Buffers | Contrato estricto para comunicación gRPC. |

---

## 3. Decisiones técnicas congeladas

Con el fin de evitar cambios innecesarios durante la integración con otros microservicios, se establecen las siguientes decisiones:

1. El cliente externo únicamente consume rutas HTTP del API Gateway.
2. Ningún cliente externo debe comunicarse directamente con los microservicios internos.
3. El `identity-service` no se expone públicamente.
4. El API Gateway valida la sesión mediante cookie HTTP-only y comunicación gRPC con `identity-service`.
5. El token de sesión no se entrega al frontend para almacenamiento manual en `localStorage` o `sessionStorage`.
6. La selección de perfil actualiza el token de sesión para incluir el `profile_id` activo.
7. Los microservicios internos no deben validar cookies del navegador.
8. El API Gateway es responsable de obtener y propagar `user_id` y `profile_id` cuando aplique.
9. Para esta fase, se prefiere una integración simple mediante campos explícitos en los mensajes `.proto`.
10. No se agregan características no solicitadas que aumenten el riesgo o el tiempo de desarrollo.

---

## 4. Arquitectura del módulo

### 4.1 Flujo general

```txt
Cliente Web
   |
   | HTTP + Cookie de sesión
   v
API Gateway - TypeScript
   |
   | gRPC
   v
Identity Service - TypeScript
   |
   | SQL
   v
Identity DB - PostgreSQL
```

### 4.2 Responsabilidades del API Gateway

El API Gateway centraliza el acceso externo y cumple las siguientes responsabilidades:

1. Recibir peticiones HTTP desde el frontend.
2. Leer la cookie de sesión cuando la ruta es protegida.
3. Validar el token mediante `identity-service`.
4. Obtener los datos de identidad del usuario autenticado.
5. Exponer rutas HTTP estables para el frontend.
6. Comunicarse internamente con microservicios por gRPC.
7. Devolver respuestas HTTP controladas al cliente.

### 4.3 Responsabilidades del Identity Service

El `identity-service` concentra la lógica del dominio de identidad:

1. Registrar usuarios.
2. Autenticar credenciales.
3. Generar y validar JWT.
4. Crear, listar, seleccionar, actualizar y eliminar perfiles.
5. Validar el límite máximo de 5 perfiles por usuario.
6. Actualizar credenciales.
7. Delegar reglas transaccionales y auditoría en objetos programables de base de datos cuando aplique.

---

## 5. Rutas externas del API Gateway

### 5.1 Base de ruta

```txt
/api
```

### 5.2 Ruta de salud

| Método | Ruta | Autenticación | Descripción |
|---|---|---:|---|
| GET | `/api/health` | No | Verifica que el API Gateway se encuentre levantado. |

### 5.3 Rutas de autenticación

| Método | Ruta | Autenticación | Descripción |
|---|---|---:|---|
| POST | `/api/auth/register` | No | Registra un usuario, crea token de sesión y establece cookie HTTP-only. |
| POST | `/api/auth/login` | No | Valida credenciales, crea token de sesión y establece cookie HTTP-only. |
| POST | `/api/auth/logout` | No | Limpia la cookie de sesión del cliente. |
| GET | `/api/auth/me` | Sí | Devuelve el usuario autenticado y el perfil seleccionado si existe. |
| PUT | `/api/auth/credentials` | Sí | Actualiza credenciales del usuario y cierra la sesión activa. |

### 5.4 Rutas de perfiles

| Método | Ruta | Autenticación | Descripción |
|---|---|---:|---|
| POST | `/api/profiles` | Sí | Crea un perfil asociado al usuario autenticado. Máximo 5 perfiles por usuario. |
| GET | `/api/profiles` | Sí | Lista los perfiles del usuario autenticado e indica el perfil seleccionado. |
| POST | `/api/profiles/:profileId/select` | Sí | Selecciona un perfil, valida pertenencia y genera un nuevo token con `profile_id`. |
| PUT | `/api/profiles/:profileId` | Sí | Actualiza nombre y avatar del perfil indicado. |
| DELETE | `/api/profiles/:profileId` | Sí | Elimina el perfil indicado. Si era el perfil activo, se cierra la sesión. |

### 5.5 Códigos HTTP utilizados

| Código | Uso |
|---:|---|
| 200 | Operación realizada correctamente. |
| 201 | Recurso creado correctamente. |
| 400 | Error de validación o incumplimiento de regla de negocio. |
| 401 | Cookie ausente, token inválido o credenciales incorrectas. |
| 502 | Respuesta incompleta o inválida desde un servicio interno. |
| 503 | Servicio interno no disponible. |

---

## 6. Manejo de sesión y cookie segura

El API Gateway maneja la sesión mediante una cookie configurada por variable de entorno.

```txt
COOKIE_NAME
```

La cookie debe configurarse bajo los siguientes criterios:

```txt
httpOnly: true
secure: según entorno
sameSite: según entorno
path: /
```

El frontend debe enviar credenciales en las peticiones HTTP hacia el Gateway.

```ts
fetch('/api/auth/me', {
  credentials: 'include'
});
```

El token no se expone al cliente como valor manual para almacenamiento. El manejo de sesión queda centralizado mediante la cookie HTTP-only.

---

## 7. Flujos funcionales del módulo

### 7.1 Flujo de registro

1. El cliente envía correo y contraseña al API Gateway.
2. El API Gateway llama al método `RegisterUser` del `identity-service` mediante gRPC.
3. El `identity-service` valida los datos y registra el usuario en la base de datos.
4. El `identity-service` genera un JWT para la sesión inicial.
5. El API Gateway recibe la respuesta, establece la cookie HTTP-only y devuelve una respuesta controlada al cliente.

#### Endpoint

```txt
POST /api/auth/register
```

#### Request

```json
{
  "email": "usuario@correo.com",
  "password": "Password123"
}
```

#### Response esperado

```json
{
  "success": true,
  "message": "...",
  "user_id": "uuid"
}
```

### 7.2 Flujo de login

1. El cliente envía sus credenciales al API Gateway.
2. El API Gateway llama al método `Login` del `identity-service` mediante gRPC.
3. El `identity-service` valida la contraseña del usuario.
4. Si las credenciales son correctas, el `identity-service` genera un JWT.
5. El API Gateway establece la cookie HTTP-only.
6. El cliente queda autenticado para consumir rutas protegidas.

#### Endpoint

```txt
POST /api/auth/login
```

#### Request

```json
{
  "email": "usuario@correo.com",
  "password": "Password123"
}
```

#### Response esperado

```json
{
  "success": true,
  "message": "...",
  "user_id": "uuid"
}
```

### 7.3 Flujo de validación de sesión

1. El cliente solicita una ruta protegida.
2. El API Gateway obtiene la cookie de sesión.
3. Si no existe cookie, el Gateway responde `401`.
4. Si existe cookie, el Gateway llama `ValidateToken` en el `identity-service`.
5. Si el token es válido, el Gateway obtiene `user_id`, `email` y `profile_id` cuando exista.
6. La ruta protegida continúa su ejecución.

#### Endpoint de prueba

```txt
GET /api/auth/me
```

#### Response esperado

```json
{
  "success": true,
  "user": {
    "user_id": "uuid",
    "email": "usuario@correo.com",
    "profile_id": "uuid-o-vacio"
  }
}
```

### 7.4 Flujo de logout

1. El cliente solicita cerrar sesión.
2. El API Gateway elimina la cookie de sesión.
3. El cliente queda sin sesión activa.

#### Endpoint

```txt
POST /api/auth/logout
```

### 7.5 Flujo de creación de perfil

1. El cliente autenticado solicita crear un perfil.
2. El API Gateway valida la sesión.
3. El API Gateway llama `CreateProfile` con el `user_id` autenticado.
4. La base de datos valida que el usuario tenga menos de 5 perfiles.
5. Si cumple la regla, se crea el perfil.
6. Si excede el límite, se devuelve un error de regla de negocio.

#### Endpoint

```txt
POST /api/profiles
```

#### Request

```json
{
  "name": "Tomas",
  "avatar_url": "https://..."
}
```

### 7.6 Flujo de selección de perfil

1. El usuario selecciona un perfil desde el frontend.
2. El API Gateway valida la sesión actual.
3. El API Gateway llama `SelectProfile` con `user_id` y `profile_id`.
4. El `identity-service` valida que el perfil pertenezca al usuario autenticado.
5. El `identity-service` genera un nuevo JWT que incluye el `profile_id`.
6. El API Gateway actualiza la cookie de sesión.
7. Los demás servicios pueden recibir el perfil activo cuando aplique.

#### Endpoint

```txt
POST /api/profiles/:profileId/select
```

#### Response esperado

```json
{
  "success": true,
  "message": "...",
  "profile_id": "uuid",
  "user_id": "uuid",
  "name": "Perfil",
  "avatar_url": "..."
}
```

### 7.7 Flujo de actualización de credenciales

1. El usuario autenticado envía contraseña actual y nueva contraseña.
2. El API Gateway valida la sesión.
3. El API Gateway llama `UpdateCredentials`.
4. El `identity-service` valida la contraseña actual.
5. Si la contraseña es correcta, se actualiza el hash de la contraseña.
6. El trigger de base de datos registra la auditoría del cambio.
7. El API Gateway limpia la cookie y obliga al usuario a iniciar sesión nuevamente.

#### Endpoint

```txt
PUT /api/auth/credentials
```

#### Request

```json
{
  "current_password": "Password123",
  "new_password": "NewPassword123"
}
```

---

## 8. Contrato gRPC del Identity Service

El contrato del servicio de identidad se encuentra en:

```txt
proto/identity.proto
```

El servicio expone métodos relacionados con autenticación, validación de sesión y administración de perfiles.

```proto
service IdentityService {
  rpc RegisterUser(RegisterUserRequest) returns (AuthResponse);
  rpc Login(LoginRequest) returns (AuthResponse);
  rpc ValidateToken(ValidateTokenRequest) returns (ValidateTokenResponse);

  rpc CreateProfile(CreateProfileRequest) returns (ProfileResponse);
  rpc ListProfiles(ListProfilesRequest) returns (ListProfilesResponse);
  rpc SelectProfile(SelectProfileRequest) returns (SelectProfileResponse);
  rpc UpdateProfile(UpdateProfileRequest) returns (ProfileResponse);
  rpc DeleteProfile(DeleteProfileRequest) returns (DeleteProfileResponse);

  rpc UpdateCredentials(UpdateCredentialsRequest) returns (UpdateCredentialsResponse);
}
```

> Nota: si el archivo `identity.proto` cambia durante la integración, esta sección debe actualizarse en el mismo Pull Request que modifique el contrato.

---

## 9. Propagación de identidad hacia otros microservicios

Después de validar una sesión, el API Gateway dispone de los siguientes datos:

```txt
user_id
email
profile_id
```

El campo `profile_id` puede estar vacío si el usuario todavía no ha seleccionado un perfil.

### 9.1 Servicios que requieren perfil

Los servicios que manejan historial, calificaciones, preferencias o progreso de reproducción deben recibir `profile_id`, ya que el enunciado solicita que cada perfil mantenga su información de forma aislada.

Ejemplos:

```txt
engagement-service
ratings
watch-history
recommendations
```

### 9.2 Servicios que requieren cuenta

Los servicios que trabajan con cuenta o suscripción deben recibir `user_id`.

Ejemplos:

```txt
subscription-service
notification-service
account-management
```

### 9.3 Servicios públicos o semipúblicos

El catálogo puede permitir consultas generales sin perfil. Sin embargo, si en algún punto se agrega personalización, debe recibir `profile_id`.

Ejemplos:

```txt
catalog-service listado general: no requiere profile_id
catalog-service detalle de contenido: no requiere profile_id
catalog-service recomendaciones personalizadas: requiere profile_id
```

### 9.4 Recomendación para esta fase

Para reducir complejidad, cada request gRPC debe incluir explícitamente los identificadores necesarios dentro del mensaje `.proto`.

Ejemplo:

```proto
message SaveProgressRequest {
  string user_id = 1;
  string profile_id = 2;
  string content_id = 3;
  int32 season_number = 4;
  int32 episode_number = 5;
  int32 minute = 6;
}
```

Este enfoque evita que cada equipo implemente metadata gRPC de forma distinta.

### 9.5 Alternativa aceptable con metadata gRPC

Si un servicio decide usar metadata gRPC, debe mantener los siguientes nombres estándar:

```txt
x-user-id
x-profile-id
x-user-email
authorization
```

Ejemplo en TypeScript:

```ts
import * as grpc from '@grpc/grpc-js';

export function createAuthMetadata(userId: string, profileId?: string, email?: string) {
  const metadata = new grpc.Metadata();
  metadata.set('x-user-id', userId);

  if (profileId) {
    metadata.set('x-profile-id', profileId);
  }

  if (email) {
    metadata.set('x-user-email', email);
  }

  return metadata;
}
```

Para esta entrega no se debe mezclar el uso de campos explícitos y metadata dentro de un mismo servicio. Si el equipo busca avanzar con menor riesgo, debe usar campos explícitos en los mensajes `.proto`.

---

## 10. Guía corta de integración gRPC con el API Gateway

### 10.1 Regla principal

La comunicación debe seguir este patrón:

```txt
Cliente Web -> API Gateway -> Microservicio gRPC -> Base de datos propia
```

No se permite el siguiente patrón:

```txt
Cliente Web -> Microservicio interno
```

### 10.2 Responsabilidad de cada microservicio

Cada microservicio debe cumplir con lo siguiente:

1. Exponer un servidor gRPC.
2. Implementar los métodos definidos en su archivo `.proto`.
3. Tener base de datos propia cuando el dominio requiera persistencia.
4. No depender de cookies del navegador.
5. Recibir explícitamente los identificadores necesarios: `user_id`, `profile_id`, `content_id`, `subscription_id`, entre otros.
6. Responder errores de negocio de forma controlada.
7. Levantar desde Docker Compose.

### 10.3 Estructura mínima por microservicio

```txt
services/nombre-service/
├── Dockerfile
├── .env.example
├── README.md
├── src/
├── migrations/              # si usa base de datos
└── package.json/go.mod/requirements.txt
```

### 10.4 Criterio mínimo para considerar integrado un servicio

Un servicio se considera integrado cuando:

```txt
1. Docker Compose lo levanta.
2. El API Gateway puede llamarlo por gRPC.
3. El API Gateway expone al menos una ruta HTTP para probarlo.
4. La respuesta llega correctamente al frontend o a una herramienta como Postman/Thunder Client.
5. La identidad se propaga cuando aplica.
```

### 10.5 Ejemplos de integración esperada

```txt
GET /api/catalog
Gateway -> catalog-service.ListContent
```

```txt
POST /api/content/:id/progress
Gateway valida sesión
Gateway obtiene user_id/profile_id
Gateway -> engagement-service.SaveProgress
```

```txt
GET /api/plans
Gateway -> subscription-service.ListPlans
```

### 10.6 Errores esperados

| Caso | Respuesta recomendada |
|---|---:|
| Sin cookie | 401 |
| Token inválido | 401 |
| Servicio interno caído | 503 |
| Error de regla de negocio | 400 |
| Respuesta incompleta del servicio | 502 |

---

## 11. Objetos programables de base de datos

El módulo de identidad utiliza objetos programables de base de datos para cumplir reglas transaccionales y de auditoría.

| Tipo | Uso esperado |
|---|---|
| Procedimientos almacenados | Registro de usuario, creación de perfil y operaciones transaccionales del dominio. |
| Funciones | Validaciones reutilizables, como el límite máximo de perfiles por usuario. |
| Vistas | Consulta simplificada de perfiles asociados a una cuenta. |
| Triggers | Auditoría automática de cambios de credenciales. |

### 11.1 Tabla de referencia

| Tipo | Nombre o referencia | Propósito |
|---|---|---|
| Procedimiento almacenado | `sp_register_user` | Registrar un usuario en el dominio de identidad. |
| Procedimiento almacenado | `sp_create_profile` | Crear un perfil asociado a un usuario autenticado. |
| Función | Función de validación de máximo 5 perfiles | Evitar que una cuenta tenga más de 5 perfiles. |
| Vista | Vista de perfiles por cuenta | Facilitar la consulta de perfiles de un usuario. |
| Trigger | Trigger de auditoría de credenciales | Registrar cambios de contraseña o credenciales. |

> Nota: los nombres deben ajustarse si el script SQL final utiliza nombres diferentes. La documentación final debe coincidir con los objetos reales del repositorio.

---

## 12. Validación de variables de entorno y secretos

### 12.1 Regla del proyecto

Los archivos `.env` reales se utilizan para ejecutar el sistema, pero no deben subirse al repositorio. Solo deben versionarse archivos `.env.example` sin secretos reales.

### 12.2 Comandos de validación

Ejecutar desde la raíz del repositorio:

```bash
git status --short
```

Validar si existe algún `.env` versionado:

```bash
git ls-files | grep -E '(^|/)\.env$|\.env$'
```

Resultado esperado:

```txt
Sin salida
```

Validar que existan archivos `.env.example`:

```bash
git ls-files | grep '.env.example'
```

Resultado esperado mínimo:

```txt
apps/api-gateway/.env.example
services/identity-service/.env.example
```

### 12.3 Si un `.env` aparece versionado

Debe retirarse del tracking sin eliminar el archivo local:

```bash
git rm --cached apps/api-gateway/.env
git rm --cached services/identity-service/.env
```

Luego debe confirmarse que `.gitignore` incluya:

```gitignore
.env
**/.env
```

Y debe registrarse el ajuste:

```bash
git add .gitignore
git commit -m "chore: remove environment files from tracking"
```

### 12.4 Variables esperadas por módulo

#### API Gateway

```txt
PORT=
FRONTEND_URL=
COOKIE_NAME=
COOKIE_SECURE=
COOKIE_SAME_SITE=
IDENTITY_GRPC_URL=
```

#### Identity Service

```txt
PORT=
GRPC_HOST=
GRPC_PORT=
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=
```

---

## 13. Checklist de validación para integración

### 13.1 Validación común para todos los servicios

| Validación | Estado |
|---|---|
| El servicio tiene carpeta propia en `/services`. | ☐ |
| El servicio tiene `Dockerfile`. | ☐ |
| El servicio tiene `.env.example`. | ☐ |
| El servicio no sube `.env` real. | ☐ |
| El servicio tiene README mínimo. | ☐ |
| El contrato `.proto` está en `/proto`. | ☐ |
| El servicio levanta localmente. | ☐ |
| El servicio levanta con `docker-compose.local.yml`. | ☐ |
| El puerto gRPC está configurado por variable de entorno. | ☐ |
| El Gateway puede conectarse por nombre de servicio Docker. | ☐ |
| El servicio devuelve errores controlados. | ☐ |

### 13.2 Validación para `catalog-service`

| Validación | Estado |
|---|---|
| Está implementado en Go. | ☐ |
| Tiene base de datos propia. | ☐ |
| Lista contenido. | ☐ |
| Busca por título. | ☐ |
| Filtra por categoría/género. | ☐ |
| Devuelve detalle de película/serie. | ☐ |
| Incluye ficha técnica y actores/reparto. | ☐ |
| Tiene IDs de contenido estables para calificaciones e historial. | ☐ |
| El Gateway expone al menos una ruta `/api/catalog`. | ☐ |

### 13.3 Validación para `subscription-service`

| Validación | Estado |
|---|---|
| Está implementado en Python. | ☐ |
| Tiene base de datos propia. | ☐ |
| Lista planes. | ☐ |
| Permite seleccionar plan. | ☐ |
| Permite modificar suscripción. | ☐ |
| Permite cancelar suscripción. | ☐ |
| Recibe `user_id` desde Gateway. | ☐ |
| El Gateway expone rutas `/api/plans` o `/api/subscriptions`. | ☐ |

### 13.4 Validación para `fx-service`

| Validación | Estado |
|---|---|
| Está implementado en Python. | ☐ |
| Usa Redis. | ☐ |
| Define TTL para tipos de cambio. | ☐ |
| Devuelve precio convertido. | ☐ |
| Evita consultar API externa repetidamente si existe caché. | ☐ |
| El Gateway o `subscription-service` puede consultarlo por gRPC. | ☐ |

### 13.5 Validación para `notification-service`

| Validación | Estado |
|---|---|
| Está implementado en Python o TypeScript. | ☐ |
| Envía o registra confirmación de registro. | ☐ |
| Envía o registra recibo de compra. | ☐ |
| Envía o registra alerta de nuevo contenido. | ☐ |
| No bloquea el flujo principal si falla la notificación. | ☐ |

### 13.6 Validación para `engagement-service`

| Validación | Estado |
|---|---|
| Está implementado en Go o Python. | ☐ |
| Tiene base de datos propia. | ☐ |
| Recibe `profile_id`. | ☐ |
| Recibe `content_id`. | ☐ |
| Permite calificar contenido. | ☐ |
| Calcula porcentaje global de recomendación. | ☐ |
| Guarda progreso de reproducción. | ☐ |
| Guarda temporada, capítulo y minuto para series. | ☐ |
| Devuelve historial reciente por perfil. | ☐ |
| Permite reanudar contenido. | ☐ |
| El Gateway expone rutas de rating, progress e history. | ☐ |

### 13.7 Identidad requerida por servicio

| Servicio | Requiere `user_id` | Requiere `profile_id` | Observación |
|---|---:|---:|---|
| `catalog-service` | Opcional | Opcional | Puede listar catálogo sin sesión si el equipo lo decide. |
| `subscription-service` | Sí | No | La suscripción pertenece a la cuenta. |
| `fx-service` | No | No | Solo convierte precios. |
| `notification-service` | Sí | No | Las notificaciones se asocian a cuenta o eventos. |
| `engagement-service` | Sí | Sí | Historial y calificaciones deben aislarse por perfil. |

### 13.8 Pruebas mínimas desde Gateway

Cada integración debe probarse con una ruta HTTP expuesta por el Gateway:

```txt
GET  /api/catalog
GET  /api/plans
GET  /api/fx/rates o ruta equivalente
POST /api/content/:id/rating
POST /api/content/:id/progress
GET  /api/profiles/:id/history
```

Las rutas pueden ajustarse por equipo, pero deben documentarse cuando se congelen.

### 13.9 Resultado esperado de la reunión de integración

| Estado | Significado |
|---|---|
| Integrado | El Gateway puede llamar al servicio y el servicio responde correctamente. |
| Parcial | El servicio levanta, pero falta ruta Gateway o método gRPC. |
| Bloqueado | El servicio no levanta o no tiene contrato claro. |

---

## 14. Elementos no incluidos para evitar complejidad añadida

Para mantener el alcance dentro de lo solicitado por el proyecto y reducir el riesgo de entrega, no se incluyen en esta fase:

1. Roles administrativos avanzados.
2. Refresh tokens.
3. OAuth completo si no es necesario para la demostración.
4. Rate limiting avanzado.
5. Observabilidad distribuida.
6. Autorización granular por permisos.
7. Comunicación directa desde frontend hacia microservicios internos.
8. Validación JWT duplicada en cada microservicio.

Estas exclusiones no contradicen el alcance mínimo del módulo, ya que el flujo principal se cubre mediante API Gateway, JWT, cookie de sesión y comunicación gRPC interna.

---

## 15. Criterio de aceptación del módulo

El módulo puede considerarse listo para integración cuando se cumpla lo siguiente:

```txt
☐ El API Gateway levanta correctamente.
☐ El Identity Service levanta correctamente.
☐ La base de datos de identidad levanta correctamente.
☐ El registro de usuario funciona.
☐ El login funciona.
☐ La cookie HTTP-only se establece correctamente.
☐ La ruta /api/auth/me valida sesión correctamente.
☐ El logout elimina la sesión.
☐ La creación de perfil funciona.
☐ El listado de perfiles funciona.
☐ La selección de perfil actualiza el contexto de sesión.
☐ El límite máximo de 5 perfiles se respeta.
☐ La actualización de credenciales funciona.
☐ La auditoría de cambio de credenciales se registra mediante trigger.
☐ Los archivos .env reales no están versionados.
☐ Los archivos .env.example están actualizados.
☐ El contrato identity.proto está actualizado.
☐ Los demás equipos conocen cómo recibir user_id y profile_id.
☐ El Gateway queda preparado para integrar otros microservicios por gRPC.
```

---

## 16. Comando base de ejecución local

El entorno local debe ejecutarse desde la raíz del repositorio mediante Docker Compose:

```bash
docker compose -f infra/docker-compose.local.yml up --build
```

Este comando debe levantar, como mínimo, los servicios base de identidad y Gateway. Conforme los demás equipos integren sus dominios, el mismo archivo debe incorporar sus microservicios, bases de datos y Redis.