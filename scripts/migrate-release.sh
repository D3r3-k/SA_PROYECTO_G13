#!/bin/bash
# migrate-release.sh
# Ejecuta las migraciones de las 4 bases de datos en el ambiente release (GKE).
# Crea Jobs efimeros de Kubernetes con imagen postgres:16-alpine que tienen
# acceso a la red privada del VPC donde vive Cloud SQL.
#
# Variables de entorno requeridas:
#   GKE_NAMESPACE
#   CLOUD_SQL_PRIVATE_IP
#   IDENTITY_DB_PASSWORD
#   CATALOG_DB_PASSWORD
#   ENGAGEMENT_DB_PASSWORD
#   SUBSCRIPTION_DB_PASSWORD

set -euo pipefail

NS="${GKE_NAMESPACE}"
SQL_IP="${CLOUD_SQL_PRIVATE_IP}"

echo "[migrate-release.sh] Iniciando migraciones en namespace ${NS} -> ${SQL_IP}"

# ─── Asegurar que el namespace existe ─────────────────────────────────────────

kubectl create namespace "${NS}" --dry-run=client -o yaml | kubectl apply -f -

# ─── Funcion: crear ConfigMap con SQL y correr Job efimero ────────────────────

run_migration_job() {
  local job_name="$1"
  local cm_name="$2"
  local db_user="$3"
  local db_pass="$4"
  local db_name="$5"
  local sql_content="$6"   # contenido SQL concatenado (pasado como string)

  echo "[migrate-release.sh] Preparando job ${job_name} para ${db_name}..."

  # Crear ConfigMap con el SQL
  kubectl create configmap "${cm_name}" \
    --namespace="${NS}" \
    --from-literal=migration.sql="${sql_content}" \
    --dry-run=client -o yaml | kubectl apply -f -

  # Construir manifiesto del Job
  cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: ${job_name}
  namespace: ${NS}
spec:
  ttlSecondsAfterFinished: 300
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: postgres:16-alpine
          command: ["/bin/sh", "-c"]
          args:
            - |
              echo "Ejecutando migracion para ${db_name}..."
              PGPASSWORD="${db_pass}" psql \
                -h "${SQL_IP}" -p 5432 \
                -U "${db_user}" -d "${db_name}" \
                -v ON_ERROR_STOP=1 \
                -f /sql/migration.sql
              echo "Migracion ${db_name} completada."
          volumeMounts:
            - name: sql-volume
              mountPath: /sql
      volumes:
        - name: sql-volume
          configMap:
            name: ${cm_name}
EOF

  echo "[migrate-release.sh] Esperando completacion del job ${job_name}..."
  if ! kubectl wait --for=condition=complete \
       "job/${job_name}" \
       --namespace="${NS}" \
       --timeout=300s; then
    echo "[migrate-release.sh] Error: job ${job_name} fallo. Logs:"
    kubectl logs "job/${job_name}" --namespace="${NS}" || true
    kubectl delete job "${job_name}" --namespace="${NS}" --ignore-not-found=true
    kubectl delete configmap "${cm_name}" --namespace="${NS}" --ignore-not-found=true
    exit 1
  fi

  echo "[migrate-release.sh] Job ${job_name} completado."

  # Limpiar recursos temporales
  kubectl delete job "${job_name}" --namespace="${NS}" --ignore-not-found=true
  kubectl delete configmap "${cm_name}" --namespace="${NS}" --ignore-not-found=true
}

# ─── Funcion: concatenar SQL de un directorio en orden ────────────────────────

concat_sql_dir() {
  local base_dir="$1"
  local sub_dirs=("$@")
  local result=""

  for dir in "${sub_dirs[@]:1}"; do
    for f in $(ls "${base_dir}/${dir}"/*.sql 2>/dev/null | sort); do
      result="${result}"$'\n'"$(cat "${f}")"
    done
  done

  echo "${result}"
}

# ─── identity_db: concatenar todos los directorios en orden ──────────────────

echo "[migrate-release.sh] Preparando SQL de identity_db..."
IDENTITY_SQL="$(concat_sql_dir \
  "services/identity-service/migrations" \
  "01_extensions" "02_tables" "03_functions" \
  "04_views" "05_procedures" "06_triggers")"

run_migration_job \
  "migrate-identity" \
  "migrate-identity-sql" \
  "identity_user" \
  "${IDENTITY_DB_PASSWORD}" \
  "identity_db" \
  "${IDENTITY_SQL}"

# ─── catalog_db ──────────────────────────────────────────────────────────────

CATALOG_SQL="$(cat services/catalog-service/migrations/001_init.sql)"

run_migration_job \
  "migrate-catalog" \
  "migrate-catalog-sql" \
  "catalog_user" \
  "${CATALOG_DB_PASSWORD}" \
  "catalog_db" \
  "${CATALOG_SQL}"

# ─── engagement_db ───────────────────────────────────────────────────────────

ENGAGEMENT_SQL="$(cat services/engagement-service/migrations/001_init.sql)"

run_migration_job \
  "migrate-engagement" \
  "migrate-engagement-sql" \
  "engagement_user" \
  "${ENGAGEMENT_DB_PASSWORD}" \
  "engagement_db" \
  "${ENGAGEMENT_SQL}"

# ─── subscription_db ─────────────────────────────────────────────────────────

SUBSCRIPTION_SQL="$(cat services/subscription-service/migrations/001_init.sql)"

run_migration_job \
  "migrate-subscription" \
  "migrate-subscription-sql" \
  "subscription_user" \
  "${SUBSCRIPTION_DB_PASSWORD}" \
  "subscription_db" \
  "${SUBSCRIPTION_SQL}"

echo "[migrate-release.sh] Todas las migraciones completadas exitosamente."
