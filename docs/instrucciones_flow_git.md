# Instrucciones de Flujo Git

## Objetivo

Este documento define la forma oficial de trabajo con ramas, commits y Pull Requests para el proyecto.
El objetivo es evitar conflictos, mantener trazabilidad del avance y asegurar que todo cambio importante sea revisado antes de integrarse.

## Ramas principales

El repositorio trabaja con dos ramas principales:

```txt
main
develop
```

### `main`

La rama `main` representa la versión estable del proyecto.

Reglas:

* No se debe trabajar directamente sobre `main`.
* No se deben hacer commits directos a `main`.
* Solo debe recibir cambios desde ramas de release o desde `develop`, mediante Pull Request aprobado.
* La entrega final debe salir desde esta rama.
* El tag final del proyecto debe crearse desde esta rama.

### `develop`

La rama `develop` representa la integración principal del equipo.

Reglas:

* No se debe trabajar directamente sobre `develop`.
* No se deben hacer commits directos a `develop`.
* Toda funcionalidad, documentación o configuración debe entrar mediante Pull Request.
* Es la rama base para crear nuevas ramas de trabajo.

## Tipos de ramas de trabajo

Para ordenar el desarrollo, se usarán los siguientes prefijos:

```txt
feat/
docs/
infra/
fix/
chore/
release/
```

### `feat/`

Se usa para nuevas funcionalidades.

Ejemplos:

```txt
feat/api-gateway-ts
feat/auth-profile-ts
feat/catalog-go
feat/engagement-service
feat/fx-redis-python
```

### `docs/`

Se usa para documentación, diagramas, casos de uso o evidencias.

Ejemplos:

```txt
docs/git-flow
docs/auth-security
docs/catalog-usecases
docs/video-consumption-flow
```

### `infra/`

Se usa para Docker, Docker Compose, despliegue, variables de entorno de ejemplo o configuración de nube.

Ejemplos:

```txt
infra/docker-compose-local
infra/docker-compose-cloud
infra/gcp-deployment
```

### `fix/`

Se usa para correcciones de errores.

Ejemplos:

```txt
fix/gateway-healthcheck
fix/auth-token-validation
fix/catalog-search-error
```

### `chore/`

Se usa para tareas de mantenimiento que no agregan funcionalidad directa.

Ejemplos:

```txt
chore/project-structure
chore/update-gitignore
chore/personax-onboarding
```

### `release/`

Se usa para preparar una versión final antes de integrarla a `main`.

Ejemplo:

```txt
release/v1.0.0
```

## Flujo general de trabajo

El flujo oficial es:

```txt
develop -> rama de trabajo -> Pull Request -> develop -> release -> main -> tag
```

Ejemplo:

```txt
develop -> feat/api-gateway-ts -> PR -> develop
develop -> feat/auth-profile-ts -> PR -> develop
develop -> docs/auth-security -> PR -> develop
develop -> release/v1.0.0 -> PR -> main -> tag v1.0.0
```

## Pasos para iniciar una tarea

Antes de crear una rama nueva:

```bash
git checkout develop
git pull origin develop
```

Luego crear la rama:

```bash
git checkout -b tipo/nombre-descriptivo
```

Ejemplo:

```bash
git checkout -b feat/api-gateway-ts
```

## Pasos para subir cambios

Verificar archivos modificados:

```bash
git status
```

Agregar cambios:

```bash
git add .
```

Crear commit:

```bash
git commit -m "feat: add api gateway healthcheck"
```

Subir rama:

```bash
git push origin feat/api-gateway-ts
```

Luego crear Pull Request hacia:

```txt
develop
```

## Convención de commits

Se recomienda usar mensajes claros con el siguiente formato:

```txt
tipo: descripcion breve
```

Tipos recomendados:

```txt
feat: nueva funcionalidad
fix: corrección de error
docs: documentación
infra: infraestructura
chore: mantenimiento
refactor: cambio interno sin modificar comportamiento
test: pruebas
```

Ejemplos:

```txt
feat: add identity proto contract
docs: add git flow instructions
infra: add docker compose local base
fix: correct gateway environment loading
```

## Reglas de Pull Request

Todo Pull Request debe cumplir:

* Debe apuntar hacia `develop`, excepto releases que apuntan hacia `main`.
* Debe tener nombre claro.
* Debe describir los cambios realizados.
* Debe indicar cómo se probó.
* Debe incluir evidencia cuando aplique.
* Debe tener al menos una revisión/aprobación.
* No debe incluir archivos `.env` reales.
* No debe incluir secretos, contraseñas o llaves privadas.
* No debe mezclar demasiadas responsabilidades en un solo PR.

## Tamaño recomendado de PR

Un PR debe ser pequeño y revisable.

Correcto:

```txt
PR: feat/api-gateway-ts
Incluye:
- estructura base del gateway
- endpoint /api/health
- Dockerfile del gateway
- README del gateway
```

Incorrecto:

```txt
PR: backend completo
Incluye:
- gateway
- auth
- catálogo
- suscripciones
- frontend
- docker
- documentación final
```

## Revisión cruzada sugerida

| Autor del PR | Revisor principal | Revisor secundario |
| ------------ | ----------------- | ------------------ |
| Tomas        | Josue             | Johan              |
| Josue        | Johan             | Tomas              |
| Johan        | Tomas             | Josue              |
| Derek        | Victor            | Josue              |
| Victor       | Derek             | Johan              |

## Criterios para aprobar un PR

Antes de aprobar, revisar:

```txt
☐ El PR apunta a la rama correcta
☐ El nombre de la rama es claro
☐ El código compila o levanta si aplica
☐ No hay archivos .env reales
☐ No hay secretos
☐ Se agregó .env.example si aplica
☐ Se actualizó documentación si el cambio ya está finalizado
☐ Se agregó Dockerfile si el servicio lo requiere
☐ Se respeta la arquitectura de microservicios
☐ El frontend no consume servicios directamente
☐ La comunicación interna se mantiene vía Gateway/gRPC
```

## Documentación en PRs

La documentación debe acompañar a los cambios cuando el punto ya esté suficientemente definido o finalizado.

No es obligatorio documentar cada avance incompleto, pero sí debe documentarse:

* Funcionalidad terminada.
* Contratos definidos.
* Endpoints estables.
* Flujos importantes.
* Decisiones técnicas.
* Configuración necesaria para ejecutar servicios.
* Evidencia de pruebas o despliegue cuando aplique.

## Reglas de arquitectura que deben respetarse

El proyecto debe mantener estas decisiones:

* El frontend solo consume el API Gateway.
* Ningún frontend debe consumir microservicios directamente.
* El API Gateway se comunica internamente con servicios mediante gRPC.
* Los contratos se definen con Protocol Buffers.
* Cada microservicio debe tener su propia base de datos.
* `profile_id` vive en Identity Service.
* Otros servicios solo consumen `profile_id`.
* No se utilizará OAuth.
* Identity Service genera el JWT.
* API Gateway guarda y valida el JWT mediante cookie segura.
* Redis se utilizará para el FX-Service.
* No se deben subir archivos `.env` reales al repositorio.

## Flujo para release final

Cuando el proyecto esté listo:

```bash
git checkout develop
git pull origin develop
git checkout -b release/v1.0.0
git push origin release/v1.0.0
```

Crear PR:

```txt
release/v1.0.0 -> main
```

Después de aprobar y mezclar en `main`:

```bash
git checkout main
git pull origin main
git tag v1.0.0
git push origin v1.0.0
```

## Resumen rápido

```txt
1. Siempre partir desde develop actualizado.
2. Crear rama feature/docs/infra/fix/chore.
3. Hacer commits pequeños y claros.
4. Subir rama.
5. Crear PR hacia develop.
6. Esperar revisión.
7. Corregir si aplica.
8. Hacer merge aprobado.
9. Para entrega final, usar release/v1.0.0 hacia main.
```
