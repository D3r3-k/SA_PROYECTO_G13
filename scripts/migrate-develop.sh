#!/bin/bash
# migrate-develop.sh
# Ejecuta las migraciones de las 4 bases de datos en el ambiente develop.
# Se conecta a Cloud SQL via SSH a la VM de servicios usando gcloud IAP.
#
# Variables de entorno requeridas:
#   GCP_ZONE              - Zona de GCP (ej: us-central1-a)
#   VM_SERVICES_NAME      - Nombre de la VM de servicios (ej: dev-vm-services)
#   CLOUD_SQL_PRIVATE_IP  - IP privada de la instancia Cloud SQL
#   IDENTITY_DB_PASSWORD
#   CATALOG_DB_PASSWORD
#   ENGAGEMENT_DB_PASSWORD
#   SUBSCRIPTION_DB_PASSWORD

set -euo pipefail

ZONE="${GCP_ZONE}"
VM="${VM_SERVICES_NAME}"
SQL_IP="${CLOUD_SQL_PRIVATE_IP}"
REMOTE_DIR="~/quetxal-migrate"

echo "[migrate-develop.sh] Iniciando migraciones en ${VM} -> ${SQL_IP}"

# ─── Copiar archivos SQL a la VM ───────────────────────────────────────────────

echo "[migrate-develop.sh] Copiando archivos SQL a la VM..."

gcloud compute ssh "${VM}" --zone="${ZONE}" --tunnel-through-iap \
  --command="mkdir -p ${REMOTE_DIR}/identity ${REMOTE_DIR}/catalog ${REMOTE_DIR}/engagement ${REMOTE_DIR}/subscription"

# identity: directorios ordenados
gcloud compute scp --recurse \
  services/identity-service/migrations/01_extensions \
  services/identity-service/migrations/02_tables \
  services/identity-service/migrations/03_functions \
  services/identity-service/migrations/04_views \
  services/identity-service/migrations/05_procedures \
  services/identity-service/migrations/06_triggers \
  "${VM}:${REMOTE_DIR}/identity/" \
  --zone="${ZONE}" --tunnel-through-iap

# catalog, engagement, subscription: archivo unico
gcloud compute scp services/catalog-service/migrations/001_init.sql \
  "${VM}:${REMOTE_DIR}/catalog/001_init.sql" \
  --zone="${ZONE}" --tunnel-through-iap

gcloud compute scp services/engagement-service/migrations/001_init.sql \
  "${VM}:${REMOTE_DIR}/engagement/001_init.sql" \
  --zone="${ZONE}" --tunnel-through-iap

gcloud compute scp services/subscription-service/migrations/001_init.sql \
  "${VM}:${REMOTE_DIR}/subscription/001_init.sql" \
  --zone="${ZONE}" --tunnel-through-iap

echo "[migrate-develop.sh] Archivos copiados."

# ─── Funcion auxiliar: ejecutar psql via SSH ────────────────────────────────────

run_psql() {
  local db_user="$1"
  local db_pass="$2"
  local db_name="$3"
  local sql_file="$4"

  echo "[migrate-develop.sh] Migrando ${db_name} con ${sql_file}..."
  gcloud compute ssh "${VM}" --zone="${ZONE}" --tunnel-through-iap \
    --command="PGPASSWORD='${db_pass}' psql \
      -h '${SQL_IP}' -p 5432 \
      -U '${db_user}' -d '${db_name}' \
      -v ON_ERROR_STOP=1 \
      -f '${sql_file}'"
}

run_psql_dir() {
  local db_user="$1"
  local db_pass="$2"
  local db_name="$3"
  local dir="$4"

  echo "[migrate-develop.sh] Migrando ${db_name} desde directorio ${dir}..."
  gcloud compute ssh "${VM}" --zone="${ZONE}" --tunnel-through-iap \
    --command="
      for f in \$(ls '${dir}'/*.sql 2>/dev/null | sort); do
        echo \"  -> \$f\";
        PGPASSWORD='${db_pass}' psql \
          -h '${SQL_IP}' -p 5432 \
          -U '${db_user}' -d '${db_name}' \
          -v ON_ERROR_STOP=1 \
          -f \"\$f\";
      done"
}

# ─── identity_db: por directorios en orden ──────────────────────────────────────

for dir in 01_extensions 02_tables 03_functions 04_views 05_procedures 06_triggers; do
  run_psql_dir "identity_user" "${IDENTITY_DB_PASSWORD}" "identity_db" \
    "${REMOTE_DIR}/identity/${dir}"
done

# ─── catalog_db ─────────────────────────────────────────────────────────────────

run_psql "catalog_user" "${CATALOG_DB_PASSWORD}" "catalog_db" \
  "${REMOTE_DIR}/catalog/001_init.sql"

# ─── engagement_db ──────────────────────────────────────────────────────────────

run_psql "engagement_user" "${ENGAGEMENT_DB_PASSWORD}" "engagement_db" \
  "${REMOTE_DIR}/engagement/001_init.sql"

# ─── subscription_db ────────────────────────────────────────────────────────────

run_psql "subscription_user" "${SUBSCRIPTION_DB_PASSWORD}" "subscription_db" \
  "${REMOTE_DIR}/subscription/001_init.sql"

# ─── Limpieza ───────────────────────────────────────────────────────────────────

echo "[migrate-develop.sh] Limpiando archivos temporales en VM..."
gcloud compute ssh "${VM}" --zone="${ZONE}" --tunnel-through-iap \
  --command="rm -rf ${REMOTE_DIR}"

echo "[migrate-develop.sh] Migraciones completadas exitosamente."
