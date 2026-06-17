# Backups Fase 2

Scripts para respaldo y restauración básica de las bases de datos PostgreSQL operacionales. Redis queda excluido porque es caché en memoria.

## Ejecutar backup

```bash
BACKUP_OUTPUT_DIR=./backups ./scripts/backup/postgres_backup.sh
```

El script detecta `IDENTITY_DATABASE_URL`, `CATALOG_DATABASE_URL`, `SUBSCRIPTION_DATABASE_URL` y `ENGAGEMENT_DATABASE_URL`. Si no existen, construye las URLs con variables `*_DB_HOST`, `*_DB_PORT`, `*_DB_NAME`, `*_DB_USER` y `*_DB_PASSWORD`.

## Restaurar backup

```bash
./scripts/backup/restore_postgres_backup.sh "postgresql://user:password@host:5432/db" ./backups/catalog_YYYYMMDDTHHMMSSZ.sql.gz
```
