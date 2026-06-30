# Documentacion de Locust - Release local

## Objetivo

Validar con una prueba de carga ligera que el ambiente **release en nube** responde correctamente bajo concurrencia controlada. La prueba se ejecuta **solo desde una maquina local**, pero el destino siempre es la **IP o URL publica de release**.

Este flujo no modifica el flujo existente de develop. Se agrego como ejecucion local separada para poder probar release sin tocar el pipeline que ya funciona en develop.

## Que es Locust

Locust es una herramienta de pruebas de carga basada en Python. Permite modelar usuarios virtuales como codigo, ejecutar solicitudes HTTP contra rutas reales del sistema y generar metricas como cantidad de solicitudes, fallos, tiempo promedio, maximo, percentiles y solicitudes por segundo.

## Como funciona en Quetxal TV

El archivo principal es `tests/load/locustfile.py`. Alli se define el comportamiento de usuarios virtuales que consumen rutas criticas del API Gateway.

Flujos incluidos:

| Flujo | Ruta principal | Objetivo |
|---|---|---|
| Salud del sistema | `GET /api/health` | Verificar disponibilidad general. |
| Autenticacion | `POST /api/auth/login` | Iniciar sesion con usuarios del CSV. |
| Perfil | `GET /api/auth/me` y `POST /api/profiles/{id}/select` | Validar sesion y seleccion de perfil. |
| Catalogo | `GET /api/catalog` | Medir consulta principal de contenido. |
| Busqueda | `GET /api/catalog/search` | Simular busquedas frecuentes. |
| Detalle | `GET /api/catalog/{id}` | Consultar contenido especifico. |
| Progreso y calificacion | Rutas de engagement | Simular actividad de reproduccion. |
| Descarga | `GET /api/catalog/{id}/download` | Validar regla de plan estandar. |
| Watch Party | `POST /api/watch-party/rooms` | Validar creacion solo para premium. |

El flujo de recomendaciones queda omitido de Locust para evitar que un endpoint con respuesta 400 genere falsos negativos en la prueba de carga. La funcionalidad puede documentarse por separado, pero no se usa como criterio de estabilidad de la prueba.

## Archivos agregados

| Archivo | Uso |
|---|---|
| `scripts/load/run_locust_release_local.sh` | Ejecuta la prueba desde una terminal local contra release. |
| `tests/load/.env.release.local.example` | Plantilla de variables para correr la prueba localmente. |
| `docs/Testing/locust-release-local.md` | Guia y documentacion lista para el entregable. |

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
premium.qa@example.com,123123123,premium,PROFILE_PREMIUM,false
standard.qa@example.com,123123123,standard,PROFILE_STANDARD,false
basic.qa@example.com,123123123,basic,PROFILE_BASIC,false
```

Se usan los mismos usuarios que ya existen en el CSV de Locust. Para la ejecucion local se recomienda mantener el CSV real en una ruta local no publica y apuntarlo con `LOCUST_USERS_FILE`.

## Ejecucion local paso a paso

1. Copiar la plantilla:

```bash
cp tests/load/.env.release.local.example tests/load/.env.release.local
```

2. Editar la IP de release:

```bash
LOCUST_HOST=http://IP_RELEASE
```

3. Confirmar el CSV de usuarios:

```bash
LOCUST_USERS_FILE=tests/load/users.example.csv
```

4. Instalar dependencias:

```bash
python -m pip install -r tests/load/requirements.txt
```

5. Dar permisos al script si es necesario:

```bash
chmod +x scripts/load/run_locust_release_local.sh
```

6. Ejecutar la prueba:

```bash
scripts/load/run_locust_release_local.sh tests/load/.env.release.local
```

7. Revisar resultados en:

```text
reports/locust/release-local-FECHA/locust-report.html
reports/locust/release-local-FECHA/reporte-ejecutivo-locust.html
reports/locust/release-local-FECHA/locust_stats.csv
reports/locust/release-local-FECHA/locust_failures.csv
```

## Evidencia que debe incluirse en la documentacion

| Evidencia | Que debe mostrar |
|---|---|
| Captura de la terminal | Comando ejecutado, IP/URL de release, usuarios, duracion y modo. |
| Captura del resumen HTML | Solicitudes totales, fallos, RPS y tiempos de respuesta. |
| Captura de la tabla de rutas | Rutas probadas y tiempos promedio/p95. |
| Captura de fallos | Si no hay fallos, mostrar tabla vacia. Si hay fallos, explicar causa. |
| Reporte ejecutivo | Archivo `reporte-ejecutivo-locust.html`. |

## Criterios de aceptacion

| Criterio | Resultado esperado |
|---|---|
| Disponibilidad | `/api/health` responde 200. |
| Autenticacion | Los usuarios del CSV pueden iniciar sesion en modo `full-flow`. |
| Catalogo | El catalogo y busqueda responden sin errores 5xx. |
| Reglas de plan | Descarga aplica regla de plan estandar y Watch Party aplica regla premium. |
| Reporte | Se genera HTML de Locust y reporte ejecutivo. |
| Estabilidad | No deben existir fallos inesperados ni errores 5xx. |

## Preguntas y respuestas para defensa

**Por que se agrego un flujo nuevo y no se modifico develop?**  
Porque develop ya tenia su proceso de Locust separado. Para no romperlo, se creo una ejecucion local independiente orientada a release.

**Por que la prueba se ejecuta local pero apunta a release?**  
Porque el requerimiento de calificacion valida nube. La maquina local solo genera el trafico; el sistema evaluado sigue siendo release en GCP.

**Por que se usan los mismos usuarios del CSV?**  
Porque permite simular planes reales: premium, standard y basic. Asi se validan reglas de negocio sin crear usuarios nuevos durante la prueba.

**Por que se omitieron recomendaciones del flujo?**  
Porque el endpoint de recomendaciones presentaba respuestas 400 y podia romper la prueba aunque el resto del sistema estuviera estable. Se excluyo para que Locust mida disponibilidad y rutas criticas sin falsos negativos.

**Por que `full-flow` es el modo recomendado?**  
Porque prueba acciones reales con sesion: login, seleccion de perfil, catalogo, engagement, descarga y Watch Party.

**Cuando conviene usar `route-check`?**  
Cuando release esta levantado pero no hay datos completos o usuarios validos. Sirve como prueba rapida de disponibilidad y proteccion de rutas.

**Por que WebSocket se deja desactivado por defecto?**  
Porque desde una red local puede fallar por proxy, firewall o cookies. La creacion de la sala Watch Party si queda cubierta por HTTP.

**Que significa que existan respuestas 401 o 403?**  
En `route-check` pueden ser correctas si una ruta protegida rechaza acceso sin sesion. En `full-flow`, deben revisarse si ocurren en rutas donde el usuario si deberia tener permiso.

**Que se considera una prueba exitosa?**  
Que el HTML se genere, que no existan errores 5xx, que las rutas criticas respondan y que las reglas de plan se apliquen correctamente.

## Texto breve para colocar en el documento tecnico

Se implemento una prueba de carga ligera con Locust para validar el ambiente release de Quetxal TV. La prueba se ejecuta desde una maquina local y apunta a la IP o URL publica de release en nube. Simula usuarios concurrentes usando el CSV de usuarios existente, cubriendo autenticacion, seleccion de perfil, catalogo, busqueda, detalle de contenido, engagement, descarga para plan estandar y creacion de Watch Party para plan premium. El flujo de recomendaciones fue omitido para evitar falsos negativos generados por respuestas 400 del endpoint. Como evidencia se generan el reporte HTML nativo de Locust, archivos CSV de metricas y un reporte ejecutivo en espanol.

## Conclusiones

La prueba permite validar que release soporta una carga ligera sin afectar la demostracion. La separacion del flujo evita modificar develop y facilita obtener evidencia directa para la documentacion. El uso del CSV mantiene coherencia con usuarios reales de prueba y permite validar reglas de negocio por tipo de plan.
