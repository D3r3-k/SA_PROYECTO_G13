[← Regresar](../../README.md)

# Documentacion de Locust - Release local

## Objetivo

Validar con una prueba de carga ligera que el ambiente **release en nube** responde correctamente bajo concurrencia controlada. La prueba se ejecuta **solo desde una maquina local**, pero el destino siempre es la **IP o URL publica de release**.

Adicional existe un flujo que se puede ejectuar desde las acciones de github, para validarlo contra develop.

## Que es Locust

Locust es una herramienta de pruebas de carga basada en Python. Permite modelar usuarios virtuales como codigo, ejecutar solicitudes HTTP contra rutas reales del sistema y generar metricas como cantidad de solicitudes, fallos, tiempo promedio, maximo, percentiles y solicitudes por segundo.

## Como funciona en Quetxal TV

El archivo principal es `tests/load/locustfile.py`. Alli se define el comportamiento de usuarios virtuales que consumen rutas criticas del API Gateway.

Flujos incluidos:

| Flujo | Ruta principal | Objetivo |
|---|---|---|
| Check del sistema | `GET /api/health` | Verificar disponibilidad general. |
| Autenticacion | `POST /api/auth/login` | Iniciar sesion con usuarios del CSV. |
| Perfil | `GET /api/auth/me` y `POST /api/profiles/{id}/select` | Validar sesion y seleccion de perfil. |
| Catalogo | `GET /api/catalog` | Medir consulta principal de contenido. |
| Busqueda | `GET /api/catalog/search` | Simular busquedas frecuentes. |
| Detalle | `GET /api/catalog/{id}` | Consultar contenido especifico. |
| Progreso y calificacion | Rutas de engagement | Simular actividad de reproduccion. |
| Descarga | `GET /api/catalog/{id}/download` | Validar regla de plan estandar. |
| Watch Party | `POST /api/watch-party/rooms` | Validar creacion solo para premium. |


## Variables necesarias

| Variable | Obligatoria | Descripcion |
|---|---:|---|
| `LOCUST_HOST` | Si | URL final de release. Ejemplo: `http://34.10.20.30`. |
| `LOCUST_USERS_FILE` | Si | CSV con usuarios. Por defecto: `tests/load/users.example.csv`. |
| `LOCUST_MODE` | Si | `full-flow` para usuarios reales o `route-check` para validar rutas. |
| `LOCUST_USERS` | No | Usuarios concurrentes. Valor recomendado: `20`. |
| `LOCUST_SPAWN_RATE` | No | Usuarios nuevos por segundo. Valor recomendado: `2`. |
| `LOCUST_RUN_TIME` | No | Duracion. Valor recomendado: `3m`. |
| `LOCUST_ENABLE_WS` | No | `false` por defecto en local para evitar fallos de red con WebSocket. |
| `LOCUST_CONTENT_IDS` | No | IDs fijos de contenido. Si se omite, se descubren desde catalogo. |

## CSV de usuarios

Formato requerido:

```csv
email,password,plan_tier,profile_id,is_admin
correo@example.com,321321321,premium,PROFILE_PREMIUM,false
correo@example.com,321321321,standard,PROFILE_STANDARD,false
correo@example.com,321321321,basic,PROFILE_BASIC,false
```


## Ejecucion local paso a paso


1. Editar la IP de release:

```bash
LOCUST_HOST=http://IP_RELEASE
```

2. Confirmar el CSV de usuarios:

```bash
LOCUST_USERS_FILE=tests/load/users.example.csv
```

3. Instalar dependencias:

```bash
python -m pip install -r tests/load/requirements.txt
```

4. Dar permisos al script si es necesario ( Usar gitbash, recomendacion ) :

```bash
chmod +x scripts/load/run_locust_release_local.sh
```

5. Ejecutar la prueba:

```bash
scripts/load/run_locust_release_local.sh tests/load/.env
```

6. Revisar resultados en:

```text
reports/locust/release-local-FECHA/locust-report.html
reports/locust/release-local-FECHA/reporte-ejecutivo-locust.html
reports/locust/release-local-FECHA/locust_stats.csv
reports/locust/release-local-FECHA/locust_failures.csv
```


## Criterios de aceptacion

| Criterio | Resultado esperado |
|---|---|
| Disponibilidad | `/api/health` responde 200. |
| Autenticacion | Los usuarios del CSV pueden iniciar sesion en modo `full-flow`. |
| Catalogo | El catalogo y busqueda responden sin errores 5xx. |
| Reglas de plan | Descarga aplica regla de plan estandar y Watch Party aplica regla premium. |
| Reporte | Se genera HTML de Locust y reporte ejecutivo. |
| Estabilidad | No deben existir fallos inesperados ni errores 5xx. |



## Evidencia de pruebas.


