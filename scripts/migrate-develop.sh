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

# ─── Asegurar cliente PostgreSQL en la VM ──────────────────────────────────────

echo "[migrate-develop.sh] Comprobando cliente PostgreSQL en la VM..."
if ! gcloud compute ssh "${VM}" --zone="${ZONE}" --tunnel-through-iap --command="command -v psql" >/dev/null 2>&1; then
  echo "[migrate-develop.sh] psql no encontrado en la VM. Instalando postgresql-client..."
  gcloud compute ssh "${VM}" --zone="${ZONE}" --tunnel-through-iap --command="sudo apt-get update && sudo apt-get install -y postgresql-client"
fi

# ─── Copiar archivos SQL a la VM ───────────────────────────────────────────────

echo "[migrate-develop.sh] Preparando estructura local de migraciones..."
LOCAL_TMP="quetxal-migrate"
rm -rf "${LOCAL_TMP}"
mkdir -p "${LOCAL_TMP}/identity" "${LOCAL_TMP}/catalog" "${LOCAL_TMP}/engagement" "${LOCAL_TMP}/subscription"

# Copiar archivos identity ordenados
cp -r services/identity-service/migrations/01_extensions "${LOCAL_TMP}/identity/"
cp -r services/identity-service/migrations/02_tables "${LOCAL_TMP}/identity/"
cp -r services/identity-service/migrations/03_functions "${LOCAL_TMP}/identity/"
cp -r services/identity-service/migrations/04_views "${LOCAL_TMP}/identity/"
cp -r services/identity-service/migrations/05_procedures "${LOCAL_TMP}/identity/"
cp -r services/identity-service/migrations/06_triggers "${LOCAL_TMP}/identity/"

# Copiar archivos unicos
cp services/catalog-service/migrations/001_init.sql "${LOCAL_TMP}/catalog/"
cp services/engagement-service/migrations/001_init.sql "${LOCAL_TMP}/engagement/"
cp services/subscription-service/migrations/001_init.sql "${LOCAL_TMP}/subscription/"

echo "[migrate-develop.sh] Transfiriendo archivos a la VM en una sola conexion..."
# Limpiar directorio remoto previo para evitar conflictos de permisos
gcloud compute ssh "${VM}" --zone="${ZONE}" --tunnel-through-iap --command="rm -rf ~/${LOCAL_TMP}"

# Subir la carpeta completa de forma recursiva al home de la VM
gcloud compute scp --recurse "${LOCAL_TMP}" "${VM}:~/" --zone="${ZONE}" --tunnel-through-iap

# Limpiar directorio local temporal
rm -rf "${LOCAL_TMP}"

echo "[migrate-develop.sh] Archivos copiados con exito."

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
