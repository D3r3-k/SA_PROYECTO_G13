# Deploy Local

Este directorio contiene la configuración necesaria para levantar el proyecto de manera local mediante Docker Compose.

## Requisitos Previos

Si es la primera vez que inicia el proyecto, asegúrese de cumplir con los siguientes pasos:

1. **Docker Desktop:** Debe estar instalado y en ejecución en el sistema.
2. **Archivo de variables de entorno:** Cree un archivo `.env` dentro de la carpeta `deploy/local/`.
3. **Credenciales de Google Cloud:** Posicione su archivo JSON de acceso en la ruta `secrets/gcp-service-account.json`.

> [!TIP]
> Puede utilizar el archivo `deploy/local/.env.example` como plantilla base, ya que incluye la configuración y los valores por defecto necesarios.

---

## Comandos de Despliegue

> [!IMPORTANT]
> Todos los comandos detallados en este documento deben ejecutarse en la consola ubicándose en la **raíz del proyecto** (la carpeta principal), y no dentro del directorio `deploy/local`.

### 1. Levantar el proyecto

Para compilar e iniciar todos los servicios, bases de datos y la interfaz gráfica, ejecute:

```powershell
docker compose --env-file deploy/local/.env -f deploy/local/docker-compose.yml up -d --build
```

> [!NOTE]
> El modificador `-d` (detached) ejecuta los contenedores en segundo plano, liberando la consola. El modificador `--build` asegura que se compilen los últimos cambios del código antes de levantar los servicios.

### 2. Detener el proyecto

Para detener la ejecución de los servicios conservando intactos los datos almacenados en las bases de datos, ejecute:

```powershell
docker compose --env-file deploy/local/.env -f deploy/local/docker-compose.yml down
```

### 3. Limpieza profunda del entorno

Para eliminar los contenedores, imágenes y destruir toda la información de las bases de datos locales para reiniciar el ambiente desde cero, utilice:

```powershell
docker compose --env-file deploy/local/.env -f deploy/local/docker-compose.yml down -v --rmi all
```

> [!WARNING]
> Este comando destruirá todos los contenedores, imágenes y volúmenes locales. Toda la información almacenada en las bases de datos locales será eliminada de forma permanente y en la próxima ejecución se deberán volver a construir o descargar las imágenes.
