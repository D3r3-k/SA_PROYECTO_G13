[← Regresar](../../../README.md)

# Identity Service Database Migrations

Las migraciones están separadas por tipo de objeto para facilitar mantenimiento.

## Orden de ejecución

1. `01_extensions`
2. `02_tables`
3. `03_functions`
4. `04_views`
5. `05_procedures`
6. `06_triggers`

El archivo `00_run_migrations.sh` ejecuta las carpetas en ese orden cuando PostgreSQL inicia por primera vez desde Docker.

## Importante

Estas migraciones se ejecutan automáticamente desde Docker cuando la base de datos se crea por primera vez.

Si se necesita reconstruir la base local:

```bash
docker compose -f infra/docker-compose.local.yml down -v
docker compose -f infra/docker-compose.local.yml up --build


