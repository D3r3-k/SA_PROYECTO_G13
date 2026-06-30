#!/usr/bin/env bash
set -euo pipefail

# Ejecuta Locust contra el Ingress y genera reporte HTML.


ENV_FILE="${1:-}"
if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "No existe el archivo de variables: $ENV_FILE" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${LOCUST_HOST:?Debe definir LOCUST_HOST con la URL publica del Ingress o dominio cloud}"

USERS="${LOCUST_USERS:-20}"
SPAWN_RATE="${LOCUST_SPAWN_RATE:-2}"
RUN_TIME="${LOCUST_RUN_TIME:-3m}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="reports/locust/${TIMESTAMP}"
HTML_REPORT="${REPORT_DIR}/locust-report.html"
CSV_PREFIX="${REPORT_DIR}/locust"

mkdir -p "$REPORT_DIR"

echo "Ejecutando Locust contra: ${LOCUST_HOST}"
echo "Usuarios: ${USERS} | Spawn rate: ${SPAWN_RATE}/s | Duracion: ${RUN_TIME}"
echo "Reporte HTML: ${HTML_REPORT}"

python -m locust \
  -f tests/load/locustfile.py \
  --host "${LOCUST_HOST}" \
  --headless \
  -u "${USERS}" \
  -r "${SPAWN_RATE}" \
  --run-time "${RUN_TIME}" \
  --html "${HTML_REPORT}" \
  --csv "${CSV_PREFIX}" \
  --exit-code-on-error 1

echo "Reporte generado en ${HTML_REPORT}"
