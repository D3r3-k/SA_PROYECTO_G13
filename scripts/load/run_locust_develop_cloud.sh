#!/usr/bin/env bash
set -euo pipefail

# Uso:
#   scripts/load/run_locust_develop_cloud.sh tests/load/.env.develop
#
# Debe definir como minimo LOCUST_HOST. Para ambientes volatiles se recomienda:
#   LOCUST_MODE=route-check
#   LOCUST_STRICT_AUTH=false
#
# Para flujo completo:
#   LOCUST_MODE=full-flow
#   LOCUST_STRICT_AUTH=true
#   LOCUST_USERS_FILE=tests/load/users.real.csv

ENV_FILE="${1:-}"
if [[ -n "${ENV_FILE}" ]]; then
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "No existe el archivo de variables: ${ENV_FILE}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

: "${LOCUST_HOST:?Debe definir LOCUST_HOST apuntando al ambiente develop en nube}"

LOCUST_USERS="${LOCUST_USERS:-20}"
LOCUST_SPAWN_RATE="${LOCUST_SPAWN_RATE:-2}"
LOCUST_RUN_TIME="${LOCUST_RUN_TIME:-3m}"
LOCUST_MODE="${LOCUST_MODE:-route-check}"

if [[ "${LOCUST_MODE}" == "full-flow" ]]; then
  export LOCUST_STRICT_AUTH="${LOCUST_STRICT_AUTH:-true}"
  export LOCUST_ENABLE_WS="${LOCUST_ENABLE_WS:-true}"
else
  export LOCUST_STRICT_AUTH="${LOCUST_STRICT_AUTH:-false}"
  export LOCUST_ENABLE_WS="${LOCUST_ENABLE_WS:-false}"
fi

export LOCUST_MODE

REPORT_DIR="reports/locust/develop-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${REPORT_DIR}"

locust \
  -f tests/load/locustfile.py \
  --host="${LOCUST_HOST}" \
  --headless \
  -u "${LOCUST_USERS}" \
  -r "${LOCUST_SPAWN_RATE}" \
  --run-time "${LOCUST_RUN_TIME}" \
  --html "${REPORT_DIR}/locust-report.html" \
  --csv "${REPORT_DIR}/locust" \
  --exit-code-on-error 1

echo "Reporte generado en: ${REPORT_DIR}/locust-report.html"
