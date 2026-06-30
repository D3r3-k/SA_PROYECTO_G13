#!/usr/bin/env bash
set -euo pipefail

# Ejecuta Locust solo desde una maquina local contra la IP/URL de release.
# Uso:
#   scripts/load/run_locust_release_local.sh tests/load/.env.release.local
#
# Variables principales:
#   LOCUST_HOST=http://IP_RELEASE
#   LOCUST_USERS_FILE=tests/load/users.example.csv
#   LOCUST_MODE=full-flow

ENV_FILE="${1:-}"
if [ -n "${ENV_FILE}" ]; then
  if [ ! -f "${ENV_FILE}" ]; then
    echo "No existe el archivo de variables: ${ENV_FILE}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [ -z "${LOCUST_HOST:-}" ]; then
  if [ -n "${RELEASE_LOCUST_HOST:-}" ]; then
    LOCUST_HOST="${RELEASE_LOCUST_HOST}"
  elif [ -n "${RELEASE_IP:-}" ]; then
    LOCUST_HOST="http://${RELEASE_IP}"
  else
    echo "Debe definir LOCUST_HOST, RELEASE_LOCUST_HOST o RELEASE_IP apuntando a release" >&2
    exit 1
  fi
fi

LOCUST_USERS="${LOCUST_USERS:-20}"
LOCUST_SPAWN_RATE="${LOCUST_SPAWN_RATE:-2}"
LOCUST_RUN_TIME="${LOCUST_RUN_TIME:-3m}"
LOCUST_MODE="${LOCUST_MODE:-full-flow}"
LOCUST_USERS_FILE="${LOCUST_USERS_FILE:-tests/load/users.example.csv}"
LOCUST_AUTO_SELECT_PROFILE="${LOCUST_AUTO_SELECT_PROFILE:-true}"

if [ "${LOCUST_MODE}" = "full-flow" ]; then
  LOCUST_STRICT_AUTH="${LOCUST_STRICT_AUTH:-true}"
else
  LOCUST_STRICT_AUTH="${LOCUST_STRICT_AUTH:-false}"
fi

# En ejecucion local se deja desactivado por defecto para evitar fallos por proxy/firewall.
LOCUST_ENABLE_WS="${LOCUST_ENABLE_WS:-false}"

if [ ! -f "${LOCUST_USERS_FILE}" ] && [ -z "${LOCUST_USERS_CSV:-}" ]; then
  echo "No existe LOCUST_USERS_FILE=${LOCUST_USERS_FILE} y no se definio LOCUST_USERS_CSV" >&2
  exit 1
fi

export LOCUST_MODE
export LOCUST_USERS_FILE
export LOCUST_AUTO_SELECT_PROFILE
export LOCUST_STRICT_AUTH
export LOCUST_ENABLE_WS
export LOCUST_CONTENT_IDS="${LOCUST_CONTENT_IDS:-}"
export LOCUST_SEARCH_TERMS="${LOCUST_SEARCH_TERMS:-accion,drama,comedia,familia,aventura}"

REPORT_DIR="reports/locust/release-local-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${REPORT_DIR}"

echo "Ejecutando Locust local contra release: ${LOCUST_HOST}"
echo "Modo: ${LOCUST_MODE} | Usuarios: ${LOCUST_USERS} | Spawn rate: ${LOCUST_SPAWN_RATE}/s | Duracion: ${LOCUST_RUN_TIME}"
echo "CSV de usuarios: ${LOCUST_USERS_FILE}"
echo "Recomendaciones: omitidas del flujo de Locust"

set +e
python -m locust \
  -f tests/load/locustfile.py \
  --host "${LOCUST_HOST}" \
  --headless \
  -u "${LOCUST_USERS}" \
  -r "${LOCUST_SPAWN_RATE}" \
  --run-time "${LOCUST_RUN_TIME}" \
  --html "${REPORT_DIR}/locust-report.html" \
  --csv "${REPORT_DIR}/locust" \
  --exit-code-on-error 1
LOCUST_STATUS="$?"
set -e

if [ -f "${REPORT_DIR}/locust_stats.csv" ]; then
  python scripts/load/generate_locust_executive_report.py \
    --stats "${REPORT_DIR}/locust_stats.csv" \
    --failures "${REPORT_DIR}/locust_failures.csv" \
    --output "${REPORT_DIR}/reporte-ejecutivo-locust.html" \
    --environment "release-local" \
    --mode "${LOCUST_MODE}" \
    --users "${LOCUST_USERS}" \
    --spawn-rate "${LOCUST_SPAWN_RATE}" \
    --run-time "${LOCUST_RUN_TIME}" \
    --target "${LOCUST_HOST}"
fi

echo "Reporte HTML generado en: ${REPORT_DIR}/locust-report.html"
echo "Reporte ejecutivo generado en: ${REPORT_DIR}/reporte-ejecutivo-locust.html"
exit "${LOCUST_STATUS}"
